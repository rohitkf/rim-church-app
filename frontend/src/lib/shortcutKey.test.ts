import { describe, expect, it } from 'vitest'
import { isApplePlatform, shortcutLabel, shortcutSpoken } from './shortcutKey'

const MAC = { platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
const WINDOWS = { platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
const LINUX = { platform: 'Linux x86_64', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }
const IPHONE = { platform: 'iPhone', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)' }
const ANDROID = { platform: 'Linux armv8l', userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B)' }

describe('which key the header advertises', () => {
  it('says Command on Apple', () => {
    expect(shortcutLabel(MAC)).toBe('⌘K')
    expect(shortcutLabel(IPHONE)).toBe('⌘K')
    expect(shortcutSpoken(MAC)).toBe('Command K')
  })

  it('says Control everywhere else', () => {
    // The bug: ⌘K was printed for these too, naming a key they do not have.
    expect(shortcutLabel(WINDOWS)).toBe('Ctrl K')
    expect(shortcutLabel(LINUX)).toBe('Ctrl K')
    expect(shortcutLabel(ANDROID)).toBe('Ctrl K')
    expect(shortcutSpoken(WINDOWS)).toBe('Control K')
  })

  it('does not read "Mac OS X" out of an Android user agent', () => {
    // Word-boundary, not a substring search: plenty of strings contain
    // "mac" (and Chrome on Android does not).
    expect(isApplePlatform({ platform: 'Linux', userAgent: 'Dalvik/2.1 (Linux; Chromacast)' })).toBe(false)
  })

  it('knows nothing gracefully', () => {
    expect(shortcutLabel({})).toBe('Ctrl K')
  })
})
