import { detectEnvironment, type BrowserId, type Platform } from './installGuide'
import { isStandalone } from './pwa'
import { reportLocation } from './locationPermission'

/*
 * Allowing location, whatever the phone and whatever the browser.
 *
 * "Allow location" asks the browser, and the browser asks the phone — but
 * only if nothing has said no before. Once the site was told Block, or the
 * browser itself was refused location by the phone, the request fails in
 * a few milliseconds without showing anything: on screen, "Finding you…"
 * flashed and went back to Blocked, and nothing said why. So a refusal is
 * timed, a quick one is called what it is, and the steps shown are the
 * ones for this phone, this browser, and whether it is the installed app —
 * which has no address bar, so "tap the padlock" cannot be followed in it.
 */

/** Faster than this, nobody saw a question: the browser answered for them. */
const ASKED_NOBODY_MS = 1_500

export type AskOutcome =
  | { result: 'granted' }
  | { result: 'denied'; withoutAsking: boolean }
  | { result: 'unavailable' }
  | { result: 'unsupported' }

/** Asks once for a fresh position — which is what makes a phone show its Allow question — and says what happened. */
export function askForLocation(): Promise<AskOutcome> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve({ result: 'unsupported' })
  const started = Date.now()
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => {
        reportLocation('granted')
        resolve({ result: 'granted' })
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reportLocation('denied')
          resolve({ result: 'denied', withoutAsking: Date.now() - started < ASKED_NOBODY_MS })
        } else {
          resolve({ result: 'unavailable' })
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    )
  })
}

export interface StepsFor {
  /** "Chrome on Android", "the installed app on iPhone"… */
  title: string
  steps: string[]
}

const APP_NAME = {
  chrome: 'Chrome',
  edge: 'Edge',
  firefox: 'Firefox',
  samsung: 'Samsung Internet',
  opera: 'Opera',
  brave: 'Brave',
} as const

/** The browser's own name, where it has one people would recognise. */
function named(browser: BrowserId): string | null {
  return browser in APP_NAME ? APP_NAME[browser as keyof typeof APP_NAME] : null
}

const PHONE_LOCATION_ON_ANDROID = 'Make sure the phone’s own Location is on: swipe down from the top of the screen and tap Location.'
const COME_BACK = 'Come back to the app and press Allow location again.'

/** Steps for one phone and browser, in the order a person follows them. */
export function stepsFor(platform: Platform, browser: BrowserId, installed: boolean): StepsFor {
  const app = named(browser)

  if (browser === 'inapp') {
    return {
      title: 'Opened inside another app',
      steps: [
        'This page is open inside another app (WhatsApp, Instagram, Facebook…), and those often cannot share your location.',
        platform === 'ios'
          ? 'Tap the ⋯ or share button and choose Open in Safari — or add the app to your Home Screen from Safari.'
          : 'Tap ⋮ and choose Open in Chrome (or Open in browser).',
        COME_BACK,
      ],
    }
  }

  if (platform === 'ios') {
    // Every iPhone browser is Safari underneath, but each has its own
    // switch in Settings; Safari's websites, and the Home Screen app, share one.
    const onSafari = installed || browser === 'safari' || !app
    return {
      title: installed ? 'The app on your iPhone' : `${app ?? 'Safari'} on your iPhone`,
      steps: [
        'Open the Settings app › Privacy & Security › Location Services, and make sure it is on.',
        onSafari
          ? 'Scroll down to Safari Websites and choose While Using the App (or Ask Next Time). Turn Precise Location on.'
          : `Scroll down to ${app} and choose While Using the App. Turn Precise Location on.`,
        onSafari
          ? 'If it still will not ask: in Safari, tap aA in the address bar › Website Settings › Location › Allow.'
          : `If it still will not ask: in ${app}, open the site’s settings from the address bar and allow Location.`,
        COME_BACK,
      ],
    }
  }

  if (platform === 'android') {
    const host = app ?? 'your browser'
    if (installed) {
      return {
        title: 'The app on your Android phone',
        steps: [
          'The installed app has no address bar, so the setting is in the browser that installed it (usually Chrome).',
          `Open ${app ?? 'Chrome'}, go to this app’s address, tap the icon left of the address › Permissions › Location › Allow.`,
          `Then phone Settings › Apps › ${app ?? 'Chrome'} › Permissions › Location › Allow only while using the app. Turn Use precise location on.`,
          PHONE_LOCATION_ON_ANDROID,
          COME_BACK,
        ],
      }
    }
    const siteSetting =
      browser === 'samsung'
        ? 'In Samsung Internet, tap ≡ (bottom right) › Settings › Sites and downloads › Site permissions › Location, find this site and allow it.'
        : browser === 'firefox'
          ? 'In Firefox, tap the padlock left of the address › Location, and turn the block off — or ⋮ › Settings › Site permissions › Location.'
          : `In ${host}, tap the icon left of the address › Permissions › Location › Allow.`
    return {
      title: `${app ?? 'Your browser'} on Android`,
      steps: [
        siteSetting,
        `Phone Settings › Apps › ${host} › Permissions › Location › Allow only while using the app. Turn Use precise location on.`,
        PHONE_LOCATION_ON_ANDROID,
        COME_BACK,
      ],
    }
  }

  return {
    title: `${app ?? 'Your browser'} on a computer`,
    steps: [
      'Click the icon left of the address › Location (or Site settings) › Allow.',
      'Make sure the computer itself lets the browser use location (Windows: Settings › Privacy › Location; Mac: System Settings › Privacy & Security › Location Services).',
      'Reload the page and press Allow location again.',
    ],
  }
}

/** The steps for the phone and browser this is running in. */
export function stepsForThisPhone(): StepsFor {
  const env = detectEnvironment()
  return stepsFor(env.platform, env.browser, isStandalone())
}

/** What a refusal means, in a sentence, for whoever just pressed Allow location. */
export function refusalWords(outcome: AskOutcome): string | null {
  if (outcome.result === 'denied') {
    return outcome.withoutAsking
      ? 'Your phone said no without asking you — it was blocked before. It will not ask again until it is allowed in settings:'
      : 'Location was not allowed. To allow it:'
  }
  if (outcome.result === 'unavailable') return 'Your phone could not find where it is. Check Location is on, then try again.'
  if (outcome.result === 'unsupported') return 'This browser cannot share location. Open the app in Chrome on Android or Safari on an iPhone.'
  return null
}
