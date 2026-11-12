/**
 * What became of an email (0283).
 *
 * Resend calls this — a webhook, set up in Resend for the email events —
 * each time something happens to an email the registration-email function
 * sent: delivered, delayed, bounced, held back because the address
 * bounced before, marked as spam, or never sent. Each of those emails
 * carries a reference as a tag (`rim_ref`); this finds the orders holding
 * that reference and writes down what happened, through
 * registration_email_event(), which only ever moves an order forward.
 *
 * Nobody signs in here: Resend has no account. What makes a call Resend's
 * is its signature, checked against RESEND_WEBHOOK_SECRET (the signing
 * secret Resend shows for the webhook) before a word of it is believed —
 * so `verify_jwt` is off for this function and the signature is the whole
 * of the door. Without the secret set, it answers 503 and writes nothing.
 *
 * It answers 200 to anything it has understood, including what it has no
 * use for (another kind of event, an email that is not a registration's):
 * Resend sends again whatever is not answered 200, for hours. Only a
 * failure to write is answered 500, because that one is worth sending again.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2.119.0'
import { emailNews, verifySignature } from './news.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET')
  if (!secret) return json({ error: 'not configured' }, 503)

  // The bytes as they came: the signature is of these, not of what they parse to.
  const body = await req.text()
  const signed = await verifySignature(
    secret,
    { id: req.headers.get('svix-id'), timestamp: req.headers.get('svix-timestamp'), signature: req.headers.get('svix-signature') },
    body,
    Date.now(),
  )
  if (!signed) return json({ error: 'Bad signature.' }, 401)

  let event: unknown
  try {
    event = JSON.parse(body)
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400)
  }
  const news = emailNews(event)
  if (!news) return json({ ok: true, ignored: true })

  // The service role: nobody who signs in may write what Resend said.
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data, error } = await admin.rpc('registration_email_event', { p_ref: news.ref, p_status: news.status, p_at: news.at, p_detail: news.detail })
  if (error) {
    console.error('could not write what became of an email', error.message)
    return json({ error: 'Could not write that.' }, 500)
  }
  return json({ ok: true, moved: typeof data === 'number' ? data : 0 })
})
