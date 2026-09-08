import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GUIDES,
  GUIDE_ORDER,
  detectEnvironment,
  guideIdFor,
} from './installGuide'

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

/*
 * Real user agents, copied rather than invented.
 *
 * Every one of these contains the word "Safari", and all but Firefox
 * contain "Chrome" as well, which is the whole difficulty: a check written
 * in the obvious order calls Samsung Internet "Chrome" and sends somebody
 * hunting for three dots at the top of a browser that keeps its menu at
 * the bottom.
 */
const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  iphoneEdge:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 EdgiOS/126.0.2592.87 Mobile/15E148 Safari/604.1',
  iphoneFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 331.0.0.37.90',
  ipadSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  androidSamsung:
    'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  androidFirefox:
    'Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0',
  androidEdge:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 EdgA/126.0.2592.87',
  androidOpera:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 OPR/83.0.0.0',
  androidFacebook:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 [FBAN/EMA;FBLC/en_GB]',
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.87',
  windowsFirefox:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
}

const at = (ua: string, touch = 0, brave = false) => detectEnvironment(ua, touch, brave)

describe('which browser somebody is holding', () => {
  it.each([
    ['iPhone Safari', UA.iphoneSafari, 'safari', 'ios', 'ios-safari'],
    ['iPhone Chrome', UA.iphoneChrome, 'chrome', 'ios', 'ios-chromium'],
    ['iPhone Edge', UA.iphoneEdge, 'edge', 'ios', 'ios-chromium'],
    ['iPhone Firefox', UA.iphoneFirefox, 'firefox', 'ios', 'ios-chromium'],
    ['Instagram on an iPhone', UA.iphoneInstagram, 'inapp', 'ios', 'ios-inapp'],
    ['Android Chrome', UA.androidChrome, 'chrome', 'android', 'android-chromium'],
    ['Samsung Internet', UA.androidSamsung, 'samsung', 'android', 'android-samsung'],
    ['Android Firefox', UA.androidFirefox, 'firefox', 'android', 'android-firefox'],
    ['Android Edge', UA.androidEdge, 'edge', 'android', 'android-chromium'],
    ['Android Opera', UA.androidOpera, 'opera', 'android', 'android-chromium'],
    ['Facebook on Android', UA.androidFacebook, 'inapp', 'android', 'android-inapp'],
    ['Chrome on Windows', UA.windowsChrome, 'chrome', 'desktop', 'desktop-chrome'],
    ['Edge on Windows', UA.windowsEdge, 'edge', 'desktop', 'desktop-edge'],
    ['Firefox on Windows', UA.windowsFirefox, 'firefox', 'desktop', 'desktop-firefox'],
    ['Safari on a Mac', UA.macSafari, 'safari', 'desktop', 'desktop-safari'],
  ])('places %s', (_name, ua, browser, platform, guide) => {
    const env = at(ua)
    expect(env.browser).toBe(browser)
    expect(env.platform).toBe(platform)
    expect(env.guide).toBe(guide)
  })

  it('knows an iPad from a Mac by the touch it reports', () => {
    // Both say Macintosh; only one of them can be prodded.
    expect(at(UA.ipadSafari, 5).platform).toBe('ios')
    expect(at(UA.macSafari, 0).platform).toBe('desktop')
  })

  it('finds Brave, which wears Chrome’s user agent exactly', () => {
    expect(at(UA.windowsChrome, 0, true).browser).toBe('brave')
    expect(at(UA.androidChrome, 0, true).browser).toBe('brave')
    // Same steps as Chrome — the menu differs by a word, not a procedure.
    expect(at(UA.windowsChrome, 0, true).guide).toBe('desktop-chrome')
  })

  it('does not mistake Edge or Samsung for the Chrome inside them', () => {
    // Both carry "Chrome/126" verbatim. Order of the checks is the fix.
    expect(at(UA.windowsEdge).browser).not.toBe('chrome')
    expect(at(UA.androidSamsung).browser).not.toBe('chrome')
  })

  it('says which browser it thinks it is, in words a person would use', () => {
    expect(at(UA.androidSamsung).name).toBe('Samsung Internet on Android')
    expect(at(UA.iphoneSafari).name).toBe('Safari on iPhone')
    expect(at(UA.windowsEdge).name).toBe('Edge on your computer')
  })

  it('falls back to something usable when it recognises nothing', () => {
    const env = at('Some browser nobody has heard of')
    expect(env.browser).toBe('unknown')
    // A computer is the least harmful guess, and its steps name three
    // browsers rather than assuming one.
    expect(env.guide).toBe('desktop-chrome')
  })

  it('reads nothing at all without crashing', () => {
    expect(() => at('')).not.toThrow()
    expect(at('').guide).toBe('desktop-chrome')
  })
})

describe('the directions themselves', () => {
  it('has a set for every id the detection can return', () => {
    const reachable = new Set(
      (['ios', 'android', 'desktop'] as const).flatMap((platform) =>
        (
          [
            'safari',
            'chrome',
            'edge',
            'firefox',
            'samsung',
            'opera',
            'brave',
            'inapp',
            'unknown',
          ] as const
        ).map((browser) => guideIdFor(platform, browser)),
      ),
    )
    for (const id of reachable) expect(GUIDES[id]).toBeDefined()
    // And nothing written that nothing can reach.
    for (const id of GUIDE_ORDER) expect(reachable.has(id)).toBe(true)
  })

  it('gives every set steps that say what to do and where it is', () => {
    for (const id of GUIDE_ORDER) {
      const guide = GUIDES[id]
      expect(guide.steps.length).toBeGreaterThanOrEqual(4)
      for (const step of guide.steps) {
        expect(step.title.trim()).not.toBe('')
        // A step that only names a button is the kind of instruction that
        // works for whoever wrote it and nobody else.
        expect(step.detail.length).toBeGreaterThan(40)
      }
    }
  })

  it('lists every set exactly once, under a heading', () => {
    expect(new Set(GUIDE_ORDER).size).toBe(GUIDE_ORDER.length)
    expect(Object.keys(GUIDES).sort()).toEqual([...GUIDE_ORDER].sort())
    for (const id of GUIDE_ORDER) expect(GUIDES[id].group.trim()).not.toBe('')
  })

  it('tells every iPhone why this is not optional', () => {
    for (const id of GUIDE_ORDER) {
      if (GUIDES[id].platform !== 'ios') continue
      expect(GUIDES[id].footnote).toMatch(/notification/i)
    }
  })

  it('tells somebody stuck in a webview how to get out rather than how to tap', () => {
    for (const id of ['ios-inapp', 'android-inapp'] as const) {
      const words = GUIDES[id].steps.map((s) => `${s.title} ${s.detail}`).join(' ')
      expect(words).toMatch(/Safari|Chrome/)
      expect(words).toMatch(/copy/i)
    }
  })

  it('does not promise Firefox on a computer something it cannot do', () => {
    const words = GUIDES['desktop-firefox'].steps.map((s) => s.detail).join(' ')
    expect(words).toMatch(/cannot|Pin Tab/i)
  })

  it('only claims a one-tap install where the browser can actually offer it', () => {
    for (const id of GUIDE_ORDER) {
      // beforeinstallprompt is Chromium's, and never fires on iOS, where
      // every browser is Safari underneath.
      if (GUIDES[id].canPrompt) expect(GUIDES[id].platform).not.toBe('ios')
    }
  })
})
