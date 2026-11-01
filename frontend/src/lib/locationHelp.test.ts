import { afterEach, describe, expect, it, vi } from 'vitest'
import { askForLocation, refusalWords, stepsFor } from './locationHelp'
import { forgetLocationPermission } from './locationPermission'

function phone(answer: 'yes' | 'no' | 'nothing', afterMs = 0) {
  const getCurrentPosition = vi.fn((ok: PositionCallback, fail: PositionErrorCallback) => {
    const go = () => {
      if (answer === 'yes') ok({ coords: { latitude: 51.5, longitude: -0.1, accuracy: 10 } } as GeolocationPosition)
      else fail({ code: answer === 'no' ? 1 : 2, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError)
    }
    if (afterMs) setTimeout(go, afterMs)
    else go()
  })
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
}

afterEach(() => {
  vi.useRealTimers()
  forgetLocationPermission()
})

describe('asking for location', () => {
  it('calls a refusal that came back at once what it is: the phone did not ask', async () => {
    phone('no')
    expect(await askForLocation()).toEqual({ result: 'denied', withoutAsking: true })
  })

  it('a refusal after a while is somebody pressing Don’t Allow', async () => {
    vi.useFakeTimers()
    phone('no', 4_000)
    const asked = askForLocation()
    await vi.advanceTimersByTimeAsync(4_000)
    expect(await asked).toEqual({ result: 'denied', withoutAsking: false })
  })

  it('tells apart allowed, could-not-find, and no location at all', async () => {
    phone('yes')
    expect(await askForLocation()).toEqual({ result: 'granted' })
    phone('nothing')
    expect(await askForLocation()).toEqual({ result: 'unavailable' })
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true })
    expect(await askForLocation()).toEqual({ result: 'unsupported' })
  })

  it('says why, in words', () => {
    expect(refusalWords({ result: 'denied', withoutAsking: true })).toMatch(/without asking/)
    expect(refusalWords({ result: 'granted' })).toBeNull()
  })
})

describe('the steps, for each phone and browser', () => {
  it('sends the installed Android app to the browser that installed it, since it has no address bar', () => {
    const s = stepsFor('android', 'chrome', true)
    expect(s.title).toBe('The app on your Android phone')
    expect(s.steps.join(' ')).toMatch(/no address bar/)
    expect(s.steps.join(' ')).toMatch(/Settings › Apps › Chrome › Permissions › Location/)
  })

  it('has each Android browser’s own site setting', () => {
    expect(stepsFor('android', 'samsung', false).steps[0]).toMatch(/Samsung Internet.*Site permissions › Location/)
    expect(stepsFor('android', 'firefox', false).steps[0]).toMatch(/Firefox.*padlock/)
    expect(stepsFor('android', 'edge', false).steps[1]).toMatch(/Apps › Edge › Permissions/)
    expect(stepsFor('android', 'unknown', false).steps[1]).toMatch(/Apps › your browser/)
  })

  it('names the iPhone browser’s own switch, and Safari Websites for Safari and the Home Screen app', () => {
    expect(stepsFor('ios', 'chrome', false).steps[1]).toMatch(/Scroll down to Chrome/)
    expect(stepsFor('ios', 'firefox', false).steps[1]).toMatch(/Scroll down to Firefox/)
    expect(stepsFor('ios', 'safari', false).steps[1]).toMatch(/Safari Websites/)
    expect(stepsFor('ios', 'chrome', true).steps[1]).toMatch(/Safari Websites/)
  })

  it('tells an in-app browser to open a real one', () => {
    expect(stepsFor('android', 'inapp', false).steps.join(' ')).toMatch(/Open in Chrome/)
    expect(stepsFor('ios', 'inapp', false).steps.join(' ')).toMatch(/Open in Safari/)
  })
})
