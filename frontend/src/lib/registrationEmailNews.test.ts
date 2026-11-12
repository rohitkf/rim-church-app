import { describe, expect, it } from 'vitest'
import { REF_TAG, TOLERANCE_SECONDS, emailNews, verifySignature } from '../../../supabase/functions/registration-email-status/news'
import senderSource from '../../../supabase/functions/registration-email/index.ts?raw'
import migration from '../../../supabase/migrations/0283_an_email_that_bounced_says_so.sql?raw'

/*
 * What Resend says about an email, as the registration-email-status
 * function reads it (0283). The function runs in Deno, where no test of
 * ours runs — so the two things it must get right, that the caller is
 * Resend and what was said, live in a file this can import.
 */

const base64 = (text: string) => btoa(text)
// A signing secret as Resend shows one: whsec_ and base64. Made up for the test.
const SECRET = `whsec_${base64('a-secret-only-this-test-knows-0001')}`
const NOW = Date.UTC(2026, 10, 12, 9, 0, 0)
const stamp = String(NOW / 1000)

/** Signed as Svix documents it: HMAC-SHA256 of id.timestamp.body under the secret's bytes, base64, after "v1,". */
async function sign(id: string, timestamp: string, body: string, secret = SECRET): Promise<string> {
  const raw = atob(secret.replace(/^whsec_/, ''))
  const key = await crypto.subtle.importKey('raw', Uint8Array.from(raw, (c) => c.charCodeAt(0)).buffer as ArrayBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)))
  return `v1,${btoa(String.fromCharCode(...mac))}`
}

const REF = '5d0c2f1e-9a1b-4c3d-8e7f-0123456789ab'
const bounced = {
  type: 'email.bounced',
  created_at: '2026-11-12T09:00:01.126Z',
  data: {
    email_id: '56761188-7520-42d8-8898-ff6fc54ce618',
    to: ['jerry4chrost@example.org'],
    subject: 'Payment needed: Harvest Supper',
    bounce: { message: 'The email account that you tried to reach does not exist.', subType: 'General', type: 'Permanent' },
    tags: { [REF_TAG]: REF },
  },
}

describe('whether a webhook is Resend’s', () => {
  const body = JSON.stringify(bounced)
  const headers = async (over: Partial<{ id: string | null; timestamp: string | null; signature: string | null }> = {}) => ({
    id: 'msg_2x',
    timestamp: stamp,
    signature: await sign('msg_2x', stamp, body),
    ...over,
  })

  it('agrees with the example Svix publishes: its secret, its message, its signature', async () => {
    // https://docs.svix.com/receiving/verifying-payloads/how-manual — not our arithmetic, theirs.
    const theirs = {
      id: 'msg_p5jXN8AQM9LWM0D4loKWxJek',
      timestamp: '1614265330',
      signature: 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=',
    }
    const then = 1614265330 * 1000
    expect(await verifySignature('whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw', theirs, '{"test": 2432232314}', then)).toBe(true)
    expect(await verifySignature('whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw', theirs, '{"test": 2432232315}', then)).toBe(false)
  })

  it('takes one signed with the secret', async () => {
    expect(await verifySignature(SECRET, await headers(), body, NOW)).toBe(true)
  })

  it('refuses a body that is not the one signed', async () => {
    expect(await verifySignature(SECRET, await headers(), body.replace('bounced', 'delivered'), NOW)).toBe(false)
  })

  it('refuses the same body written out again: the signature is of the bytes as sent', async () => {
    expect(await verifySignature(SECRET, await headers(), JSON.stringify(JSON.parse(body), null, 1), NOW)).toBe(false)
  })

  it('refuses a signature made with another secret', async () => {
    const other = `whsec_${base64('somebody-else-entirely')}`
    expect(await verifySignature(SECRET, await headers({ signature: await sign('msg_2x', stamp, body, other) }), body, NOW)).toBe(false)
  })

  it('refuses one signed for another message id or another time', async () => {
    expect(await verifySignature(SECRET, await headers({ id: 'msg_other' }), body, NOW)).toBe(false)
    expect(await verifySignature(SECRET, await headers({ timestamp: String(NOW / 1000 + 1) }), body, NOW)).toBe(false)
  })

  it('refuses a replay: correctly signed, but old', async () => {
    const old = String(NOW / 1000 - TOLERANCE_SECONDS - 1)
    expect(await verifySignature(SECRET, { id: 'msg_2x', timestamp: old, signature: await sign('msg_2x', old, body) }, body, NOW)).toBe(false)
    const recent = String(NOW / 1000 - TOLERANCE_SECONDS + 5)
    expect(await verifySignature(SECRET, { id: 'msg_2x', timestamp: recent, signature: await sign('msg_2x', recent, body) }, body, NOW)).toBe(true)
  })

  it('refuses one from the future by more than the same margin', async () => {
    const ahead = String(NOW / 1000 + TOLERANCE_SECONDS + 1)
    expect(await verifySignature(SECRET, { id: 'msg_2x', timestamp: ahead, signature: await sign('msg_2x', ahead, body) }, body, NOW)).toBe(false)
  })

  it('takes any one of several signatures, as during a rotated secret', async () => {
    const signature = `v1,${base64('not-it')} ${await sign('msg_2x', stamp, body)} v2,ignored`
    expect(await verifySignature(SECRET, await headers({ signature }), body, NOW)).toBe(true)
  })

  it('refuses a missing header, an empty secret, a signature that is not base64, a time that is not a number', async () => {
    expect(await verifySignature(SECRET, await headers({ id: null }), body, NOW)).toBe(false)
    expect(await verifySignature(SECRET, await headers({ timestamp: null }), body, NOW)).toBe(false)
    expect(await verifySignature(SECRET, await headers({ signature: null }), body, NOW)).toBe(false)
    expect(await verifySignature('', await headers(), body, NOW)).toBe(false)
    expect(await verifySignature('whsec_', await headers(), body, NOW)).toBe(false)
    expect(await verifySignature(SECRET, await headers({ signature: 'v1,***' }), body, NOW)).toBe(false)
    expect(await verifySignature(SECRET, await headers({ signature: (await sign('msg_2x', stamp, body)).slice(3) }), body, NOW)).toBe(false)
    expect(await verifySignature(SECRET, await headers({ timestamp: 'soon' }), body, NOW)).toBe(false)
  })
})

describe('what a webhook says', () => {
  it('reads a bounce: which email, that it bounced, when, and why', () => {
    expect(emailNews(bounced)).toEqual({
      ref: REF,
      status: 'bounced',
      at: '2026-11-12T09:00:01.126Z',
      detail: 'The email account that you tried to reach does not exist. (Permanent, General)',
    })
  })

  it('reads each thing that can become of an email', () => {
    const said = (type: string, extra: Record<string, unknown> = {}) => emailNews({ type, created_at: bounced.created_at, data: { tags: { [REF_TAG]: REF }, ...extra } })
    expect(said('email.sent')?.status).toBe('sent')
    expect(said('email.delivery_delayed')?.status).toBe('delayed')
    expect(said('email.delivered')).toEqual({ ref: REF, status: 'delivered', at: bounced.created_at, detail: null })
    expect(said('email.complained')?.status).toBe('complained')
    expect(said('email.suppressed', { suppressed: { message: 'On the account-level suppression list.', type: 'OnAccountSuppressionList' } })).toMatchObject({
      status: 'suppressed',
      detail: 'On the account-level suppression list.',
    })
    expect(said('email.failed', { failed: { reason: 'reached_daily_quota' } })).toMatchObject({ status: 'failed', detail: 'reached_daily_quota' })
  })

  it('has no use for an event that is not about delivery', () => {
    for (const type of ['email.opened', 'email.clicked', 'email.scheduled', 'contact.created', 'domain.updated', '']) {
      expect(emailNews({ type, created_at: bounced.created_at, data: { tags: { [REF_TAG]: REF } } }), type).toBeNull()
    }
  })

  it('has no use for an email that is not a registration’s: no reference, or not one of ours', () => {
    expect(emailNews({ ...bounced, data: { ...bounced.data, tags: {} } })).toBeNull()
    expect(emailNews({ ...bounced, data: { ...bounced.data, tags: undefined } })).toBeNull()
    expect(emailNews({ ...bounced, data: { ...bounced.data, tags: { category: 'confirm_email' } } })).toBeNull()
    expect(emailNews({ ...bounced, data: { ...bounced.data, tags: { [REF_TAG]: 'not-a-reference' } } })).toBeNull()
  })

  it('takes tags as a list of name and value too', () => {
    expect(emailNews({ ...bounced, data: { ...bounced.data, tags: [{ name: 'other', value: 'x' }, { name: REF_TAG, value: REF.toUpperCase() }] } })?.ref).toBe(REF)
  })

  it('keeps a bounce with no words, and a time it cannot read as no time', () => {
    expect(emailNews({ type: 'email.bounced', created_at: 'yesterday', data: { tags: { [REF_TAG]: REF } } })).toEqual({ ref: REF, status: 'bounced', at: null, detail: null })
  })

  it('keeps a long reason to what the column holds', () => {
    const long = emailNews({ ...bounced, data: { ...bounced.data, bounce: { message: 'x'.repeat(900) } } })
    expect(long?.detail).toHaveLength(500)
  })

  it('makes nothing of nonsense', () => {
    for (const junk of [null, undefined, 'email.bounced', 42, [], {}, { type: 'email.bounced' }, { type: 'email.bounced', data: 'no' }]) {
      expect(emailNews(junk)).toBeNull()
    }
  })
})

describe('the two functions and the database agree', () => {
  it('on the tag the reference travels in', () => {
    expect(senderSource).toContain(`const REF_TAG = '${REF_TAG}'`)
    expect(senderSource).toContain('tags: [{ name: REF_TAG, value: ref }]')
  })

  it('on what an email’s status can be', () => {
    const allowed = /email_status in \(([^)]+)\)/.exec(migration)?.[1].match(/[a-z]+/g) ?? []
    const read = ['email.sent', 'email.delivery_delayed', 'email.delivered', 'email.complained', 'email.bounced', 'email.suppressed', 'email.failed'].map(
      (type) => emailNews({ type, data: { tags: { [REF_TAG]: REF } } })?.status,
    )
    expect([...read].sort()).toEqual([...allowed].sort())
  })
})
