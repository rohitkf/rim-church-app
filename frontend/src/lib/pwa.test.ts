import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getPwaState,
  initPwa,
  isIos,
  isStandalone,
  promptInstall,
  resetPwaStateForTests,
  subscribePwa,
  type InstallPromptEvent,
} from './pwa'

function installEvent(outcome: 'accepted' | 'dismissed') {
  const event = new Event('beforeinstallprompt') as InstallPromptEvent
  event.prompt = vi.fn(() => Promise.resolve())
  event.userChoice = Promise.resolve({ outcome })
  return event
}

let teardown: () => void = () => {}

beforeEach(() => {
  resetPwaStateForTests()
})

afterEach(() => {
  teardown()
  teardown = () => {}
  vi.unstubAllGlobals()
})

describe('isStandalone', () => {
  it('recognises an installed app by its display mode', () => {
    vi.stubGlobal('matchMedia', ((query: string) => ({
      matches: query.includes('standalone'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia)
    expect(isStandalone()).toBe(true)
  })

  it('is false in an ordinary tab', () => {
    vi.stubGlobal('matchMedia', ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia)
    expect(isStandalone()).toBe(false)
  })
})

describe('isIos', () => {
  const withAgent = (userAgent: string, maxTouchPoints = 0) => {
    vi.stubGlobal('navigator', { userAgent, maxTouchPoints, onLine: true })
  }

  it('spots an iPhone', () => {
    withAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari')
    expect(isIos()).toBe(true)
  })

  it('spots an iPad, which now claims to be a Mac', () => {
    withAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 5)
    expect(isIos()).toBe(true)
  })

  it('leaves a real Mac alone', () => {
    withAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 0)
    expect(isIos()).toBe(false)
  })

  it('leaves Android alone', () => {
    withAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome')
    expect(isIos()).toBe(false)
  })
})

describe('initPwa', () => {
  it('captures the install offer and suppresses the browser bar', () => {
    teardown = initPwa()
    const event = installEvent('accepted')
    const prevented = vi.spyOn(event, 'preventDefault')
    window.dispatchEvent(event)

    expect(prevented).toHaveBeenCalled()
    expect(getPwaState().installPrompt).toBe(event)
  })

  it('follows the connection dropping and coming back', () => {
    teardown = initPwa()
    window.dispatchEvent(new Event('offline'))
    expect(getPwaState().offline).toBe(true)
    window.dispatchEvent(new Event('online'))
    expect(getPwaState().offline).toBe(false)
  })

  it('forgets the offer once the app is installed', () => {
    teardown = initPwa()
    window.dispatchEvent(installEvent('accepted'))
    window.dispatchEvent(new Event('appinstalled'))

    expect(getPwaState().installPrompt).toBeNull()
    expect(getPwaState().installed).toBe(true)
  })

  it('tells subscribers when something changes', () => {
    const listener = vi.fn()
    const unsubscribe = subscribePwa(listener)
    teardown = initPwa()
    window.dispatchEvent(new Event('offline'))
    expect(listener).toHaveBeenCalled()
    unsubscribe()
  })

  it('stops listening once torn down', () => {
    const stop = initPwa()
    stop()
    window.dispatchEvent(new Event('offline'))
    expect(getPwaState().offline).toBe(false)
  })
})

describe('promptInstall', () => {
  it('does nothing when no offer is in hand', async () => {
    await expect(promptInstall()).resolves.toBe(false)
  })

  it('shows the dialogue and reports acceptance', async () => {
    teardown = initPwa()
    const event = installEvent('accepted')
    window.dispatchEvent(event)

    await expect(promptInstall()).resolves.toBe(true)
    expect(event.prompt).toHaveBeenCalled()
  })

  it('reports a refusal, and does not keep a spent offer', async () => {
    teardown = initPwa()
    window.dispatchEvent(installEvent('dismissed'))

    await expect(promptInstall()).resolves.toBe(false)
    expect(getPwaState().installPrompt).toBeNull()
  })
})
