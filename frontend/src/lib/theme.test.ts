import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, readThemePreference, resolveTheme, writeThemePreference } from './theme'

const mockSystem = (dark: boolean) => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: dark && query.includes('dark'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('resolveTheme', () => {
  it('takes an explicit choice at face value', () => {
    mockSystem(true)
    expect(resolveTheme('light')).toBe('light')
    expect(resolveTheme('dark')).toBe('dark')
  })

  it('follows the operating system when asked to', () => {
    mockSystem(true)
    expect(resolveTheme('system')).toBe('dark')
    mockSystem(false)
    expect(resolveTheme('system')).toBe('light')
  })
})

describe('readThemePreference', () => {
  it('returns what was stored', () => {
    writeThemePreference('light')
    expect(readThemePreference()).toBe('light')
  })

  it('falls back when nothing is stored or the value is junk', () => {
    expect(readThemePreference()).toBe('dark')
    window.localStorage.setItem('rim-theme', 'neon')
    expect(readThemePreference()).toBe('dark')
  })

  it('survives storage that throws', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readThemePreference('light')).toBe('light')
    getItem.mockRestore()
  })
})

describe('applyTheme', () => {
  it('stamps the resolved theme on the document', () => {
    mockSystem(false)
    applyTheme('system')
    expect(document.documentElement.dataset.theme).toBe('light')
    applyTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
