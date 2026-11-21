import { describe, expect, it, vi } from 'vitest'
import { domainOfAddress, mailDomainAccepts, mailDomainProblem } from './mailDomain'

const answers = (body: unknown, init: ResponseInit = {}) =>
  vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200, ...init })) as unknown as typeof fetch

describe('the part of an address that is asked about', () => {
  it('is what follows the @, lower case', () => {
    expect(domainOfAddress(' Ama.Serwaa@Gmail.COM ')).toBe('gmail.com')
    expect(domainOfAddress('a@mail.example.co.uk')).toBe('mail.example.co.uk')
  })

  it('is nothing when there is no @ with something either side', () => {
    expect(domainOfAddress('ama')).toBeNull()
    expect(domainOfAddress('@gmail.com')).toBeNull()
    expect(domainOfAddress('ama@')).toBeNull()
    expect(domainOfAddress('')).toBeNull()
  })
})

describe('asking whether a domain takes mail', () => {
  it('sends the domain and never the address', async () => {
    const get = answers({ domain: 'gmail.com', accepts: true })
    expect(await mailDomainAccepts('ama.serwaa@Gmail.com', get)).toBe(true)
    const asked = String(vi.mocked(get).mock.calls[0][0])
    expect(asked).toBe('/api/mail-domain?domain=gmail.com')
    expect(asked).not.toContain('ama')
  })

  it('is a no only when the server says so in as many words', async () => {
    expect(await mailDomainAccepts('ama@gmaill.example', answers({ accepts: false }))).toBe(false)
  })

  it('is not known, never a no, for everything else', async () => {
    // The server could not find out.
    expect(await mailDomainAccepts('a@example.com', answers({ accepts: null }))).toBeNull()
    // It answered something else entirely.
    expect(await mailDomainAccepts('a@example.com', answers({ ok: true }))).toBeNull()
    expect(await mailDomainAccepts('a@example.com', answers('false'))).toBeNull()
    expect(await mailDomainAccepts('a@example.com', answers({ accepts: 'no' }))).toBeNull()
    // A host with no such function answers with the app's own page.
    expect(await mailDomainAccepts('a@example.com', answers('<!doctype html><html></html>'))).toBeNull()
    // It failed.
    expect(await mailDomainAccepts('a@example.com', answers({ error: 'x' }, { status: 500 }))).toBeNull()
    expect(await mailDomainAccepts('a@example.com', answers({ error: 'x' }, { status: 400 }))).toBeNull()
    // No signal, or too slow.
    expect(await mailDomainAccepts('a@example.com', vi.fn(async () => { throw new TypeError('Failed to fetch') }) as unknown as typeof fetch)).toBeNull()
    expect(await mailDomainAccepts('a@example.com', vi.fn(async () => { throw new DOMException('timed out', 'TimeoutError') }) as unknown as typeof fetch)).toBeNull()
  })

  it('asks nothing of what is not an address', async () => {
    const get = answers({ accepts: false })
    expect(await mailDomainAccepts('ama', get)).toBeNull()
    expect(get).not.toHaveBeenCalled()
  })
})

describe('what is said when a domain takes no mail', () => {
  it('names the domain and points at it', () => {
    expect(mailDomainProblem('ama@Gmaill.example')).toBe('Nothing can receive email at “gmaill.example”. Check the part after the @.')
  })
})
