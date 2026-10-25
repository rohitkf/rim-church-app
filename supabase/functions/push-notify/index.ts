/**
 * Send a Web Push message for one notification row.
 *
 * Invoked by a Database Webhook on `public.notifications` INSERT, so the
 * same row that lights the bell in the app also reaches a phone whose owner
 * has the app shut. Everything it needs is in the row: who it is for, what
 * happened, and — through the type — which page it belongs to.
 *
 * Deploy:
 *   supabase functions deploy push-notify
 *   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.org
 * then add a Database Webhook: table `notifications`, event INSERT, calling
 * this function with the service-role key as the Authorization header.
 *
 * The webhook lives under Integrations → Webhooks in the dashboard
 * (/dashboard/project/_/integrations/webhooks/overview), not under Database
 * — it moved, and the old /database/hooks path is still linked from some
 * pages of the docs.
 */
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'jsr:@supabase/supabase-js@2'

// Kept in step with frontend/src/lib/notificationLink.ts. Two copies is the
// price of the sender living in Deno and the app in the browser; a type
// missing here still sends, it just lands on the dashboard.
//
// It has already drifted once — `team_poll` was added to the app and not to
// this list, so a poll would have buzzed a phone and then dropped whoever
// tapped it on the dashboard rather than in the room the question was asked
// in. Anything added to the app's list belongs here too. It drifted a
// second time (rota_dropout and the two availability-change types), so
// frontend/src/lib/notificationLink.test.ts now reads this file and fails
// the build when the two disagree.
const NOTIFICATIONS: Record<string, { label: string; href: string }> = {
  message: { label: 'New message board post', href: '/messages' },
  team_chat: { label: 'New message in your team chat', href: '/team-chat' },
  rota_release_request: { label: 'A team has asked to borrow one of your volunteers', href: '/rota' },
  rota_release_approved: { label: 'Your rota release request was approved', href: '/rota' },
  rota_release_denied: { label: 'Your rota release request was denied', href: '/rota' },
  team_join_requested: { label: 'Someone has asked to join your team', href: '/departments' },
  team_join_approved: { label: 'You have been added to a team', href: '/departments' },
  team_join_declined: { label: 'Your request to join a team was declined', href: '/departments' },
  availability_reminder: { label: 'Can you serve? Your team is waiting on you', href: '/availability' },
  checklist_reminder: { label: 'Your service checklist still has something on it', href: '/checklists' },
  team_alert: { label: 'A message from your team', href: '/messages' },
  announcement: { label: 'A message from the church', href: '/' },
  team_poll: { label: 'There is a poll for you', href: '/polls' },
  church_update: { label: 'News from the church', href: '/updates' },
  service_issue: { label: 'An issue has been raised for your team', href: '/issues' },
  feedback_received: { label: 'New feedback about the app', href: '/feedback' },
  feedback_answered: { label: 'Your feedback has an answer', href: '/feedback' },
  family_link_request: { label: 'Somebody has added you to their family', href: '/' },
  family_link_answered: { label: 'Your family request was answered', href: '/settings/profile' },
  tour_pushed: { label: 'A tour of the app is waiting for you', href: '/' },
  stage_template_request: { label: 'Somebody wants to keep a stage layout as a template', href: '/settings/stage' },
  stage_template_decided: { label: 'Your stage template request was answered', href: '/stage' },
  stage_move_request: { label: 'Somebody wants to move a locked block on a stage layout', href: '/stage' },
  stage_move_decided: { label: 'Your request to move a block was answered', href: '/stage' },
  mention: { label: 'Someone mentioned you', href: '/messages' },
  rota_dropout: { label: 'Somebody has dropped off your rota', href: '/rota' },
  availability_change_request: {
    label: 'Somebody is asking to change their answer',
    href: '/availability',
  },
  availability_change_decision: {
    label: 'Your request to change your answer was answered',
    href: '/availability',
  },
}

/**
 * What a person may turn off for themselves (`push_preferences`, 0185).
 *
 * The message board and team chat were bell-only for a long time, for fear
 * that a church of eighty posting all evening would buzz every phone until
 * everybody switched notifications off. The church asked for them on
 * phones anyway, so they push now, with two guards: the database keeps one
 * unread line per board and per team's room, the newest, so the bell does
 * not pile up; and each kind is a switch each person can turn off, which
 * quietens the phone and leaves the bell.
 *
 * Everything else is aimed at one person — a question to answer, a
 * decision waiting on them, a job before a service, a head deliberately
 * interrupting them — and always pushes. A type nobody has listed pushes
 * too: a new kind of notification is far more likely to matter than not,
 * and silence would be the harder failure to notice.
 */
const MUTED_BY: Record<string, 'board' | 'team_chat'> = {
  message: 'board',
  team_chat: 'team_chat',
}

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.org'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  // The service role, because reaching someone's devices means reading rows
  // that belong to them — which is exactly what RLS forbids the client.
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req) => {
  // Only the database may ask for a push.
  //
  // `verify_jwt` is not enough on its own: it accepts any JWT this project
  // signed, and the anon key is one of those — it ships in the frontend
  // bundle for anyone to read. Without this check, somebody with devtools
  // open could post a user_id and a line of their own text and have it
  // appear on that person's lock screen, wearing the church's name. The
  // ids are not secret either; every signed-in person can read `profiles`,
  // because that is what a roster is.
  //
  // The webhook already sends the service-role key, so requiring it costs
  // nothing and closes the door.
  //
  // Asking "is this string equal to our service key" turned out to be the
  // wrong question, and it cost a 403 on the very first webhook: a project
  // can hold two service-role credentials at once — the legacy JWT, which
  // is what the dashboard's "add auth header with service key" button
  // pastes into a webhook, and the newer `sb_secret_...` key, which is what
  // the edge runtime hands back for SUPABASE_SERVICE_ROLE_KEY. Both are the
  // service role. Neither equals the other.
  //
  // So the question is what the credential *says*, not what it matches —
  // but only where somebody has checked that it is telling the truth.
  // `verify_jwt` validates the Authorization bearer against the project
  // secret before this runs, so a role claim read from *that* header is
  // the platform's word; the anon key gets through the same door — it is
  // a valid JWT — which is the whole reason for this check, and it says
  // `anon`. The `apikey` header is not verified by anything, so a claim
  // read from it would be the caller's word: it is accepted only when it
  // *is* the secret key, verbatim, which is how an `sb_secret_...` key has
  // to travel (it is not a JWT and Authorization rejects it).
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const apikey = req.headers.get('apikey') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const isServiceKey = (c: string) => serviceKey !== '' && c !== '' && c === serviceKey
  const fromDatabase =
    isServiceKey(bearer) || isServiceKey(apikey) || (bearer !== '' && jwtRole(bearer) === 'service_role')
  if (!fromDatabase) {
    return new Response(JSON.stringify({ error: 'Not allowed.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    // Nothing to sign with. Say so plainly rather than failing per device.
    return new Response(JSON.stringify({ sent: 0, reason: 'no VAPID keys configured' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  const body = await req.json().catch(() => null)
  // A Database Webhook posts { type, table, record, old_record }.
  const row = body?.record ?? body
  const userId: string | undefined = row?.user_id
  const type: string | undefined = row?.type
  if (!userId || !type) return new Response('ignored', { status: 200 })

  // The bell already has it; this is only about the phone, and only if
  // they have not asked to be left alone for this kind.
  const muteKey = MUTED_BY[type]
  if (muteKey) {
    const { data: prefs } = await supabase
      .from('push_preferences')
      .select('board, team_chat')
      .eq('user_id', userId)
      .maybeSingle()
    if (prefs && prefs[muteKey] === false) {
      return new Response(JSON.stringify({ sent: 0, reason: `${type} is turned off for this person` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  const known = NOTIFICATIONS[type]
  const payload = JSON.stringify({
    title: 'Rehoboth International Ministries',
    // An alert someone wrote says what they wrote, and so do a board post
    // and a team chat line ("Name: what they said", 0185) — text written
    // for the people who can already read it there.
    body: (row?.body as string | null) || known?.label || 'Something needs you in the app.',
    href: deepLink(type, row?.reference_id as string | null | undefined) ?? known?.href ?? '/',
    // One on the lock screen per kind — per team's room for a chat — the
    // newest replacing the last, as the bell does.
    tag: type === 'team_chat' && row?.reference_id ? `team_chat:${row.reference_id}` : type,
  })

  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)
    .is('failed_at', null)
  if (error) return new Response(error.message, { status: 500 })

  let sent = 0
  const dead: string[] = []

  await Promise.all(
    (subscriptions ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        )
        sent += 1
      } catch (err) {
        // 404/410 mean the browser threw the subscription away — an
        // uninstalled app, a cleared profile. Anything else is transient
        // and worth keeping the row for.
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) dead.push(s.id)
      }
    }),
  )

  if (dead.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', dead)
  }

  return new Response(JSON.stringify({ sent, removed: dead.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

/**
 * The `role` a JWT claims, or null if the thing is not a JWT at all.
 *
 * Only the payload is read. That is safe for the Authorization bearer and
 * for nothing else — `verify_jwt` has checked that header's signature by
 * the time this runs, so an unsigned token claiming to be the service role
 * never reaches the function body on it. Never call this on `apikey`.
 */
function jwtRole(token: string): string | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const pad = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(pad + '='.repeat((4 - (pad.length % 4)) % 4)))
    return typeof claims?.role === 'string' ? claims.role : null
  } catch {
    return null
  }
}

/**
 * Where a notification of this kind actually goes, when the row carries
 * enough to be specific about it. The same exceptions the app makes.
 */
function deepLink(type: string, referenceId: string | null | undefined): string | null {
  if (!referenceId) return null
  if (type === 'team_join_approved') return `/departments/${referenceId}`
  if (type === 'team_chat') return `/team-chat?team=${referenceId}`
  // A poll's and an update's reference is the thing itself, so the link
  // opens the page at it.
  if (type === 'team_poll') return `/polls?poll=${referenceId}`
  if (type === 'church_update') return `/updates?update=${referenceId}`
  if (type === 'service_issue') return `/issues?issue=${referenceId}`
  if (type === 'feedback_received' || type === 'feedback_answered') return `/feedback?feedback=${referenceId}`
  return null
}
