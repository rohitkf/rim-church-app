import { describe, expect, it } from 'vitest'
import { itemIdFromScan, itemScanUrl } from './qrLink'

const ID = '3f2b1a90-1c4d-4a7e-9b31-8a2d6e5f0c11'

describe('itemScanUrl', () => {
  it('builds a link a phone camera can open', () => {
    expect(itemScanUrl('https://rim-church-app.vercel.app', ID)).toBe(
      `https://rim-church-app.vercel.app/inventory/scan/${ID}`,
    )
  })

  it('does not double the slash when the origin brought one', () => {
    expect(itemScanUrl('https://example.org/', ID)).toBe(`https://example.org/inventory/scan/${ID}`)
  })
})

describe('itemIdFromScan', () => {
  it('reads our own codes', () => {
    expect(itemIdFromScan(`https://rim-church-app.vercel.app/inventory/scan/${ID}`)).toBe(ID)
  })

  // A label printed against a preview deployment names the same item, so
  // where it was printed should not matter.
  it('reads a code printed against another deployment of the app', () => {
    expect(itemIdFromScan(`https://rim-git-abc.vercel.app/inventory/scan/${ID}`)).toBe(ID)
  })

  it('ignores a query string or fragment the browser tacked on', () => {
    expect(itemIdFromScan(`https://x.dev/inventory/scan/${ID}?from=camera`)).toBe(ID)
    expect(itemIdFromScan(`https://x.dev/inventory/scan/${ID}#top`)).toBe(ID)
  })

  it('accepts a bare id, so one can be typed in by hand', () => {
    expect(itemIdFromScan(`  ${ID}  `)).toBe(ID)
  })

  // The camera sees every code in front of it, including the one on the
  // cable box. Anything that is not ours is not a destination.
  it('refuses codes that are not ours', () => {
    for (const other of [
      'https://example.com/promo',
      'WIFI:S:Church;T:WPA;P:hunter2;;',
      'https://x.dev/inventory/scan/not-a-uuid',
      '',
      '   ',
    ]) {
      expect(itemIdFromScan(other)).toBeNull()
    }
  })
})
