import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GUIDES,
  detectPlatform,
  hasSeenInstallGuide,
  markInstallGuideSeen,
} from './installGuide'

const withAgent = (userAgent: string, maxTouchPoints = 0) => {
  vi.stubGlobal('navigator', { userAgent, maxTouchPoints, onLine: true })
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('detectPlatform', () => {
  it('sends an iPhone to the Safari directions', () => {
    withAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari')
    expect(detectPlatform()).toBe('ios')
  })

  it('sends an iPad there too, though it claims to be a Mac', () => {
    withAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 5)
    expect(detectPlatform()).toBe('ios')
  })

  it('sends an Android phone to the Chrome directions', () => {
    withAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120')
    expect(detectPlatform()).toBe('android')
  })

  it('treats anything it cannot place as a computer', () => {
    // The least harmful guess: a laptop reading phone steps is confused,
    // a phone reading laptop steps is stuck.
    withAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120')
    expect(detectPlatform()).toBe('desktop')
  })
})

describe('the directions themselves', () => {
  it('gives every platform steps that each say what to do and where it is', () => {
    for (const guide of Object.values(GUIDES)) {
      expect(guide.steps.length).toBeGreaterThanOrEqual(4)
      for (const step of guide.steps) {
        expect(step.title.trim()).not.toBe('')
        // A step that only names a button is the kind of instruction that
        // works for whoever wrote it and nobody else.
        expect(step.detail.length).toBeGreaterThan(40)
      }
    }
  })

  it('tells an iPhone why this is not optional', () => {
    expect(GUIDES.ios.footnote).toMatch(/notification/i)
  })
})

describe('the glow', () => {
  it('glows until somebody has opened the directions', () => {
    expect(hasSeenInstallGuide()).toBe(false)
    markInstallGuideSeen()
    expect(hasSeenInstallGuide()).toBe(true)
  })

  it('glows when storage cannot be read at all', () => {
    // A private window throws on getItem. Not knowing means nudging, which
    // is the state the button exists for.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(hasSeenInstallGuide()).toBe(false)
    vi.restoreAllMocks()
  })

  it('survives storage that cannot be written to', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => markInstallGuideSeen()).not.toThrow()
    vi.restoreAllMocks()
  })
})
