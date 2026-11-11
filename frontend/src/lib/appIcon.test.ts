import { describe, expect, it } from 'vitest'
import {
  ICON_SPECS,
  applyPageIcons,
  iconGround,
  iconShare,
  iconUrl,
  iconWork,
  logoIdOf,
  logoOfSet,
  newestSet,
  placeInIcon,
  setNameFor,
  setOfManifest,
} from './appIcon'

/*
 * The installed app's icon is the App Logo. What is tested here is the
 * deciding: which logo a set was made from, when a new one is due, what a
 * logo stands on and how big it is drawn. The drawing itself needs a real
 * canvas and is looked at in a browser.
 */

const LOGO = 'logo/2f5d58eb-0c1e-4a57-9d2b-7c1f0a9e4b11.png'
const ID = '2f5d58eb-0c1e-4a57-9d2b-7c1f0a9e4b11'

describe('a set of icons is named after when, and which logo', () => {
  it('reads the logo’s id out of its path', () => {
    expect(logoIdOf(LOGO)).toBe(ID)
    expect(logoIdOf(null)).toBeNull()
    expect(logoIdOf('')).toBeNull()
    // Whatever a path holds, the name made from it cannot leave its folder.
    expect(logoIdOf('logo/../../etc/pass wd.png')).toBe('passwd')
  })

  it('names a set so that a later one sorts first, and says what it was made from', () => {
    const earlier = setNameFor(ID, 1_700_000_000_000)
    const later = setNameFor(ID, 1_800_000_000_000)
    expect(logoOfSet(later)).toBe(ID)
    expect(newestSet([earlier, later])).toBe(later)
    expect(newestSet([later, earlier])).toBe(later)
  })

  it('ignores anything in the folder that is not a set', () => {
    expect(newestSet(['.emptyFolderPlaceholder', '../x', 'readme'])).toBeNull()
    expect(newestSet([])).toBeNull()
  })
})

describe('what there is to do', () => {
  const made = setNameFor(ID, 1_800_000_000_000)

  it('is nothing when the newest set was made from the logo in use', () => {
    expect(iconWork(LOGO, [made])).toEqual({ make: null, remove: [] })
  })

  it('is a new set when there is a logo and no set, as on the day this shipped', () => {
    expect(iconWork(LOGO, [])).toEqual({ make: ID, remove: [] })
  })

  it('is a new set, and the old one gone, when the logo has changed', () => {
    const before = setNameFor('0a0a0a0a-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1_700_000_000_000)
    expect(iconWork(LOGO, [before])).toEqual({ make: ID, remove: [before] })
  })

  it('takes every set down when the logo is taken down: the app’s own icon comes back', () => {
    expect(iconWork(null, [made])).toEqual({ make: null, remove: [made] })
  })

  it('tidies a set left behind by an earlier logo', () => {
    const before = setNameFor('0a0a0a0a-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1_700_000_000_000)
    expect(iconWork(LOGO, [made, before])).toEqual({ make: null, remove: [before] })
  })
})

/** A picture of one colour, with the middle painted another. */
function picture(size: number, ground: [number, number, number, number], middle?: [number, number, number, number]) {
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const inMiddle = middle && x >= size / 4 && x < (size * 3) / 4 && y >= size / 4 && y < (size * 3) / 4
      data.set(inMiddle ? middle : ground, (y * size + x) * 4)
    }
  }
  return data
}

describe('what a logo stands on', () => {
  it('is its own ground when it comes on one: the church’s black tile stays black', () => {
    const tile = picture(16, [0, 0, 0, 255], [255, 255, 255, 255])
    expect(iconGround(tile, 16, 16)).toEqual({ color: [0, 0, 0], tile: true })
  })

  it('is white for a dark shape on a transparent ground', () => {
    const shape = picture(16, [0, 0, 0, 0], [20, 30, 90, 255])
    expect(iconGround(shape, 16, 16)).toEqual({ color: [255, 255, 255], tile: false })
  })

  it('is black for a light shape, which white would hide', () => {
    const shape = picture(16, [0, 0, 0, 0], [250, 250, 245, 255])
    expect(iconGround(shape, 16, 16)).toEqual({ color: [0, 0, 0], tile: false })
  })

  it('is not taken for a tile when its corners disagree', () => {
    const data = picture(16, [255, 255, 255, 255])
    data.set([0, 0, 0, 255], 0)
    expect(iconGround(data, 16, 16).tile).toBe(false)
  })

  it('is white when there is nothing to read', () => {
    expect(iconGround(new Uint8ClampedArray(0), 0, 0)).toEqual({ color: [255, 255, 255], tile: false })
    expect(iconGround(picture(8, [0, 0, 0, 0]), 8, 8)).toEqual({ color: [255, 255, 255], tile: false })
  })
})

describe('how big the logo is drawn', () => {
  it('runs a tile to the edge of a plain icon, and pulls it inside Android’s mask', () => {
    expect(iconShare('plain', true)).toBe(1)
    expect(iconShare('maskable', true)).toBe(0.8)
  })

  it('gives a shape air, and more of it under the mask', () => {
    expect(iconShare('plain', false)).toBeLessThan(1)
    expect(iconShare('maskable', false)).toBeLessThan(iconShare('plain', false))
  })

  it('keeps the whole of a masked shape inside the circle Android promises to keep', () => {
    // The mask keeps a circle four fifths of the icon wide. A square logo's
    // corner is the furthest it reaches from the middle.
    const at = placeInIcon(512, 400, 400, iconShare('maskable', false))
    const corner = Math.hypot(at.width / 2, at.height / 2)
    expect(corner).toBeLessThanOrEqual((512 * 0.8) / 2)
  })

  it('centres the logo and keeps its own shape', () => {
    expect(placeInIcon(512, 1254, 1254, 1)).toEqual({ x: 0, y: 0, width: 512, height: 512 })
    // A wide wordmark: as wide as its share allows, and level in the middle.
    const wide = placeInIcon(200, 400, 100, 0.8)
    expect(wide).toEqual({ x: 20, y: 80, width: 160, height: 40 })
  })

  it('draws nothing from nothing', () => {
    expect(placeInIcon(512, 0, 10, 1)).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })
})

describe('the page’s own icons', () => {
  const set = setNameFor(ID, 1_800_000_000_000)

  it('points the tab and the iPhone’s Home Screen at the set', () => {
    const doc = document.implementation.createHTMLDocument('app')
    doc.head.innerHTML =
      '<link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="apple-touch-icon" href="/apple-touch-icon.png">'
    applyPageIcons(set, doc)
    expect(doc.head.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href')).toBe(iconUrl(set, 'apple-touch-icon.png'))
    const tab = doc.head.querySelector('link[rel="icon"]')
    expect(tab?.getAttribute('href')).toBe(iconUrl(set, 'icon-192.png'))
    expect(tab?.getAttribute('type')).toBe('image/png')
    // Changed in place: two icon links would leave the browser to pick.
    expect(doc.head.querySelectorAll('link[rel="icon"]')).toHaveLength(1)
  })

  it('leaves the app’s own in place when there is no set, or a name that is not one', () => {
    const doc = document.implementation.createHTMLDocument('app')
    doc.head.innerHTML = '<link rel="apple-touch-icon" href="/apple-touch-icon.png">'
    applyPageIcons(null, doc)
    applyPageIcons('../../somewhere', doc)
    expect(doc.head.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href')).toBe('/apple-touch-icon.png')
  })

  it('reads the set out of a manifest that names the church’s icons, and none out of the app’s own', () => {
    expect(setOfManifest({ icons: [{ src: iconUrl(set, 'icon-192.png') }] })).toBe(set)
    expect(setOfManifest({ icons: [{ src: '/icon-192.png' }] })).toBeNull()
    expect(setOfManifest({ icons: [{ src: '/app-icon/..%2F/icon-192.png' }] })).toBeNull()
    expect(setOfManifest(null)).toBeNull()
    expect(setOfManifest({})).toBeNull()
  })
})

describe('the set', () => {
  it('has the sizes a phone asks for, each once', () => {
    expect(ICON_SPECS.map((s) => `${s.file}:${s.size}:${s.shape}`)).toEqual([
      'icon-192.png:192:plain',
      'icon-512.png:512:plain',
      'icon-maskable-512.png:512:maskable',
      'apple-touch-icon.png:180:plain',
    ])
  })
})
