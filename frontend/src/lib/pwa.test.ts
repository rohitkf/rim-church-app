import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  announcesUpdate,
  askBuildId,
  getPwaState,
  initPwa,
  isIos,
  isStandalone,
  promptInstall,
  resetPwaStateForTests,
  subscribePwa,
  type InstallPromptEvent,
} from './pwa'

/** A worker that answers the build question however the test wants. */
function workerReplying(reply: unknown): ServiceWorker {
  return {
    postMessage: (_message: unknown, transfer?: Transferable[]) => {
      const port = transfer?.[0] as MessagePort | undefined
      port?.postMessage(reply)
    },
  } as unknown as ServiceWorker
}

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

describe('announcesUpdate', () => {
  it('stays quiet for the page that is already running the new build', () => {
    // Opening the app after a deploy loads the new code straight away and
    // the worker installs a moment later. Without this, every person's
    // first visit after every deploy ended in being told to reload onto
    // what they were already running.
    expect(announcesUpdate('abc123', 'abc123')).toBe(false)
  })

  it('speaks up when the page is behind the worker', () => {
    expect(announcesUpdate('abc123', 'def456')).toBe(true)
  })

  it('speaks up when either side cannot say which build it is', () => {
    // A banner nobody needed is a smaller failure than an update nobody
    // hears about — which is the failure this whole path exists to fix.
    expect(announcesUpdate(null, 'def456')).toBe(true)
    expect(announcesUpdate('abc123', null)).toBe(true)
    expect(announcesUpdate(null, null)).toBe(true)
  })
})

describe('askBuildId', () => {
  it('reads the id the worker sends back', async () => {
    await expect(askBuildId(workerReplying({ buildId: 'abc123' }))).resolves.toBe('abc123')
  })

  it('treats an answer that is not an id as no answer', async () => {
    await expect(askBuildId(workerReplying({ nothing: true }))).resolves.toBeNull()
  })

  it('gives up rather than hanging when a worker never replies', async () => {
    vi.useFakeTimers()
    const silent = { postMessage: () => {} } as unknown as ServiceWorker
    const answer = askBuildId(silent, 2000)
    await vi.advanceTimersByTimeAsync(2000)
    await expect(answer).resolves.toBeNull()
    vi.useRealTimers()
  })

  it('survives a worker that refuses the message outright', async () => {
    const broken = {
      postMessage: () => {
        throw new Error('worker is gone')
      },
    } as unknown as ServiceWorker
    await expect(askBuildId(broken)).resolves.toBeNull()
  })
})
