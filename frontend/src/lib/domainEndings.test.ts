import { describe, expect, it } from 'vitest'
import { DOMAIN_ENDINGS, DOMAIN_ENDINGS_VERSION } from './domainEndings'

/*
 * The list is copied in by hand, a thousand and more words at a time: a
 * copy that lost its newlines, kept its capitals or picked up the file's
 * comment line would let ".con" through or turn ".com" away.
 */
describe('the endings a domain can have', () => {
  it('is IANA’s list of that day, whole', () => {
    expect(DOMAIN_ENDINGS_VERSION).toMatch(/^\d{10}$/)
    expect(DOMAIN_ENDINGS.size).toBeGreaterThan(1400)
    expect(DOMAIN_ENDINGS.size).toBeLessThan(2500)
  })

  it('holds nothing but endings, lower-cased', () => {
    for (const ending of DOMAIN_ENDINGS) expect(ending).toMatch(/^[a-z0-9-]{2,63}$/)
  })

  it('has the ones everybody uses, and the countries one key from .com', () => {
    for (const ending of ['com', 'net', 'org', 'uk', 'in', 'us', 'ie', 'ng', 'gh', 'io', 'me', 'church', 'co', 'cm', 'om'])
      expect(DOMAIN_ENDINGS.has(ending), ending).toBe(true)
  })

  it('has none of the slips', () => {
    for (const slip of ['con', 'cmo', 'ocm', 'vom', 'xom', 'comm', 'coom', 'nte', 'ogr', 'couk', 'ku']) expect(DOMAIN_ENDINGS.has(slip), slip).toBe(false)
  })
})
