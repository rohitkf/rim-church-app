import { describe, expect, it } from 'vitest'
import { contentBounds, fitWithin } from './logoImage'

/** An image builder: `paint` decides each pixel, in RGBA. */
function image(
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number, number],
) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = paint(x, y)
      const i = (y * width + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  }
  return data
}

const TRANSPARENT: [number, number, number, number] = [0, 0, 0, 0]
const BLACK: [number, number, number, number] = [0, 0, 0, 255]
const WHITE: [number, number, number, number] = [255, 255, 255, 255]

describe('trimming the margin off a logo', () => {
  /*
   * The complaint this exists for: a mark uploaded with an inch of empty
   * space around it is drawn at a third of the size of one that was
   * cropped, and sits at a different height in the header.
   */
  it('finds the artwork inside a transparent margin', () => {
    const data = image(20, 20, (x, y) => (x >= 6 && x < 14 && y >= 4 && y < 12 ? BLACK : TRANSPARENT))
    expect(contentBounds(data, 20, 20)).toEqual({ x: 6, y: 4, width: 8, height: 8 })
  })

  /*
   * An opaque image is left alone on purpose. Trimming a white JPEG
   * border would be nice; the same rule crops a logo that comes on a
   * solid ground — the app's own blue tile, say — down to the letters
   * printed on it, and losing somebody's mark is a worse failure than
   * keeping a margin they chose.
   */
  it('leaves a solid ground alone rather than cropping a mark to its letters', () => {
    const data = image(10, 10, (x, y) => (x >= 2 && x < 8 && y >= 3 && y < 7 ? WHITE : BLACK))
    expect(contentBounds(data, 10, 10)).toEqual({ x: 0, y: 0, width: 10, height: 10 })
  })

  it('keeps artwork that runs to its own edges', () => {
    const data = image(8, 8, (x, y) => (x === 0 && y === 0 ? TRANSPARENT : BLACK))
    // One transparent corner pixel is not a margin.
    expect(contentBounds(data, 8, 8)).toEqual({ x: 0, y: 0, width: 8, height: 8 })
  })

  it('keeps everything when there is nothing drawn at all', () => {
    // Rather than collapsing to a zero-sized crop nothing can be drawn
    // into.
    const data = image(6, 6, () => TRANSPARENT)
    expect(contentBounds(data, 6, 6)).toEqual({ x: 0, y: 0, width: 6, height: 6 })
  })

  it('is not fooled by a faint anti-aliased edge', () => {
    const data = image(9, 9, (x, y) => (x === 4 && y === 4 ? [0, 0, 0, 4] : TRANSPARENT))
    // Four units of alpha is a ghost, not a mark.
    expect(contentBounds(data, 9, 9)).toEqual({ x: 0, y: 0, width: 9, height: 9 })
  })
})

describe('the size a logo is stored at', () => {
  it('fits a big image inside the box, keeping its shape', () => {
    expect(fitWithin(2000, 1000, 512)).toEqual({ width: 512, height: 256 })
    expect(fitWithin(1000, 2000, 512)).toEqual({ width: 256, height: 512 })
  })

  it('leaves a small one alone rather than blowing it up', () => {
    // Scaling up a 40-pixel mark to 512 makes a blurry 40-pixel mark.
    expect(fitWithin(40, 20, 512)).toEqual({ width: 40, height: 20 })
  })

  it('never rounds a thin strip away to nothing', () => {
    expect(fitWithin(4000, 3, 512).height).toBe(1)
  })
})
