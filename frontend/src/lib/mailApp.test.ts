import { describe, expect, it } from 'vitest'
import { ANDROID_EMAIL_INTENT, APPLE_MAIL, deviceFrom, domainOf, planFor, providerFor } from './mailApp'

describe('which device', () => {
  it('knows Android, iPhone, iPad (even asking for the desktop site) and a computer', () => {
    expect(deviceFrom({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126' })).toBe('android')
    expect(deviceFrom({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari' })).toBe('ios')
    expect(deviceFrom({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe('ios')
    expect(deviceFrom({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe('desktop')
    expect(deviceFrom({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126' })).toBe('desktop')
  })
})

describe('the address', () => {
  it('takes the domain after the last @, lower-cased', () => {
    expect(domainOf('Ada@Gmail.COM')).toBe('gmail.com')
    expect(domainOf('"a@b"@work.org')).toBe('work.org')
    expect(domainOf('nobody')).toBeNull()
    expect(domainOf('@x.com')).toBeNull()
    expect(domainOf('a@')).toBeNull()
  })

  it('knows the webmail it can name, with country variants', () => {
    for (const [address, name] of [
      ['a@gmail.com', 'Gmail'],
      ['a@googlemail.com', 'Gmail'],
      ['a@outlook.com', 'Outlook'],
      ['a@hotmail.co.uk', 'Outlook'],
      ['a@live.com', 'Outlook'],
      ['a@yahoo.co.uk', 'Yahoo Mail'],
      ['a@ymail.com', 'Yahoo Mail'],
      ['a@icloud.com', 'iCloud Mail'],
      ['a@me.com', 'iCloud Mail'],
      ['a@proton.me', 'Proton Mail'],
      ['a@aol.com', 'AOL Mail'],
    ] as const) {
      expect(providerFor(address)?.name, address).toBe(name)
    }
  })

  it('does not guess at a work, school or custom domain', () => {
    expect(providerFor('a@church.org.uk')).toBeNull()
    expect(providerFor('a@notgmail.com')).toBeNull()
    expect(providerFor('a@gmail.com.evil.example')).toBeNull()
    expect(providerFor('a@outlook.evil.example.com.au')).toBeNull()
  })

  it('opens Gmail on the signed-in account for that address', () => {
    expect(providerFor('ada+rim@gmail.com')?.web('ada+rim@gmail.com')).toBe(
      'https://mail.google.com/mail/?authuser=ada%2Brim%40gmail.com',
    )
  })
})

describe('where Open email goes', () => {
  it('on Android, to the system chooser of mail apps, whatever the address — with webmail beside it when it is known', () => {
    expect(planFor('a@church.org.uk', 'android')).toEqual({ open: { href: ANDROID_EMAIL_INTENT, newTab: false }, web: null })
    const plan = planFor('a@gmail.com', 'android')
    expect(plan.open).toEqual({ href: ANDROID_EMAIL_INTENT, newTab: false })
    expect(plan.web?.provider).toBe('Gmail')
    expect(ANDROID_EMAIL_INTENT).toContain('category.APP_EMAIL')
  })

  it('on an iPhone, to the provider’s inbox when known, otherwise to Apple Mail', () => {
    expect(planFor('a@outlook.com', 'ios').open).toEqual({ href: 'https://outlook.live.com/mail/0/inbox', newTab: false })
    expect(planFor('a@church.org.uk', 'ios').open).toEqual({ href: APPLE_MAIL, newTab: false })
    expect(planFor('a@gmail.com', 'ios').web).toBeNull()
  })

  it('on a computer, to the provider’s webmail in a new tab, or nowhere when it cannot be named', () => {
    expect(planFor('a@yahoo.com', 'desktop').open).toEqual({ href: 'https://mail.yahoo.com/', newTab: true })
    expect(planFor('a@church.org.uk', 'desktop').open).toBeNull()
  })
})
