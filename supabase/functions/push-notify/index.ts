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
 */
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'jsr:@supabase/supabase-js@2'

// Kept in step with frontend/src/lib/notificationLink.ts. Two copies is the
// price of the sender living in Deno and the app in the browser; a type
// missing here still sends, it just lands on the dashboard.
const NOTIFICATIONS: Record<string, { label: string; href: string }> = {
  message: { label: 'New message board post', href: '/messages' },
  rota_release_request: { label: 'A team has asked to borrow one of your volunteers', href: '/rota' },
  rota_release_approved: { label: 'Your rota release request was approved', href: '/rota' },
  rota_release_denied: { label: 'Your rota release request was denied', href: '/rota' },
  team_join_requested: { label: 'Someone has asked to join your team', href: '/departments' },
  team_join_approved: { label: 'You have been added to a team', href: '/departments' },
  team_join_declined: { label: 'Your request to join a team was declined', href: '/departments' },
  availability_reminder: { label: 'Can you serve? Your team is waiting on you', href: '/availability' },
  checklist_reminder: { label: 'Your service checklist still has something on it', href: '/checklists' },
  team_alert: { label: 'A message from your team', href: '/messages' },
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

  const known = NOTIFICATIONS[type]
  const payload = JSON.stringify({
    title: 'Rehoboth International Ministries',
    // An alert someone wrote says what they wrote. This is the one thing
    // that puts author-written text on a lock screen, and it is text a head
    // deliberately sent to that person's phone.
    body: (row?.body as string | null) || known?.label || 'Something needs you in the app.',
    href:
      type === 'team_join_approved' && row?.reference_id
        ? `/departments/${row.reference_id}`
        : (known?.href ?? '/'),
    tag: type,
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
