/*
 * Getting somebody from "we sent you an email" to the email.
 *
 * A browser cannot open an inbox, and cannot ask which mail apps a phone
 * has. What it can do is three different things, one per kind of device:
 *
 *   Android  An intent for the system's own email chooser — the same
 *            "Open with…" list every other app that has an Open email
 *            button shows, with Gmail, Outlook, Samsung Email and the rest
 *            that are installed. It names no app, so it needs to know
 *            nothing about the person's email.
 *   iPhone   There is no chooser. `message://` opens Apple Mail and only
 *            Apple Mail, so it is used for addresses with no webmail we
 *            know. A known provider's website is used instead: on an
 *            iPhone that opens its app when it is installed (a universal
 *            link) and its page when it is not, with no "cannot open the
 *            page" box for an app that is missing.
 *   Desktop  The provider's webmail, in a new tab — for the providers we
 *            can name. For anywhere else there is nothing true to point
 *            at (a work or school address could be webmail anywhere), so
 *            the dialog offers no button rather than a wrong one.
 *
 * Nothing here is sent anywhere: the address only picks which link to show.
 */

export type Device = 'android' | 'ios' | 'desktop'

export interface MailProvider {
  name: string
  /** Where the inbox is on the web. */
  web: (email: string) => string
}

/** The same intent every "Open email app" button on Android uses: the email-category chooser. */
export const ANDROID_EMAIL_INTENT =
  'intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.APP_EMAIL;end'

/** Apple Mail's own scheme. */
export const APPLE_MAIL = 'message://'

const gmail: MailProvider = {
  name: 'Gmail',
  // `authuser` picks the right account for somebody signed in to several.
  web: (email) => `https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}`,
}
const outlook: MailProvider = { name: 'Outlook', web: () => 'https://outlook.live.com/mail/0/inbox' }
const yahoo: MailProvider = { name: 'Yahoo Mail', web: () => 'https://mail.yahoo.com/' }
const icloud: MailProvider = { name: 'iCloud Mail', web: () => 'https://www.icloud.com/mail' }
const proton: MailProvider = { name: 'Proton Mail', web: () => 'https://mail.proton.me/' }
const aol: MailProvider = { name: 'AOL Mail', web: () => 'https://mail.aol.com/' }

/** The part after the last @, lower-cased; null when there is not one. */
export function domainOf(email: string): string | null {
  const at = email.lastIndexOf('@')
  if (at < 1 || at === email.length - 1) return null
  return email.slice(at + 1).trim().toLowerCase()
}

/** The webmail for this address, when its domain is one we know. */
export function providerFor(email: string): MailProvider | null {
  const domain = domainOf(email)
  if (!domain) return null
  if (domain === 'gmail.com' || domain === 'googlemail.com') return gmail
  if (/^(outlook|hotmail|live|msn)\.[a-z]{2,}(\.[a-z]{2,})?$/.test(domain)) return outlook
  if (/^yahoo\.[a-z]{2,}(\.[a-z]{2,})?$/.test(domain) || domain === 'ymail.com' || domain === 'rocketmail.com') {
    return yahoo
  }
  if (domain === 'icloud.com' || domain === 'me.com' || domain === 'mac.com') return icloud
  if (domain === 'proton.me' || domain === 'protonmail.com' || domain === 'pm.me') return proton
  if (domain === 'aol.com') return aol
  return null
}

/** What kind of device this is, from what the browser says about itself. */
export function deviceFrom(nav: { userAgent: string; platform?: string; maxTouchPoints?: number }): Device {
  if (/android/i.test(nav.userAgent)) return 'android'
  if (/iphone|ipad|ipod/i.test(nav.userAgent)) return 'ios'
  // An iPad asking for the desktop site says it is a Mac — with a touch screen.
  if (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1) return 'ios'
  return 'desktop'
}

export interface MailLink {
  /** Where the button goes. */
  href: string
  /** Opens in a new tab: webmail on a computer, so the sign-up page stays. */
  newTab: boolean
}

export interface MailPlan {
  /** The button, or null when there is no honest place to send them. */
  open: MailLink | null
  /** The webmail for their provider, offered beside the button on a phone. */
  web: (MailLink & { provider: string }) | null
}

export function planFor(email: string, device: Device): MailPlan {
  const provider = providerFor(email)
  const web = provider ? { href: provider.web(email), newTab: true, provider: provider.name } : null

  if (device === 'android') return { open: { href: ANDROID_EMAIL_INTENT, newTab: false }, web }
  if (device === 'ios') {
    return {
      open: web ? { href: web.href, newTab: false } : { href: APPLE_MAIL, newTab: false },
      // On an iPhone the button already is the provider's inbox.
      web: null,
    }
  }
  return { open: web ? { href: web.href, newTab: true } : null, web: null }
}
