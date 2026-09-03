/**
 * How to put this app on a phone's home screen, said in words a person who
 * has never heard of a PWA can follow.
 *
 * The app is a website that can behave like an app — but only once it has
 * been added to the home screen, and every platform hides that behind a
 * different menu. Chromium at least offers a button we can press on
 * somebody's behalf; Safari never does, so on an iPhone the only honest
 * help is a set of directions.
 *
 * Two reasons the directions have to be good rather than adequate:
 * notifications on an iPhone do not work at all until the app is installed,
 * and the people being directed are volunteers on a Sunday, not engineers.
 * So each step names what the thing looks like and where on the screen it
 * is, because "tap the Share button" is only useful to somebody who already
 * knows which one that is.
 *
 * The steps live here, apart from the dialog that draws them, so they can
 * be read and corrected without reading JSX.
 */
import { isIos } from './pwa'

export type Platform = 'ios' | 'android' | 'desktop'

export interface GuideStep {
  /** The action, in the imperative. Short enough to scan. */
  title: string
  /** What it looks like and where it is. The part that actually helps. */
  detail: string
}

export interface Guide {
  platform: Platform
  /** How this platform is named on the tab. */
  label: string
  /** The browser these directions describe. */
  browser: string
  steps: GuideStep[]
  /** The one thing worth knowing afterwards, if there is one. */
  footnote?: string
}

/**
 * Which set of directions this device needs.
 *
 * iPad reports itself as a Mac, which `isIos` already accounts for. An
 * Android tablet says Android like a phone does. Everything else — a
 * laptop, a desktop, something unrecognisable — gets the computer's
 * directions, which are the ones that do least harm if they are wrong.
 */
export function detectPlatform(): Platform {
  if (isIos()) return 'ios'
  if (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)) return 'android'
  return 'desktop'
}

export const GUIDES: Record<Platform, Guide> = {
  ios: {
    platform: 'ios',
    label: 'iPhone or iPad',
    browser: 'Safari',
    steps: [
      {
        title: 'Open this page in Safari',
        detail:
          'Safari is the blue compass icon. If you are reading this in Chrome or in a link that opened inside Facebook or WhatsApp, the option in step 3 will not be there — copy the address and paste it into Safari first.',
      },
      {
        title: 'Tap the Share button',
        detail:
          'A square with an arrow pointing up out of it. On an iPhone it is in the bar along the very bottom of the screen, in the middle. On an iPad it is at the top right, next to the address bar.',
      },
      {
        title: 'Scroll down and tap “Add to Home Screen”',
        detail:
          'A grey panel slides up with a long list. Slide it upwards to see more of it. The entry has a small square with a plus sign in it. It sits below the row of apps you can share to, past “Add Bookmark” and “Add to Favourites”.',
      },
      {
        title: 'Tap “Add” at the top right',
        detail:
          'You will see the church icon and the name it is about to use. You can shorten the name here if you like — “RIM” is plenty. Then tap Add.',
      },
      {
        title: 'Open it from your home screen',
        detail:
          'The icon is now on your home screen with your other apps. Open it from there from now on, not from Safari.',
      },
    ],
    footnote:
      'On an iPhone this step is not optional if you want notifications: Apple only lets the app send them once it has been added to the home screen and opened from there.',
  },
  android: {
    platform: 'android',
    label: 'Android phone',
    browser: 'Chrome',
    steps: [
      {
        title: 'Open this page in Chrome',
        detail:
          'Chrome is the round icon with red, yellow, green and blue. Samsung Internet works the same way, with its menu at the bottom instead of the top.',
      },
      {
        title: 'Tap the three dots',
        detail:
          'Three small dots stacked on top of each other, at the top right of the screen, level with the address bar. That is Chrome’s menu.',
      },
      {
        title: 'Choose “Add to Home screen”',
        detail:
          'It is partway down a long list, so you may need to scroll. Some versions of Chrome call it “Install app” instead — either one is the right thing.',
      },
      {
        title: 'Tap “Install”',
        detail:
          'A small box appears showing the church icon and the name. Tap Install (or Add). Nothing downloads from the Play Store; it takes a second.',
      },
      {
        title: 'Open it from your home screen',
        detail:
          'The icon is now with your other apps, and in your app drawer. Open it from there — it fills the screen properly, with no address bar in the way.',
      },
    ],
    footnote:
      'If Chrome offers to do it for you with a banner along the bottom, that banner does exactly the same thing. Take it.',
  },
  desktop: {
    platform: 'desktop',
    label: 'Computer',
    browser: 'Chrome, Edge or Safari',
    steps: [
      {
        title: 'In Chrome or Edge, look in the address bar',
        detail:
          'At the right-hand end of the address bar there is a small icon of a screen with an arrow pointing down into it. Click it, then click Install.',
      },
      {
        title: 'Or use the menu instead',
        detail:
          'Chrome: the three dots at the top right → “Cast, save and share” → “Install page as app…”. Edge: the three dots → “Apps” → “Install this site as an app”.',
      },
      {
        title: 'On a Mac using Safari',
        detail:
          'From the menu bar at the top of the screen: File → “Add to Dock”. Then give it a name and click Add.',
      },
      {
        title: 'Open it from your dock or Start menu',
        detail:
          'It gets its own window and its own icon, and it stops being one tab among thirty.',
      },
    ],
  },
}

/**
 * Whether the glow has done its job.
 *
 * The button stays until the app is actually installed — that is what the
 * button is for — but the animation stops once somebody has opened the
 * directions, whether or not they went through with it. A thing that keeps
 * pulsing at you after you have looked at it is nagging, and nagging is how
 * people learn to ignore a corner of the screen.
 */
const SEEN_KEY = 'rim-install-guide-seen'

export function hasSeenInstallGuide(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === 'yes'
  } catch {
    // Unreadable storage (a private window, blocked site data) means we
    // cannot know — so glow, which is the state the button was written for.
    return false
  }
}

export function markInstallGuideSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, 'yes')
  } catch {
    // The glow stops for this session regardless; it is held in state too.
  }
}
