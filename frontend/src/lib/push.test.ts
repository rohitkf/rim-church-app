import { afterEach, describe, expect, it, vi } from 'vitest'
import { notificationsSupported, permissionState, urlBase64ToUint8Array } from './push'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('urlBase64ToUint8Array', () => {
  it('decodes a base64url VAPID key, padding included', () => {
    // "hello" in base64url, deliberately unpadded the way VAPID keys are.
    expect(Array.from(urlBase64ToUint8Array('aGVsbG8'))).toEqual([104, 101, 108, 108, 111])
  })

  it('accepts the url-safe alphabet rather than choking on - and _', () => {
    // 0xFB 0xEF 0xBE encodes as "++--" in standard base64 and "--_-" style
    // in url-safe; the point is that - and _ decode rather than throw.
    expect(() => urlBase64ToUint8Array('-_-_')).not.toThrow()
    expect(urlBase64ToUint8Array('-_-_')).toHaveLength(3)
  })
})

describe('capability checks', () => {
  it('reports unsupported rather than throwing where there is no Notification API', () => {
    vi.stubGlobal('window', {})
    expect(notificationsSupported()).toBe(false)
    expect(permissionState()).toBe('unsupported')
  })

  it('reads the browser’s current permission when there is one', () => {
    vi.stubGlobal('window', { Notification: { permission: 'granted' } })
    vi.stubGlobal('navigator', { serviceWorker: {} })
    vi.stubGlobal('Notification', { permission: 'granted' })
    expect(permissionState()).toBe('granted')
  })
})
