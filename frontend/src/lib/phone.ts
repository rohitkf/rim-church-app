import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/min'

/*
 * Phone numbers, kept in one shape.
 *
 * A number typed as "07700 900123" means nothing outside the UK and is
 * ambiguous inside a list that has people from elsewhere in it. So numbers
 * are stored in E.164 — "+447700900123" — in the same text column as
 * before, and shown with the country they belong to. Numbers saved before
 * this were mostly UK mobiles written with a leading 0; those still read
 * fine (a leading 0 is taken as the UK) and are offered a country code the
 * next time the person is in the app.
 *
 * Nothing here is a database rule: a CHECK on the column would refuse any
 * update to a row that still holds an old number, including updates that
 * had nothing to do with the phone.
 */

export const DEFAULT_COUNTRY: CountryCode = 'GB'

/** Where this congregation comes from, shown first. */
const COMMON: CountryCode[] = ['GB', 'IN', 'IE', 'US']

export interface PhoneCountry {
  code: CountryCode
  name: string
  dial: string
}

let cache: PhoneCountry[] | null = null

function nameOf(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

export function phoneCountries(): PhoneCountry[] {
  if (!cache) {
    cache = getCountries().map((code) => ({
      code,
      name: nameOf(code),
      dial: `+${getCountryCallingCode(code)}`,
    }))
  }
  return cache
}

export function countryByCode(code: string): PhoneCountry | undefined {
  return phoneCountries().find((c) => c.code === code)
}

/** Options for the app's grouped Select: the usual few, then everywhere A–Z. */
export function countryOptions() {
  const all = phoneCountries()
  const label = (c: PhoneCountry) => `${c.name} (${c.dial})`
  const common = COMMON.map((code) => all.find((c) => c.code === code)!).filter(Boolean)
  const rest = all
    .filter((c) => !COMMON.includes(c.code))
    .sort((a, b) => a.name.localeCompare(b.name))
  return [
    { label: 'Common', options: common.map((c) => ({ value: c.code, label: label(c) })) },
    { label: 'All countries', options: rest.map((c) => ({ value: c.code, label: label(c) })) },
  ]
}

export interface SplitPhone {
  country: CountryCode
  /** What goes in the box: the number without its country code. */
  national: string
}

/** A stored (or typed) number, taken apart for the form. */
export function splitPhone(value: string | null | undefined, fallback: CountryCode = DEFAULT_COUNTRY): SplitPhone {
  const text = (value ?? '').trim()
  if (!text) return { country: fallback, national: '' }
  const parsed = parsePhoneNumberFromString(text, fallback)
  if (parsed?.country && text.startsWith('+')) {
    return { country: parsed.country, national: parsed.formatNational() }
  }
  if (parsed && text.startsWith('+')) {
    // A calling code shared by several countries (+1): the first will do.
    return { country: fallback, national: parsed.formatNational() }
  }
  return { country: fallback, national: text }
}

export type PhoneStatus = 'empty' | 'valid' | 'invalid'

export interface PhoneCheck {
  status: PhoneStatus
  /** E.164, when valid. */
  e164: string
  /** Why not, in words, when invalid. */
  message: string
  /** How it will read, when valid. */
  display: string
}

const EMPTY: PhoneCheck = { status: 'empty', e164: '', message: '', display: '' }

export function checkPhone(country: CountryCode, national: string): PhoneCheck {
  const text = national.trim()
  if (!text) return EMPTY
  const where = countryByCode(country)?.name ?? country
  if (!/^[+\d\s().-]+$/.test(text)) {
    return { ...EMPTY, status: 'invalid', message: 'Use digits only — spaces and dashes are fine.' }
  }
  const parsed = parsePhoneNumberFromString(text, country)
  if (parsed?.isValid()) {
    return { status: 'valid', e164: parsed.number, message: '', display: parsed.formatInternational() }
  }
  const digits = text.replace(/\D/g, '')
  const reason = !parsed || !parsed.isPossible()
    ? digits.length < 7
      ? 'That looks too short.'
      : digits.length > 12
        ? 'That looks too long.'
        : `That doesn’t look like a ${where} number.`
    : `That doesn’t look like a ${where} number.`
  return { ...EMPTY, status: 'invalid', message: reason }
}

/** Is this stored value already a full international number? */
export function isInternational(value: string | null | undefined): boolean {
  const text = (value ?? '').trim()
  if (!text.startsWith('+')) return false
  return parsePhoneNumberFromString(text)?.isValid() ?? false
}

/** For people to read: "+44 7700 900123". Falls back to what was stored. */
export function formatPhoneInternational(value: string | null | undefined): string {
  const text = (value ?? '').trim()
  if (!text) return ''
  const parsed = parsePhoneNumberFromString(text, DEFAULT_COUNTRY)
  return parsed?.isValid() ? parsed.formatInternational() : text
}
