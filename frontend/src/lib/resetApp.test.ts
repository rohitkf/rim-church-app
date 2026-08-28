import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetApp } from './resetApp'

const unregister = vi.fn(() => Promise.resolve(true))
const deleteCache = vi.fn(() => Promise.resolve(true))
const replace = vi.fn()

beforeEach(() => {
  unregister.mockClear()
  deleteCache.mockClear()
  replace.mockClear()

  vi.stubGlobal('navigator', {
    serviceWorker: { getRegistrations: () => Promise.resolve([{ unregister }, { unregister }]) },
  })
  vi.stubGlobal('caches', { keys: () => Promise.resolve(['rim-shell-v1', 'rim-assets-v1']), delete: deleteCache })
  Object.defineProperty(window, 'caches', { value: globalThis.caches, configurable: true })
  Object.defineProperty(window, 'location', {
    value: { origin: 'https://example.test', replace },
    configurable: true,
  })

  localStorage.clear()
  localStorage.setItem('sb-abc-auth-token', 'stale')
  localStorage.setItem('rim-theme', 'dark')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resetApp', () => {
  it('drops every worker, cache and stored session, then reloads from the network', async () => {
    await resetApp()

    expect(unregister).toHaveBeenCalledTimes(2)
    expect(deleteCache).toHaveBeenCalledWith('rim-shell-v1')
    expect(deleteCache).toHaveBeenCalledWith('rim-assets-v1')

    // The session goes; the person's own preferences stay.
    expect(localStorage.getItem('sb-abc-auth-token')).toBeNull()
    expect(localStorage.getItem('rim-theme')).toBe('dark')

    expect(replace).toHaveBeenCalledTimes(1)
    expect(replace.mock.calls[0][0]).toMatch(/^https:\/\/example\.test\/\?fresh=\d+$/)
  })

  it('still reloads when a worker refuses to unregister', async () => {
    vi.stubGlobal('navigator', {
      serviceWorker: { getRegistrations: () => Promise.reject(new Error('nope')) },
    })

    await resetApp()

    expect(replace).toHaveBeenCalledTimes(1)
  })
})
