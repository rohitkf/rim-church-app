import { describe, expect, it, vi } from 'vitest'
import { domainOf, mailDomain, mailDomainAnswer } from './_mailDomain.js'

/*
 * /api/mail-domain: whether anything can receive email at a domain. Only
 * a definite no turns anybody away, so most of this is about never saying
 * no when the truth is "could not ask".
 */

const fails = (code) => vi.fn(async () => { throw Object.assign(new Error(code), { code }) })
const gives = (rows) => vi.fn(async () => rows)
const dns = (over = {}) => ({ resolveMx: fails('ENODATA'), resolve4: fails('ENODATA'), resolve6: fails('ENODATA'), ...over })

describe('the domain that is asked about', () => {
  it('is lower case, trimmed, without the dot a full name ends in', () => {
    expect(domainOf(' Gmail.COM ')).toBe('gmail.com')
    expect(domainOf('mail.example.co.uk.')).toBe('mail.example.co.uk')
  })

  it('is refused when it is not a domain: an address, a path, one label, nothing', () => {
    for (const raw of ['ama@gmail.com', 'gmail', '', '   ', 'gmail..com', '-gmail.com', 'gmail.com/x', 'gma il.com', null, undefined, 7, 'a'.repeat(260) + '.com']) {
      expect(domainOf(raw)).toBeNull()
    }
  })
})

describe('whether a domain takes mail', () => {
  it('does when it publishes a mail server', async () => {
    const answer = await mailDomain('gmail.com', dns({ resolveMx: gives([{ exchange: 'gmail-smtp-in.l.google.com', priority: 5 }]) }))
    expect(answer.accepts).toBe('yes')
  })

  it('does not when there is no such domain, and asks nothing further', async () => {
    const asked = dns({ resolveMx: fails('ENOTFOUND') })
    expect(await mailDomain('gmaill.example', asked)).toEqual({ accepts: 'no', why: 'There is no such domain.' })
    expect(asked.resolve4).not.toHaveBeenCalled()
  })

  it('does not when it says it takes no mail (a null MX)', async () => {
    expect((await mailDomain('example.com', dns({ resolveMx: gives([{ exchange: '', priority: 0 }]) }))).accepts).toBe('no')
    expect((await mailDomain('example.com', dns({ resolveMx: gives([{ exchange: '.', priority: 0 }]) }))).accepts).toBe('no')
  })

  it('does when it has no mail server but an address of its own, of either kind', async () => {
    expect((await mailDomain('old.example', dns({ resolve4: gives(['192.0.2.1']) }))).accepts).toBe('yes')
    expect((await mailDomain('old.example', dns({ resolve6: gives(['2001:db8::1']) }))).accepts).toBe('yes')
    // An empty answer for mail servers is the same as none.
    expect((await mailDomain('old.example', dns({ resolveMx: gives([]), resolve4: gives(['192.0.2.1']) }))).accepts).toBe('yes')
  })

  it('does not when it has neither a mail server nor an address', async () => {
    expect(await mailDomain('parked.example', dns())).toEqual({ accepts: 'no', why: 'It has no mail server and no address.' })
  })

  it('is unknown, never no, when the DNS could not be asked', async () => {
    for (const code of ['ETIMEOUT', 'ESERVFAIL', 'ECONNREFUSED', 'EREFUSED', 'ECANCELLED']) {
      expect((await mailDomain('example.com', dns({ resolveMx: fails(code) }))).accepts).toBe('unknown')
    }
    // No mail server for certain, but the address could not be asked about: still not a no.
    expect((await mailDomain('example.com', dns({ resolve4: fails('ETIMEOUT') }))).accepts).toBe('unknown')
    expect((await mailDomain('example.com', dns({ resolve6: fails('ESERVFAIL') }))).accepts).toBe('unknown')
    // An address found settles it, whatever else failed.
    expect((await mailDomain('example.com', dns({ resolve4: fails('ETIMEOUT'), resolve6: gives(['2001:db8::1']) }))).accepts).toBe('yes')
  })

  it('never throws, whatever the resolver does', async () => {
    const broken = { resolveMx: vi.fn(async () => { throw 'a string, not an error' }), resolve4: fails('ETIMEOUT'), resolve6: fails('ETIMEOUT') }
    expect((await mailDomain('example.com', broken)).accepts).toBe('unknown')
  })
})

describe('the answer the app is given', () => {
  it('is yes or no as true or false, kept for a while', () => {
    expect(mailDomainAnswer('gmail.com', { accepts: 'yes', why: 'It publishes a mail server.' })).toEqual({
      status: 200,
      body: { domain: 'gmail.com', accepts: true, why: 'It publishes a mail server.' },
      cache: 'public, max-age=300, s-maxage=3600',
    })
    expect(mailDomainAnswer('nope.example', { accepts: 'no', why: 'There is no such domain.' }).body.accepts).toBe(false)
  })

  it('is null when it is not known, and that is never kept', () => {
    const answer = mailDomainAnswer('example.com', { accepts: 'unknown', why: 'The DNS could not be asked.' })
    expect(answer.body.accepts).toBeNull()
    expect(answer.cache).toBe('no-store')
  })

  it('is a 400 when no domain was asked about', () => {
    const answer = mailDomainAnswer(null, null)
    expect(answer.status).toBe(400)
    expect(answer.cache).toBe('no-store')
  })
})
