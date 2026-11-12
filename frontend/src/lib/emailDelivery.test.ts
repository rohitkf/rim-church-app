import { describe, expect, it } from 'vitest'
import { EMAIL_STATUSES, EMAIL_WATCH_MS, deliveryOf, deliveryWord, emailWantsDoing, looksLikeEmail, sameEmail, suggestEmail, watchesEmail } from './emailDelivery'
import migration from '../../../supabase/migrations/0283_an_email_that_bounced_says_so.sql?raw'

/*
 * What became of a registration's email (0283), as the pages say it.
 */

const order = (over: Partial<Parameters<typeof deliveryOf>[0]> = {}) => ({ email: 'ama@example.org', email_sent_at: '2026-11-10T18:44:00Z', email_status: null, anonymised_at: null, ...over })

describe('what became of an email', () => {
  it('says each status in a word, with a tone, and whether somebody should do something', () => {
    const said = (status: string | null, sent = true) => {
      const d = deliveryOf(order({ email_status: status, email_sent_at: sent ? '2026-11-10T18:44:00Z' : null }))
      return d && `${d.kind} | ${d.label} | ${d.tone} | ${d.wants ? 'wants' : 'fine'}`
    }
    expect(said('delivered')).toBe('delivered | Email delivered | green | fine')
    expect(said('complained')).toBe('delivered | Email delivered | green | fine')
    expect(said('sent')).toBe('waiting | Email sent | neutral | fine')
    expect(said('delayed')).toBe('waiting | Email delayed | orange | fine')
    expect(said('bounced')).toBe('bounced | Email bounced | red | wants')
    expect(said('suppressed')).toBe('bounced | Email bounced | red | wants')
    expect(said('failed')).toBe('failed | Email not sent | orange | wants')
    // Sent before any of this was kept: emailed, and that is all that is known.
    expect(said(null)).toBe('unknown | Emailed | neutral | fine')
    expect(said(null, false)).toBe('none | Not emailed | neutral | fine')
  })

  it('says why in a sentence, and tells a held-back email from a bounce', () => {
    expect(deliveryOf(order({ email_status: 'bounced' }))?.says).toBe('It could not be delivered. The address is probably wrong.')
    expect(deliveryOf(order({ email_status: 'suppressed' }))?.says).toContain('an earlier email to this address bounced')
    expect(deliveryOf(order({ email_status: 'complained' }))?.says).toContain('marked as spam')
    expect(deliveryOf(order({ email_status: null }))?.says).toContain('not known')
  })

  it('has nothing to say with no address, or once the details are blanked', () => {
    expect(deliveryOf(order({ email: null, email_status: 'bounced' }))).toBeNull()
    expect(deliveryOf(order({ email_status: 'bounced', anonymised_at: '2027-03-01T00:00:00Z' }))).toBeNull()
  })

  it('reads a status it has never heard of as nothing known, not as a crash', () => {
    expect(deliveryOf(order({ email_status: 'teleported' }))?.kind).toBe('unknown')
    expect(deliveryOf(order({ email_status: 'teleported', email_sent_at: null }))?.kind).toBe('none')
  })

  it('knows every status the database allows, and no other', () => {
    const allowed = /email_status in \(([^)]+)\)/.exec(migration)?.[1].match(/[a-z]+/g) ?? []
    expect([...EMAIL_STATUSES].sort()).toEqual([...allowed].sort())
    for (const status of allowed) expect(deliveryOf(order({ email_status: status }))?.kind, status).not.toBe('unknown')
  })

  it('wants doing only on a registration that is still live', () => {
    expect(emailWantsDoing({ ...order({ email_status: 'bounced' }), status: 'confirmed' })).toBe(true)
    expect(emailWantsDoing({ ...order({ email_status: 'failed' }), status: 'confirmed' })).toBe(true)
    expect(emailWantsDoing({ ...order({ email_status: 'bounced' }), status: 'cancelled' })).toBe(false)
    expect(emailWantsDoing({ ...order({ email_status: 'delayed' }), status: 'confirmed' })).toBe(false)
    expect(emailWantsDoing({ ...order({ email_status: 'delivered' }), status: 'confirmed' })).toBe(false)
    expect(emailWantsDoing({ ...order({ email: null, email_status: 'bounced' }), status: 'confirmed' })).toBe(false)
  })

  it('has one word for the spreadsheet', () => {
    expect(deliveryWord(order({ email_status: 'delivered' }))).toBe('Delivered')
    expect(deliveryWord(order({ email_status: 'complained' }))).toBe('Delivered')
    expect(deliveryWord(order({ email_status: 'bounced' }))).toBe('Bounced')
    expect(deliveryWord(order({ email_status: 'sent' }))).toBe('Sent')
    expect(deliveryWord(order({ email_status: 'delayed' }))).toBe('Delayed')
    expect(deliveryWord(order({ email_status: 'failed' }))).toBe('Not sent')
    expect(deliveryWord(order({ email_status: null }))).toBe('Emailed (not tracked)')
    expect(deliveryWord(order({ email_status: null, email_sent_at: null }))).toBe('Not emailed')
    expect(deliveryWord(order({ email: null }))).toBe('')
  })
})

describe('a slip in an address', () => {
  it('offers the right spelling of a well-known provider, keeping what is before the @ as typed', () => {
    expect(suggestEmail('ama@gmial.com')).toBe('ama@gmail.com')
    expect(suggestEmail('  Ama.Owusu+tickets@GMAIL.CON ')).toBe('Ama.Owusu+tickets@gmail.com')
    expect(suggestEmail('kofi@hotmial.com')).toBe('kofi@hotmail.com')
    expect(suggestEmail('kofi@hotmail.couk')).toBe('kofi@hotmail.co.uk')
    expect(suggestEmail('kofi@outlok.com')).toBe('kofi@outlook.com')
    expect(suggestEmail('kofi@yahooo.com')).toBe('kofi@yahoo.com')
    expect(suggestEmail('kofi@iclould.com')).toBe('kofi@icloud.com')
  })

  it('leaves alone an address spelt right, or one it knows nothing about', () => {
    for (const fine of ['ama@gmail.com', 'ama@hotmail.co.uk', 'ama@owusu.family', 'office@gmial.church', 'ama@gmail.com.au', '', 'ama', '@gmial.com']) {
      expect(suggestEmail(fine), fine).toBeNull()
    }
  })

  it('cannot see a slip before the @: that is what showing the address back is for', () => {
    expect(suggestEmail('jerryjohn4chrost@gmail.com')).toBeNull()
  })

  it('checks an address the way the database does', () => {
    for (const ok of ['a@b.co', ' ama@example.org ', 'first.last+tag@sub.example.org']) expect(looksLikeEmail(ok), ok).toBe(true)
    for (const no of ['', 'ama', 'ama@', 'ama@example', '@example.org', 'ama owusu@example.org', 'ama@@example.org']) expect(looksLikeEmail(no), no).toBe(false)
  })
})

describe('a ticket page waiting to hear about its email', () => {
  const now = Date.parse('2026-11-12T09:00:00Z')
  const view = (state: string, madeAgoMs = 60 * 60_000, email: string | null = 'ama@example.org') => ({ email, email_state: state, created_at: new Date(now - madeAgoMs).toISOString() })
  const page = (openedAgoMs = 10_000, askedAgoMs: number | null = null) => ({ openedAt: now - openedAgoMs, askedAt: askedAgoMs === null ? null : now - askedAgoMs })

  it('asks again while the email is on its way', () => {
    expect(watchesEmail(view('waiting'), page(), now)).toBe(true)
  })

  it('asks again on a registration made moments ago, whose email is about to go', () => {
    expect(watchesEmail(view('none', 5_000), page(), now)).toBe(true)
    expect(watchesEmail(view('none', 10 * 60_000), page(), now)).toBe(false)
  })

  it('stops once it has heard: delivered, or bounced', () => {
    expect(watchesEmail(view('delivered', 5_000), page(), now)).toBe(false)
    expect(watchesEmail(view('bounced', 5_000), page(), now)).toBe(false)
  })

  it('stops after a few minutes, however it stands', () => {
    expect(watchesEmail(view('waiting'), page(EMAIL_WATCH_MS - 1000), now)).toBe(true)
    expect(watchesEmail(view('waiting'), page(EMAIL_WATCH_MS + 1000), now)).toBe(false)
  })

  it('starts again when the page asks for an email: a corrected address, or "Email me this ticket"', () => {
    // Open for ten minutes, an old registration — but it has just asked.
    expect(watchesEmail(view('none'), page(10 * 60_000, 3_000), now)).toBe(true)
    expect(watchesEmail(view('waiting'), page(10 * 60_000, 30_000), now)).toBe(true)
    expect(watchesEmail(view('waiting'), page(10 * 60_000, EMAIL_WATCH_MS + 1000), now)).toBe(false)
    expect(watchesEmail(view('none'), page(10 * 60_000, 2.5 * 60_000), now)).toBe(false)
  })

  it('never asks for an order with no address, or before there is an order', () => {
    expect(watchesEmail(view('waiting', 5_000, null), page(), now)).toBe(false)
    expect(watchesEmail(null, page(), now)).toBe(false)
    expect(watchesEmail(undefined, page(), now)).toBe(false)
  })
})

describe('the same address typed twice', () => {
  it('is the same whatever the capitals, and whatever a keyboard left at the ends', () => {
    expect(sameEmail('ama@example.org', 'ama@example.org')).toBe(true)
    expect(sameEmail('Ama@Example.org', 'ama@example.org')).toBe(true)
    expect(sameEmail(' ama@example.org', 'ama@example.org  ')).toBe(true)
  })

  it('is not the same for a single letter out, which is the slip it is there to catch', () => {
    expect(sameEmail('ama@example.org', 'ama@exmaple.org')).toBe(false)
    expect(sameEmail('ama@example.org', 'ama@example.con')).toBe(false)
    expect(sameEmail('ama@example.org', 'amaa@example.org')).toBe(false)
    expect(sameEmail('ama@example.org', '')).toBe(false)
  })
})
