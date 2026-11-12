/**
 * Reading what Resend says about an email (0283): is it really Resend
 * saying it, and what does it say.
 *
 * Kept apart from index.ts, and free of anything only Deno has, so the
 * app's tests can run it (frontend/src/lib/registrationEmailNews.test.ts).
 * A webhook nobody has checked the signature of is a way for anybody to
 * tell the church an email bounced.
 */

/** The tag an email's reference travels in; registration-email/index.ts writes the same one. */
export const REF_TAG = 'rim_ref'

/** How far a webhook's clock may be from ours, either way, before it is refused: a replay is old. */
export const TOLERANCE_SECONDS = 5 * 60

export interface SignatureHeaders {
  id: string | null
  timestamp: string | null
  signature: string | null
}

const bytesOf = (base64: string): Uint8Array | null => {
  try {
    const raw = atob(base64)
    const out = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

/** The same length of time whatever the two hold, so a wrong signature tells nothing by how fast it fails. */
function same(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i]
  return diff === 0
}

/**
 * Whether a webhook is Resend's (Svix signs them): HMAC-SHA256 of
 * `id.timestamp.body` with the endpoint's secret, base64, sent as
 * `v1,<signature>` — several, space-separated, while a secret is rotated.
 * The body is the bytes as they arrived; parsed and written out again it
 * no longer matches.
 */
export async function verifySignature(secret: string, headers: SignatureHeaders, body: string, nowMs: number): Promise<boolean> {
  const { id, timestamp, signature } = headers
  if (!secret || !id || !timestamp || !signature) return false
  const seconds = Number(timestamp)
  if (!Number.isFinite(seconds) || Math.abs(nowMs / 1000 - seconds) > TOLERANCE_SECONDS) return false
  const keyBytes = bytesOf(secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret)
  if (!keyBytes || keyBytes.length === 0) return false
  // Its own buffer, exactly its length (bytesOf made it so).
  const key = await crypto.subtle.importKey('raw', keyBytes.buffer as ArrayBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)))
  for (const part of signature.split(' ')) {
    const [version, value] = part.split(',')
    if (version !== 'v1' || !value) continue
    const given = bytesOf(value)
    if (given && same(given, expected)) return true
  }
  return false
}

/** What the database calls each thing Resend can say about an email. */
const STATUS: Record<string, EmailStatus> = {
  'email.sent': 'sent',
  'email.delivery_delayed': 'delayed',
  'email.delivered': 'delivered',
  'email.complained': 'complained',
  'email.bounced': 'bounced',
  'email.suppressed': 'suppressed',
  'email.failed': 'failed',
}
export type EmailStatus = 'sent' | 'delayed' | 'delivered' | 'complained' | 'bounced' | 'suppressed' | 'failed'

export interface EmailNews {
  /** The reference the email was sent with: which orders it was for. */
  ref: string
  status: EmailStatus
  /** When Resend says it happened; null if it does not say. */
  at: string | null
  /** Why, where there is a why: the bounce's own words. */
  detail: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** The email's reference, from its tags: an object by name, or — in older payloads — a list of name and value. */
function refOf(tags: unknown): string {
  if (Array.isArray(tags)) {
    const found = tags.find((t) => (t as { name?: unknown } | null)?.name === REF_TAG) as { value?: unknown } | undefined
    return text(found?.value)
  }
  if (tags && typeof tags === 'object') return text((tags as Record<string, unknown>)[REF_TAG])
  return ''
}

/**
 * What a webhook says about one of our emails — or null: not about an
 * email's delivery (opened, clicked, a contact, a domain), or about an
 * email that is not a registration's (a password reset goes through the
 * same account and carries no reference).
 */
export function emailNews(event: unknown): EmailNews | null {
  const e = event as { type?: unknown; created_at?: unknown; data?: Record<string, unknown> } | null
  const status = STATUS[text(e?.type)]
  if (!e || !status || !e.data || typeof e.data !== 'object') return null
  const ref = refOf(e.data.tags)
  if (!UUID.test(ref)) return null
  const at = text(e.created_at)
  const said = (key: string, field: string) => text((e.data?.[key] as Record<string, unknown> | undefined)?.[field])
  let detail = ''
  if (status === 'bounced') {
    const kind = [said('bounce', 'type'), said('bounce', 'subType')].filter(Boolean).join(', ')
    detail = [said('bounce', 'message'), kind && `(${kind})`].filter(Boolean).join(' ')
  } else if (status === 'suppressed') {
    detail = said('suppressed', 'message')
  } else if (status === 'failed') {
    detail = said('failed', 'reason')
  }
  return {
    ref: ref.toLowerCase(),
    status,
    at: at && !Number.isNaN(Date.parse(at)) ? at : null,
    detail: detail ? detail.slice(0, 500) : null,
  }
}
