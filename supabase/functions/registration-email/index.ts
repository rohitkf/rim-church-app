/**
 * The ticket, by email (0247).
 *
 * Four things. Two are for people who never sign in:
 *
 *   { kind: 'confirm', code }         the ticket just made, to its own address
 *   { kind: 'resend', slug, email }   every live ticket that address holds for
 *                                     that event — "I have lost my ticket"
 *
 * and two are for the church, after it has looked at a payment — the
 * caller has to be signed in and allowed to work the door or run
 * registrations (registration_may_work), or the answer is no:
 *
 *   { kind: 'paid', code }            the payment is in: "your ticket is confirmed"
 *   { kind: 'unmatched', code }       nothing matches: "we could not find your payment"
 *
 * Nothing here takes an address from the caller and sends to it: a confirm
 * goes to the address on the order, and a resend goes to the address asked
 * about, with the tickets *it* holds, or nothing. So the most anybody can do
 * with the anon key is make somebody's own tickets reach them again — and
 * not more than once every ten minutes, which `email_sent_at` keeps. The
 * answer is the same whether or not an address has a registration, so the
 * list of who is coming cannot be read out of it. The church's two kinds
 * are not held to the quiet period: a confirmation a minute after a
 * registration is the point of them.
 *
 * One code, two meanings: until a paid order is paid the email calls it a
 * registration, to show at reception to pay; once it is paid, a ticket,
 * to show at the door. An order with no address (a walk-in) gets nothing.
 *
 * Sent through Resend, from REGISTRATION_FROM, with RESEND_API_KEY. Without
 * those two secrets it says so and sends nothing; the ticket page is the
 * ticket either way, the email only carries its link.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const QUIET_MINUTES = 10
const CHURCH = 'Rehoboth International Ministries'

type Kind = 'confirm' | 'resend' | 'paid' | 'unmatched'

interface Ticket {
  attendee_name: string | null
  unit_price_pence: number
  type: { name: string } | null
}
interface EventDate {
  starts_at: string
  ends_at: string | null
  label: string | null
  sort_order: number
}
interface Order {
  id: string
  code: string
  name: string
  email: string | null
  quantity: number
  total_pence: number
  payment_status: string
  payment_method: string | null
  proof_reference: string | null
  status: string
  email_sent_at: string | null
  tickets: Ticket[]
  date: EventDate | null
  event: {
    id: string
    slug: string
    title: string
    status: string
    location_name: string | null
    address: string | null
    payment_note: string | null
    allow_pay_at_reception: boolean
    dates: EventDate[]
  }
}

const ORDER_SELECT =
  'id, code, name, email, quantity, total_pence, payment_status, payment_method, proof_reference, status, email_sent_at, ' +
  'tickets:registration_order_tickets(attendee_name, unit_price_pence, type:registration_ticket_types(name)), ' +
  'date:registration_event_dates(starts_at, ends_at, label, sort_order), ' +
  'event:registration_events(id, slug, title, status, location_name, address, payment_note, allow_pay_at_reception, dates:registration_event_dates(starts_at, ends_at, label, sort_order))'

const pounds = (pence: number) => `£${(pence / 100).toFixed(2)}`
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const isPaid = (o: Order) => o.payment_status === 'not_needed' || o.payment_status === 'received' || o.payment_status === 'waived'

/** "Sat 21 Nov 2026, 6:30 pm – 9:00 pm", in the church's own clock. */
function whenWords(d: EventDate, tz: string): string {
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: tz })
  const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', timeZone: tz })
  const start = `${day(d.starts_at)}, ${time(d.starts_at)}`
  if (!d.ends_at) return start
  const sameDay = day(d.starts_at) === day(d.ends_at)
  return sameDay ? `${start} – ${time(d.ends_at)}` : `${start} – ${day(d.ends_at)}, ${time(d.ends_at)}`
}

const PAYMENT_WORDS: Record<string, string> = {
  not_needed: 'Nothing to pay',
  awaiting: 'Awaiting payment',
  reported: 'Receipt sent — being checked',
  received: 'Paid',
  waived: 'Paid (waived)',
}

/** What the email opens with, by kind and by whether the money is in. */
function opening(kind: Kind, orders: Order[]): { subject: string; lead: string } {
  const first = orders[0]
  const ev = first.event
  const many = orders.length > 1
  const allPaid = orders.every(isPaid)
  if (kind === 'paid') {
    return {
      subject: `Your ticket is confirmed: ${ev.title}`,
      lead: `Thank you — your payment of ${pounds(first.total_pence)} has been received. Here is your ticket.`,
    }
  }
  if (kind === 'unmatched') {
    const ref = first.proof_reference ? ` (reference ${first.proof_reference})` : ''
    return {
      subject: `About your payment for ${ev.title}`,
      lead:
        `We could not find a payment matching your registration${ref}. If you did pay, open your registration below and send the receipt again, with the reference your bank or the payment page shows. ` +
        `If not, you can pay from the same page${ev.allow_pay_at_reception ? ', or at reception on the day' : ''}. Your place is still held.`,
    }
  }
  if (allPaid) {
    return {
      subject: many ? `Your tickets for ${ev.title}` : `Your ticket: ${ev.title}`,
      lead: many ? `Here are your tickets for ${ev.title}.` : `You are registered for ${ev.title}. Here is your ticket.`,
    }
  }
  return {
    subject: many ? `Your registrations for ${ev.title}` : `Your registration: ${ev.title}`,
    lead: many
      ? `Here are your registrations for ${ev.title}. Each becomes a ticket once its payment is in.`
      : `You are registered for ${ev.title}. Your place is held; this becomes your ticket once the payment is in.`,
  }
}

function ticketEmail(kind: Kind, orders: Order[], siteUrl: string, tz: string): { subject: string; text: string; html: string } {
  const first = orders[0]
  const ev = first.event
  const { subject, lead } = opening(kind, orders)
  const dates = (o: Order) => (o.date ? [o.date] : [...ev.dates].sort((a, b) => a.sort_order - b.sort_order))
  const where = [ev.location_name, ev.address].filter(Boolean).join('\n')

  const blocks = orders.map((o) => {
    const link = `${siteUrl}/ticket/${o.code}`
    const paid = isPaid(o)
    const noun = paid ? 'ticket' : 'registration'
    const lines = o.tickets.map((t) => `${t.type?.name ?? 'Ticket'}${t.attendee_name ? ` · ${t.attendee_name}` : ''} · ${t.unit_price_pence ? pounds(t.unit_price_pence) : 'Free'}`)
    const pay =
      o.total_pence > 0
        ? `Total ${pounds(o.total_pence)} · ${PAYMENT_WORDS[o.payment_status] ?? o.payment_status}` +
          (o.payment_status === 'awaiting'
            ? `\nHow to pay is on your registration page, with ${o.code} as the reference — then send the receipt from there${ev.allow_pay_at_reception ? ', or pay at reception' : ''}.`
            : '')
        : ''
    const show = paid ? 'Show the QR code on it at the door.' : 'Show the QR code on it at reception to pay; once it is paid, it is your ticket for the door.'
    const text = [
      `${o.quantity} ${o.quantity === 1 ? 'ticket' : 'tickets'} for ${o.name}`,
      ...lines,
      pay,
      `${paid ? 'Ticket' : 'Registration'} code: ${o.code}`,
      `Your ${noun}: ${link}`,
      show,
    ]
      .filter(Boolean)
      .join('\n')
    const html = `
      <p style="margin:16px 0 4px;font-weight:600">${o.quantity} ${o.quantity === 1 ? 'ticket' : 'tickets'} for ${escape(o.name)}</p>
      <ul style="margin:0 0 8px;padding-left:18px">${lines.map((l) => `<li>${escape(l)}</li>`).join('')}</ul>
      ${pay ? `<p style="margin:0 0 8px">${escape(pay).replace(/\n/g, '<br>')}</p>` : ''}
      <p style="margin:0 0 8px;font-family:monospace">${paid ? 'Ticket' : 'Registration'} code: ${o.code}</p>
      <p style="margin:12px 0"><a href="${link}" style="display:inline-block;background:#0a66ff;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600">Open your ${noun}</a></p>
      <p style="margin:0 0 16px;color:#555;font-size:14px">${escape(show)} The link is your ${noun} — keep this email.</p>`
    return { text, html }
  })

  const whenText = dates(first).map((d) => `${whenWords(d, tz)}${d.label ? ` · ${d.label}` : ''}`).join('\n')
  const text = [
    `Hello ${first.name},`,
    '',
    lead,
    '',
    'When:',
    whenText,
    where ? `\nWhere:\n${where}` : '',
    ev.payment_note && kind !== 'paid' ? `\n${ev.payment_note}` : '',
    '',
    ...blocks.map((b) => b.text + '\n'),
    `— ${CHURCH}`,
  ]
    .filter((l) => l !== null)
    .join('\n')
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#14143a;line-height:1.45;max-width:560px;margin:0 auto;padding:24px 16px">
    <p style="margin:0 0 12px">Hello ${escape(first.name)},</p>
    <p style="margin:0 0 16px">${escape(lead).replace(escape(ev.title), `<strong>${escape(ev.title)}</strong>`)}</p>
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#777">When</p>
    <p style="margin:0 0 12px">${escape(whenText).replace(/\n/g, '<br>')}</p>
    ${where ? `<p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#777">Where</p><p style="margin:0 0 12px">${escape(where).replace(/\n/g, '<br>')}</p>` : ''}
    ${ev.payment_note && kind !== 'paid' ? `<p style="margin:0 0 12px;color:#555">${escape(ev.payment_note).replace(/\n/g, '<br>')}</p>` : ''}
    ${blocks.map((b) => b.html).join('<hr style="border:0;border-top:1px solid #e5e5ee;margin:8px 0">')}
    <p style="margin:24px 0 0;color:#777;font-size:13px">— ${CHURCH}</p>
  </body></html>`
  return { subject, text, html }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('REGISTRATION_FROM')
  const siteUrl = (Deno.env.get('SITE_URL') ?? 'https://rim-church-app.vercel.app').replace(/\/+$/, '')
  if (!apiKey || !from) return json({ ok: false, reason: 'not configured' })

  let payload: { kind?: string; code?: string; slug?: string; email?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400)
  }

  // The service role: these rows belong to nobody who signs in.
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: settings } = await admin.from('app_settings').select('timezone').limit(1).maybeSingle()
  const tz = (settings as { timezone?: string } | null)?.timezone ?? 'Europe/London'

  const kind = payload.kind as Kind | undefined
  let orders: Order[] = []
  if (kind === 'confirm' || kind === 'paid' || kind === 'unmatched') {
    if (kind !== 'confirm') {
      // The church's word, from somebody allowed to give it.
      const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
      const { data: who } = token ? await admin.auth.getUser(token) : { data: { user: null } }
      if (!who?.user) return json({ error: 'Sign in first.' }, 401)
      const { data: allowed, error: mayError } = await admin.rpc('registration_may_work', { uid: who.user.id })
      if (mayError) return json({ error: 'Could not check who is asking.' }, 500)
      if (!allowed) return json({ error: 'Only whoever runs registrations or works the door may send this.' }, 403)
    }
    const code = (payload.code ?? '').trim().toUpperCase()
    if (!/^[A-Z0-9]{12}$/.test(code)) return json({ error: 'That is not a ticket code.' }, 400)
    const { data, error } = await admin.from('registration_orders').select(ORDER_SELECT).eq('code', code).maybeSingle()
    if (error) return json({ error: 'Could not read that ticket.' }, 500)
    if (data) orders = [data as unknown as Order]
  } else if (kind === 'resend') {
    const slug = (payload.slug ?? '').trim().toLowerCase()
    const email = (payload.email ?? '').trim().toLowerCase()
    if (!slug || !email.includes('@') || email.length > 254) return json({ error: "That doesn't look like an email address." }, 400)
    const { data: ev } = await admin.from('registration_events').select('id').eq('slug', slug).maybeSingle()
    if (ev) {
      const { data, error } = await admin
        .from('registration_orders')
        .select(ORDER_SELECT)
        .eq('event_id', (ev as { id: string }).id)
        .eq('status', 'confirmed')
        .ilike('email', email.replace(/[\\%_]/g, (c) => `\\${c}`))
        .order('created_at', { ascending: true })
      if (error) return json({ error: 'Could not look that up.' }, 500)
      orders = (data ?? []) as unknown as Order[]
    }
  } else {
    return json({ error: 'Unknown kind.' }, 400)
  }

  // Nothing to send (no live order, or no address to send to), or — for
  // the attendee's own kinds — sent a moment ago: the same quiet answer.
  orders = orders.filter((o) => o.status === 'confirmed' && o.event && o.email)
  if (orders.length === 0) return json({ ok: true, sent: false })
  if (kind === 'confirm' || kind === 'resend') {
    const quietUntil = Date.now() - QUIET_MINUTES * 60_000
    if (orders.some((o) => o.email_sent_at && new Date(o.email_sent_at).getTime() > quietUntil)) return json({ ok: true, sent: false })
  }

  const to = orders[0].email!
  const mail = ticketEmail(kind, orders, siteUrl, tz)
  const sent = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject: mail.subject, text: mail.text, html: mail.html }),
  })
  if (!sent.ok) {
    const detail = await sent.text().catch(() => '')
    console.error('resend refused', sent.status, detail.slice(0, 300))
    return json({ ok: false, reason: 'not sent' })
  }

  await admin
    .from('registration_orders')
    .update({ email_sent_at: new Date().toISOString() })
    .in('id', orders.map((o) => o.id))
  return json({ ok: true, sent: true, count: orders.length })
})
