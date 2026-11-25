/**
 * Send Web Push messages for a batch of notification rows.
 *
 * Called by the database when a transaction that wrote to
 * `public.notifications` commits (0291), with the ids of everything it
 * wrote, so the same rows that light the bell in the app also reach the
 * phones of people who have it shut. One call for forty people, not
 * forty: it asks the database once what is going where (`push_batch`,
 * 0290) and sends a few at a time.
 *
 * Deploy:
 *   supabase functions deploy push-notify        (two files: this and batch.ts)
 *   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.org
 * The database finds this function through two secrets in Vault,
 * `push_notify_url` and `push_notify_key`; migration 0291 says how they
 * are given on a new database. There is no webhook in the dashboard to
 * make any more.
 *
 * It answers when it has finished, and what it answers is what happened:
 * `{ sent, removed, failed }`. A push a phone's push service refused is
 * also written to App Health (`push_note_failures`), which until 0290
 * nothing could see.
 */
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'jsr:@supabase/supabase-js@2.119.0'
import { byDevice, endpointIsSane, failureLine, idsFrom, inPool, isGone, reasonFor, type Waiting } from './batch.ts'

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
  availability_closed: { label: 'Answers have closed for a service', href: '/availability' },
  clock_in_reminder: { label: 'Clock in when you arrive', href: '/' },
  clock_in_request: { label: 'Somebody is asking to be clocked in', href: '/' },
  clock_in_decided: { label: 'Your request to be clocked in was answered', href: '/' },
  prayer_private: { label: 'A private prayer request has come in', href: '/prayer?tab=inbox' },
  prayer_assigned: { label: 'You have been asked to pray for somebody', href: '/prayer?tab=assigned' },
  prayer_listed: { label: 'A request was added to a prayer list you are on', href: '/prayer?tab=lists' },
  prayer_update: { label: 'An update on a request you are praying for', href: '/prayer' },
  prayer_answered: { label: 'A prayer you were praying for has been answered', href: '/prayer?tab=testimonies' },
  location_prompt: { label: 'Please allow location for the app', href: '/location' },
  setup_prompt: { label: 'A few things are left to set up in the app', href: '/' },
  registration_sold_out: { label: 'A ticket type has sold out', href: '/registrations' },
  registration_message: { label: 'Somebody asked for help with an event', href: '/registrations' },
  call_time: { label: 'When your team is due in', href: '/rota' },
  health_note: { label: 'Something in the app has failed', href: '/settings/health' },
}

/*
 * What a person may turn off for themselves (`push_preferences`, 0185) is
 * the database's to apply now: `push_batch()` leaves out a board post or a
 * team chat line for whoever has switched that kind off, and everything
 * for a blocked account (0279). Every other kind always pushes, and so
 * does a kind nobody has listed: a new notification is far more likely to
 * matter than not, and silence would be the harder failure to notice.
 */

/** How many devices are being sent to at once. */
const SENDS_AT_ONCE = 16

/** How long one push service gets before it is counted as not answering. One that hangs must not hold the batch. */
const SEND_TIMEOUT_MS = 10_000

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
  // The database already sends the service-role key, so requiring it
  // costs nothing and closes the door.
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

  const ids = idsFrom(await req.json().catch(() => null))
  if (ids.length === 0) return new Response('ignored', { status: 200 })

  // One question for the whole batch: each notification still there, with
  // the devices it goes to. Whoever has turned that kind off, and whoever
  // is blocked, is already left out.
  const { data, error } = await supabase.rpc('push_batch', { p_ids: ids })
  if (error) return new Response(error.message, { status: 500 })
  const waiting = (data ?? []) as Waiting[]

  const payloads = new Map(waiting.map((row) => [row.id, payloadFor(row)]))

  let sent = 0
  const dead: string[] = []
  const failed: Record<string, number> = {}

  await inPool(byDevice(waiting), SENDS_AT_ONCE, async ({ device, rows }) => {
    // An address that is not a push service's is never called (0331): the
    // row stays for somebody to look at, and App Health says so.
    if (!endpointIsSane(device.endpoint)) {
      failed['endpoint refused'] = (failed['endpoint refused'] ?? 0) + rows.length
      return
    }
    for (const row of rows) {
      try {
        await webpush.sendNotification(
          { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
          payloads.get(row.id)!,
          { timeout: SEND_TIMEOUT_MS },
        )
        sent += 1
      } catch (err) {
        // 404/410 mean the browser threw the subscription away. The row
        // goes, and nothing more is sent to it. Anything else is
        // transient or ours to put right: the row stays and App Health
        // is told.
        if (isGone(err)) {
          dead.push(device.id)
          return
        }
        const reason = reasonFor(err)
        failed[reason] = (failed[reason] ?? 0) + 1
      }
    }
  })

  if (dead.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', dead)
  }

  const failures = Object.values(failed).reduce((sum, n) => sum + n, 0)
  const line = failureLine(failed, sent + failures)
  if (line) {
    // Best effort: a database that cannot take the note has bigger news
    // than this, and the pushes that did go have gone.
    await supabase.rpc('push_note_failures', { p_detail: line }).then(
      () => undefined,
      () => undefined,
    )
  }

  return new Response(JSON.stringify({ sent, removed: dead.length, failed: failures }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

/** What a phone is sent for one notification: the words, where a tap goes, and what it replaces. */
function payloadFor(row: Waiting): string {
  const known = NOTIFICATIONS[row.type]
  return JSON.stringify({
    title: 'Rehoboth International Ministries',
    // An alert someone wrote says what they wrote, and so do a board post
    // and a team chat line ("Name: what they said", 0185) — text written
    // for the people who can already read it there.
    body: row.body || known?.label || 'Something needs you in the app.',
    href: deepLink(row.type, row.reference_id) ?? known?.href ?? '/',
    // One on the lock screen per kind — per team's room for a chat — the
    // newest replacing the last, as the bell does.
    tag: row.type === 'team_chat' && row.reference_id ? `team_chat:${row.reference_id}` : row.type,
  })
}

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
