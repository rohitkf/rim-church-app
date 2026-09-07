/**
 * How to put this app on a home screen, in the words of the browser the
 * person is actually holding.
 *
 * The app is a website that can behave like an app — but only once it has
 * been added to the home screen, and every browser hides that behind a
 * different menu, in a different corner, under a different name.
 *
 * This used to answer per platform: one set of steps for iPhone, one for
 * Android, one for a computer, each written for the most likely browser on
 * it. That is wrong more often than it looks. "Tap the three dots at the
 * top right" is Chrome; Samsung Internet's menu is three lines at the
 * bottom. "Tap Share" is Safari; a person reading this inside Instagram
 * has a share button that does something else entirely, and no way to
 * install at all until they leave. Directions that name the wrong button
 * are worse than none: they teach the person that the app is broken.
 *
 * So the browser is detected too, and the steps are written per procedure
 * rather than per platform — eleven of them, because that is how many
 * genuinely different ways there are to do this.
 *
 * Two reasons the directions have to be good rather than adequate:
 * notifications on an iPhone do not work at all until the app is
 * installed, and the people being directed are volunteers on a Sunday, not
 * engineers. So each step names what the thing looks like and where on the
 * screen it is, because "tap the Share button" is only useful to somebody
 * who already knows which one that is.
 */

export type Platform = 'ios' | 'android' | 'desktop'

/**
 * The browsers worth telling apart.
 *
 * `inapp` is the webview inside Instagram, Facebook, WhatsApp and the
 * rest: a browser that cannot install anything, whatever the person does,
 * and whose only useful instruction is how to get out of it.
 */
export type BrowserId =
  | 'safari'
  | 'chrome'
  | 'edge'
  | 'firefox'
  | 'samsung'
  | 'opera'
  | 'brave'
  | 'inapp'
  | 'unknown'

/** One set of directions. Several browsers can share one. */
export type GuideId =
  | 'ios-safari'
  | 'ios-chromium'
  | 'ios-inapp'
  | 'android-chromium'
  | 'android-samsung'
  | 'android-firefox'
  | 'android-inapp'
  | 'desktop-chrome'
  | 'desktop-edge'
  | 'desktop-safari'
  | 'desktop-firefox'

export interface GuideStep {
  /** The action, in the imperative. Short enough to scan. */
  title: string
  /** What it looks like and where it is. The part that actually helps. */
  detail: string
}

export interface Guide {
  id: GuideId
  platform: Platform
  /** How this set is named when somebody is picking from a list. */
  label: string
  /** The device family it belongs to, as a heading in that list. */
  group: string
  steps: GuideStep[]
  /** The one thing worth knowing afterwards, if there is one. */
  footnote?: string
  /**
   * Whether this browser can be asked to install by a button rather than
   * by directions. Only Chromium fires `beforeinstallprompt`, and never on
   * iOS, where every browser is Safari underneath.
   */
  canPrompt?: boolean
}

export interface Environment {
  platform: Platform
  browser: BrowserId
  /** How to say it: "Chrome on Android". */
  name: string
  guide: GuideId
}

/* ------------------------------------------------------------------ *
 * Working out where we are
 * ------------------------------------------------------------------ */

/** The webviews people arrive in from a link in a chat or a feed. */
const IN_APP =
  /FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter|WhatsApp|Snapchat|MicroMessenger|TikTok|Pinterest|LinkedInApp/i

/**
 * An iPhone or an iPad.
 *
 * An iPad has claimed to be a Mac since iPadOS 13, so a Mac that reports
 * touch points is one — a real Mac reports none, trackpads included.
 */
export function isIosDevice(ua: string, maxTouchPoints: number): boolean {
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)
}

function platformOf(ua: string, maxTouchPoints: number): Platform {
  if (isIosDevice(ua, maxTouchPoints)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

/**
 * Which browser, in the order the tokens have to be tested.
 *
 * Order is the whole of it. Every one of these contains "Safari" in its
 * user agent, and all but Firefox contain "Chrome" as well, so testing for
 * Chrome first would call every browser on earth Chrome. The most specific
 * token wins, and Chrome and Safari are the two fallbacks at the end.
 *
 * Brave hides deliberately — its user agent is Chrome's, byte for byte —
 * so it is found by the object it puts on `navigator` instead.
 */
function browserOf(ua: string, hasBraveApi: boolean): BrowserId {
  if (IN_APP.test(ua)) return 'inapp'
  if (/SamsungBrowser/i.test(ua)) return 'samsung'
  if (/Edg(A|iOS)?\//i.test(ua)) return 'edge'
  if (/OPR\/|OPiOS|OPT\//i.test(ua)) return 'opera'
  if (/FxiOS|Firefox\//i.test(ua)) return 'firefox'
  if (hasBraveApi) return 'brave'
  if (/CriOS|Chrome\//i.test(ua)) return 'chrome'
  if (/Safari\//i.test(ua)) return 'safari'
  return 'unknown'
}

const BROWSER_NAMES: Record<BrowserId, string> = {
  safari: 'Safari',
  chrome: 'Chrome',
  edge: 'Edge',
  firefox: 'Firefox',
  samsung: 'Samsung Internet',
  opera: 'Opera',
  brave: 'Brave',
  inapp: 'an in-app browser',
  unknown: 'your browser',
}

const PLATFORM_NAMES: Record<Platform, string> = {
  ios: 'iPhone',
  android: 'Android',
  desktop: 'your computer',
}

/**
 * Which directions this browser needs.
 *
 * On iOS the browser barely matters: every one of them is Safari
 * underneath, and they differ only in which menu the same Add to Home
 * Screen sits in. On Android and on a computer they differ properly.
 */
export function guideIdFor(platform: Platform, browser: BrowserId): GuideId {
  if (platform === 'ios') {
    if (browser === 'inapp') return 'ios-inapp'
    if (browser === 'safari' || browser === 'unknown') return 'ios-safari'
    return 'ios-chromium'
  }
  if (platform === 'android') {
    if (browser === 'inapp') return 'android-inapp'
    if (browser === 'samsung') return 'android-samsung'
    if (browser === 'firefox') return 'android-firefox'
    return 'android-chromium'
  }
  if (browser === 'edge') return 'desktop-edge'
  if (browser === 'firefox') return 'desktop-firefox'
  if (browser === 'safari') return 'desktop-safari'
  return 'desktop-chrome'
}

/** Where we are, as far as the browser will admit. */
export function detectEnvironment(
  ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent,
  maxTouchPoints: number = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints,
  hasBraveApi: boolean = typeof navigator !== 'undefined' && 'brave' in navigator,
): Environment {
  const platform = platformOf(ua, maxTouchPoints)
  const browser = browserOf(ua, hasBraveApi)
  const on = platform === 'desktop' ? 'your computer' : PLATFORM_NAMES[platform]
  return {
    platform,
    browser,
    name:
      browser === 'unknown'
        ? `${on === 'your computer' ? 'Your computer' : on}`
        : `${BROWSER_NAMES[browser]} on ${on}`,
    guide: guideIdFor(platform, browser),
  }
}

/* ------------------------------------------------------------------ *
 * The directions
 * ------------------------------------------------------------------ */

const OPEN_IT = {
  ios: {
    title: 'Open it from your home screen',
    detail:
      'The church icon is now on your home screen with your other apps. Open it from there from now on rather than from the browser — that is the copy notifications reach.',
  },
  android: {
    title: 'Open it from your home screen',
    detail:
      'The icon is now with your other apps, and in your app drawer. Open it from there — it fills the screen properly, with no address bar in the way.',
  },
  desktop: {
    title: 'Open it from your dock, taskbar or Start menu',
    detail:
      'It gets its own window and its own icon, and it stops being one tab among thirty. You can pin it where you keep your other apps.',
  },
} satisfies Record<Platform, GuideStep>

const IPHONE_NOTIFICATIONS =
  'On an iPhone this is not optional if you want notifications: Apple only lets the app send them once it has been added to the home screen and opened from there.'

export const GUIDES: Record<GuideId, Guide> = {
  'ios-safari': {
    id: 'ios-safari',
    platform: 'ios',
    label: 'Safari',
    group: 'iPhone or iPad',
    steps: [
      {
        title: 'Tap the Share button',
        detail:
          'A square with an arrow pointing up out of it. On an iPhone it is in the bar along the very bottom of the screen, in the middle. On an iPad it is at the top right, next to the address bar.',
      },
      {
        title: 'Scroll down and tap “Add to Home Screen”',
        detail:
          'A grey panel slides up with a long list in it. Slide the list upwards to see more. The entry has a small square with a plus sign in it, below the row of apps you can share to, past “Add Bookmark” and “Add to Favourites”.',
      },
      {
        title: 'Tap “Add” at the top right',
        detail:
          'You will see the church icon and the name it is about to use. You can shorten the name here if you like — “RIM” is plenty. Then tap Add.',
      },
      OPEN_IT.ios,
    ],
    footnote: IPHONE_NOTIFICATIONS,
  },

  'ios-chromium': {
    id: 'ios-chromium',
    platform: 'ios',
    label: 'Chrome, Edge, Firefox or Opera',
    group: 'iPhone or iPad',
    steps: [
      {
        title: 'Open this browser’s own Share menu',
        detail:
          'Not the iPhone’s. In Chrome and Edge it is the three dots — at the bottom right in Chrome, along the bottom bar in Edge — and then “Share…”. In Firefox it is the three lines at the bottom right.',
      },
      {
        title: 'Choose “Add to Home Screen”',
        detail:
          'It is in the list that slides up, marked with a small square and a plus sign. You may have to slide the list upwards to reach it.',
      },
      {
        title: 'Tap “Add” at the top right',
        detail:
          'You will see the church icon and the name. Shorten the name if you like, then tap Add.',
      },
      {
        title: 'If you cannot find it, use Safari instead',
        detail:
          'Some versions of these browsers on iPhone still do not offer it. Copy the address, open Safari — the blue compass — paste it in, and follow the Safari steps. Every browser on an iPhone is Safari underneath, so the app is identical either way.',
      },
      OPEN_IT.ios,
    ],
    footnote: IPHONE_NOTIFICATIONS,
  },

  'ios-inapp': {
    id: 'ios-inapp',
    platform: 'ios',
    label: 'Inside Instagram, Facebook or WhatsApp',
    group: 'iPhone or iPad',
    steps: [
      {
        title: 'You are not in a browser yet',
        detail:
          'This page opened inside the app you tapped the link in. That window cannot add anything to your home screen, no matter which button you press — so the first job is to get out of it.',
      },
      {
        title: 'Look for “Open in Safari”',
        detail:
          'In most of these apps it is behind the three dots at the top right, or the compass icon at the bottom right of the window. Instagram and Facebook both have it; WhatsApp opens Safari by itself if you tap the link a second time.',
      },
      {
        title: 'If there is no such option, copy the address instead',
        detail:
          'Tap and hold the address at the top of the window, copy it, then open Safari — the blue compass on your home screen — and paste it into the address bar.',
      },
      {
        title: 'Then follow the Safari steps',
        detail:
          'Share button at the bottom, “Add to Home Screen”, then Add. Switch to the Safari directions above if you want them in front of you.',
      },
      OPEN_IT.ios,
    ],
    footnote: IPHONE_NOTIFICATIONS,
  },

  'android-chromium': {
    id: 'android-chromium',
    platform: 'android',
    label: 'Chrome, Edge, Brave or Opera',
    group: 'Android phone or tablet',
    canPrompt: true,
    steps: [
      {
        title: 'Tap the three dots',
        detail:
          'Three small dots stacked on top of each other, at the top right of the screen, level with the address bar. In Opera they are at the bottom right instead. That is the browser’s menu.',
      },
      {
        title: 'Choose “Install app” or “Add to Home screen”',
        detail:
          'Partway down a long list, so you may need to scroll. Chrome and Brave say one or the other depending on the version; Edge keeps it under “Add to phone”. Any of them is the right thing.',
      },
      {
        title: 'Tap “Install”',
        detail:
          'A small box appears showing the church icon and the name. Tap Install (or Add). Nothing downloads from the Play Store — it takes about a second.',
      },
      OPEN_IT.android,
    ],
    footnote:
      'If the browser offers to do it for you with a bar along the bottom of the screen, that bar does exactly the same thing. Take it.',
  },

  'android-samsung': {
    id: 'android-samsung',
    platform: 'android',
    label: 'Samsung Internet',
    group: 'Android phone or tablet',
    steps: [
      {
        title: 'Tap the three lines at the bottom right',
        detail:
          'Samsung Internet keeps its menu at the bottom of the screen, not the top: three horizontal lines in the bar along the bottom, at the right-hand end.',
      },
      {
        title: 'Tap “Add page to”',
        detail:
          'In the grid of options that slides up. It sits near “Share”, and has a small plus sign on it.',
      },
      {
        title: 'Choose “Home screen”',
        detail:
          'Then confirm with Add. Some versions show “Install app” here instead — take that if you see it, it is the better of the two.',
      },
      OPEN_IT.android,
    ],
  },

  'android-firefox': {
    id: 'android-firefox',
    platform: 'android',
    label: 'Firefox',
    group: 'Android phone or tablet',
    steps: [
      {
        title: 'Tap the three dots',
        detail:
          'At the right-hand end of the address bar, which Firefox puts at the bottom of the screen by default and at the top if you have changed that setting.',
      },
      {
        title: 'Choose “Install” or “Add to Home screen”',
        detail:
          'Newer versions say Install and give you a real app; older ones say Add to Home screen and give you a shortcut. Either is worth having.',
      },
      {
        title: 'Confirm with “Add”',
        detail:
          'Firefox may then ask you to place the icon by dragging it, or offer to place it for you — “Add automatically” is the easy answer.',
      },
      OPEN_IT.android,
    ],
  },

  'android-inapp': {
    id: 'android-inapp',
    platform: 'android',
    label: 'Inside Instagram, Facebook or WhatsApp',
    group: 'Android phone or tablet',
    steps: [
      {
        title: 'You are not in a browser yet',
        detail:
          'This page opened inside the app you tapped the link in. That window cannot install anything or add anything to your home screen — the first job is to get out of it.',
      },
      {
        title: 'Tap the three dots and choose “Open in Chrome”',
        detail:
          'Top right of the window in most of these apps. Facebook and Instagram both offer “Open in external browser”, which is the same thing.',
      },
      {
        title: 'If there is no such option, copy the address',
        detail:
          'Tap and hold the address at the top of the window, copy it, then open Chrome and paste it into the address bar.',
      },
      {
        title: 'Then follow the Chrome steps',
        detail:
          'Three dots at the top right, “Install app”, then Install. Switch to the Chrome directions above if you want them in front of you.',
      },
      OPEN_IT.android,
    ],
  },

  'desktop-chrome': {
    id: 'desktop-chrome',
    platform: 'desktop',
    label: 'Chrome, Brave or Opera',
    group: 'Computer',
    canPrompt: true,
    steps: [
      {
        title: 'Look at the right-hand end of the address bar',
        detail:
          'There is a small icon of a screen with an arrow pointing down into it. Click it, then click Install. If it is not there, the menu below does the same job.',
      },
      {
        title: 'Or use the menu',
        detail:
          'Chrome: the three dots at the top right → “Cast, save and share” → “Install page as app…”. Brave: the three lines → “Install RIM…”. Opera: the ❤/menu button → “Install”.',
      },
      {
        title: 'Confirm with “Install”',
        detail:
          'A small box shows the icon and the name. Nothing is downloaded from anywhere — the page you already have becomes the app.',
      },
      OPEN_IT.desktop,
    ],
  },

  'desktop-edge': {
    id: 'desktop-edge',
    platform: 'desktop',
    label: 'Edge',
    group: 'Computer',
    canPrompt: true,
    steps: [
      {
        title: 'Click the three dots at the top right',
        detail:
          'At the end of the toolbar, past the address bar and the favourites star. That is Edge’s menu.',
      },
      {
        title: 'Choose “Apps” → “Install this site as an app”',
        detail:
          'Apps is partway down the menu, with a small grid icon. Hovering it opens a second list with the install option in it.',
      },
      {
        title: 'Confirm with “Install”',
        detail:
          'Edge then offers to pin it to the taskbar and the Start menu. Say yes to both — that is the point of installing it.',
      },
      OPEN_IT.desktop,
    ],
  },

  'desktop-safari': {
    id: 'desktop-safari',
    platform: 'desktop',
    label: 'Safari on a Mac',
    group: 'Computer',
    steps: [
      {
        title: 'Open the File menu',
        detail:
          'In the menu bar along the very top of the screen, next to the Apple logo — not in the Safari window itself.',
      },
      {
        title: 'Choose “Add to Dock…”',
        detail:
          'About halfway down. It is only there on macOS Sonoma and later; on an older Mac, Safari cannot do this and Chrome or Edge can.',
      },
      {
        title: 'Give it a name and click Add',
        detail:
          'You will see the church icon and the name it is about to use. “RIM” is plenty.',
      },
      OPEN_IT.desktop,
    ],
  },

  'desktop-firefox': {
    id: 'desktop-firefox',
    platform: 'desktop',
    label: 'Firefox',
    group: 'Computer',
    steps: [
      {
        title: 'Firefox on a computer cannot install web apps',
        detail:
          'This is not something you are doing wrong, and no menu in it will help — Mozilla removed the feature. Firefox on an Android phone still can, and does it well.',
      },
      {
        title: 'Use Chrome, Edge or Safari for the app',
        detail:
          'Open this same address in one of those and follow its steps. You lose nothing by keeping Firefox for everything else.',
      },
      {
        title: 'Or pin the tab instead',
        detail:
          'Right-click this tab → “Pin Tab”. It sits at the left of the tab strip, keeps its place when you restart, and is a good deal better than hunting for it every Sunday.',
      },
      {
        title: 'Bookmark it as well',
        detail:
          'Ctrl+D (⌘D on a Mac) and save it to the bookmarks toolbar, so it is one click away even if the pin is lost.',
      },
    ],
  },
}

/** Every set of directions, grouped for a list somebody picks from. */
export const GUIDE_ORDER: GuideId[] = [
  'ios-safari',
  'ios-chromium',
  'ios-inapp',
  'android-chromium',
  'android-samsung',
  'android-firefox',
  'android-inapp',
  'desktop-chrome',
  'desktop-edge',
  'desktop-safari',
  'desktop-firefox',
]

/* ------------------------------------------------------------------ *
 * The glow
 * ------------------------------------------------------------------ */

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
