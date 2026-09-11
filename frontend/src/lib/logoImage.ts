/**
 * Making one shape out of whatever somebody uploads.
 *
 * A logo arrives as a 2000-pixel PNG with an inch of transparent margin,
 * or a wide wordmark, or a JPEG with a white border baked into it. Drawn
 * straight into a 36-pixel box, each of those lands at a different size
 * and sits at a different height, which is why the mark in the header
 * never looked level with anything beside it.
 *
 * So the file is not stored as it arrives. It is trimmed of its dead
 * margin, scaled to a sane size and written back out, and the header then
 * draws a picture whose edges are the logo's own edges.
 *
 * The arithmetic lives here, away from the canvas, so it can be tested
 * without one.
 */

/** The edges of the part of an image that is actually drawn on. */
export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/** Anything this transparent is margin rather than artwork. 0-255. */
const ALPHA_FLOOR = 8

/**
 * The box around everything that is not transparent margin.
 *
 * Only transparency counts as margin. A logo that comes on a solid
 * ground — the app's own blue tile is one — has that ground as part of
 * the mark, and an opaque image is therefore left exactly as it is: a
 * white JPEG border is kept rather than guessed at, because the guess
 * that trims it is the same guess that would crop a blue square down to
 * the letters printed on it.
 *
 * Returns the whole image whenever there is nothing to trim, which is
 * also the right answer for artwork that runs to its own edges.
 */
export function contentBounds(data: Uint8ClampedArray, width: number, height: number): Bounds {
  const whole: Bounds = { x: 0, y: 0, width, height }
  if (width <= 0 || height <= 0) return whole

  const alphaAt = (x: number, y: number) => data[(y * width + x) * 4 + 3]

  let transparent = false
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < ALPHA_FLOOR) {
      transparent = true
      break
    }
  }
  if (!transparent) return whole

  let top = 0
  let bottom = height - 1
  let left = 0
  let right = width - 1

  const rowIsBlank = (y: number) => {
    for (let x = 0; x < width; x += 1) if (alphaAt(x, y) >= ALPHA_FLOOR) return false
    return true
  }
  const columnIsBlank = (x: number) => {
    for (let y = top; y <= bottom; y += 1) if (alphaAt(x, y) >= ALPHA_FLOOR) return false
    return true
  }

  while (top <= bottom && rowIsBlank(top)) top += 1
  // Every row was blank: nothing is drawn, so there is nothing to trim
  // to and the whole thing stands.
  if (top > bottom) return whole
  while (bottom > top && rowIsBlank(bottom)) bottom -= 1
  while (left < right && columnIsBlank(left)) left += 1
  while (right > left && columnIsBlank(right)) right -= 1

  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
}

/**
 * The size to draw something at, so that it fits inside a box without
 * being stretched — and without being blown up past what it has pixels
 * for, which only makes a small logo blurry.
 */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 }
  const scale = Math.min(max / width, max / height, 1)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** What a stored logo is scaled down to. Generous for a 36-pixel mark on
    a screen that may have three device pixels to each of ours. */
export const STORED_MAX = 512

/**
 * The file as it will actually be stored: trimmed, scaled, PNG.
 *
 * Whatever arrives — a 4000-pixel photograph of a banner, an SVG, a
 * wordmark with an inch of air around it — leaves here as a picture whose
 * edges are the mark's own edges, no larger than it needs to be. That is
 * what makes the header's logo the same size every time instead of
 * whatever the source file happened to imply.
 *
 * PNG because it is the one format that keeps transparency and is drawn
 * by everything. An SVG is rasterised: crispness at 36 pixels is not
 * worth a stored file whose size depends on what somebody drew in it.
 */
export async function normaliseLogo(file: File): Promise<Blob> {
  const source = URL.createObjectURL(file)
  try {
    const image = await loadImage(source)
    const natural = { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height }
    if (!natural.width || !natural.height) throw new Error('That image has no size to it.')

    // Read it at its own size first, so the trim is measured against
    // real pixels rather than a scaled-down guess at them.
    const read = document.createElement('canvas')
    read.width = natural.width
    read.height = natural.height
    const reading = read.getContext('2d')
    if (!reading) throw new Error('This browser will not let the app resize an image.')
    reading.drawImage(image, 0, 0, natural.width, natural.height)

    const box = contentBounds(
      reading.getImageData(0, 0, natural.width, natural.height).data,
      natural.width,
      natural.height,
    )
    const size = fitWithin(box.width, box.height, STORED_MAX)

    const out = document.createElement('canvas')
    out.width = size.width
    out.height = size.height
    const drawing = out.getContext('2d')
    if (!drawing) throw new Error('This browser will not let the app resize an image.')
    drawing.drawImage(image, box.x, box.y, box.width, box.height, 0, 0, size.width, size.height)

    return await new Promise<Blob>((resolve, reject) => {
      out.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('The image could not be re-saved.'))),
        'image/png',
      )
    })
  } finally {
    URL.revokeObjectURL(source)
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('That file could not be read as an image.'))
    image.src = src
  })
}
