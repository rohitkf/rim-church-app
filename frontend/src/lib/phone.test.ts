import { describe, expect, it } from 'vitest'
import { checkPhone, countryOptions, formatPhoneInternational, isInternational, splitPhone } from './phone'

describe('checkPhone', () => {
  it('is empty when nothing is typed', () => {
    expect(checkPhone('GB', '  ').status).toBe('empty')
  })
  it('turns a UK mobile written with the 0 into E.164', () => {
    const r = checkPhone('GB', '07912 345678')
    expect(r.status).toBe('valid')
    expect(r.e164).toBe('+447912345678')
    expect(r.display).toBe('+44 7912 345678')
  })
  it('uses the chosen country', () => {
    expect(checkPhone('IN', '98765 43210').e164).toBe('+919876543210')
  })
  it('says too short, too long and wrong-for-the-country', () => {
    expect(checkPhone('GB', '0770').message).toMatch(/too short/)
    expect(checkPhone('GB', '07912345678123456').message).toMatch(/too long/)
    expect(checkPhone('GB', '0123456789').status).toBe('invalid')
    expect(checkPhone('GB', 'abc').message).toMatch(/digits/)
  })
})

describe('splitPhone', () => {
  it('reads E.164 into country and national number', () => {
    expect(splitPhone('+919876543210')).toEqual({ country: 'IN', national: '098765 43210' })
  })
  it('treats an old number as UK', () => {
    expect(splitPhone('07912 345678')).toEqual({ country: 'GB', national: '07912 345678' })
  })
  it('handles nothing', () => {
    expect(splitPhone(null)).toEqual({ country: 'GB', national: '' })
  })
})

describe('isInternational / format', () => {
  it('tells stored shapes apart', () => {
    expect(isInternational('+447912345678')).toBe(true)
    expect(isInternational('07912345678')).toBe(false)
    expect(isInternational(null)).toBe(false)
  })
  it('formats for reading and leaves junk alone', () => {
    expect(formatPhoneInternational('07912345678')).toBe('+44 7912 345678')
    expect(formatPhoneInternational('ask Sam')).toBe('ask Sam')
  })
})

describe('countryOptions', () => {
  it('puts the usual countries first', () => {
    const [common, all] = countryOptions()
    expect(common.options.map((o) => o.value)).toEqual(['GB', 'IN', 'IE', 'US'])
    expect(all.options.length).toBeGreaterThan(200)
  })
})
