import { supabase } from './supabaseClient'
import { BRANDING_BUCKET } from './appLogo'
import { loadImage } from './logoImage'

/**
 * The installed app's icon is the App Logo.
 *
 * A phone's Home Screen icon, a desktop shortcut and a browser tab are all
 * pictures the device fetches on its own, signed out, at sizes and shapes
 * of its choosing: a 192 and a 512 square, a "maskable" 512 that Android
 * crops to whatever shape the phone's maker likes, a 180 for an iPhone.
 * The logo is one picture of whatever shape the church drew. So the app
 * makes the set from the logo, here, in the browser of whoever may change
 * the logo, and stores it beside the logo in the `branding` bucket:
 *
 *   icon/<set>/icon-192.png · icon-512.png · icon-maskable-512.png · apple-touch-icon.png
 *
 * A set's name is when it was made (so the newest sorts first) and the
 * logo it was made from (so it is plain when a new logo has no icons
 * yet). `api/manifest.js` names the newest set's pictures in the manifest
 * and `api/app-icon.js` serves them; with no set, both answer with the
 * app's own icons. See `api/_appIcon.js`, which this file's names must
 * match (`api/_appIcon.test.js` holds the two together).
 *
 * The arithmetic is kept away from the canvas so it can be tested
 * without one.
 */

export const ICON_FOLDER = 'icon'

/** How a picture is laid into its square. */
export type IconShape = 'plain' | 'maskable'

export const ICON_SPECS: readonly { file: string; size: number; shape: IconShape }[] = [
  { file: 'icon-192.png', size: 192, shape: 'plain' },
  { file: 'icon-512.png', size: 512, shape: 'plain' },
  // Android draws this one under a mask of its own (a circle, a squircle),
  // and promises to keep only the middle: a circle four fifths as wide.
  { file: 'icon-maskable-512.png', size: 512, shape: 'maskable' },
  // An iPhone rounds the corners itself and paints transparency black.
  { file: 'apple-touch-icon.png', size: 180, shape: 'plain' },
]

const SET_NAME = /^[a-z0-9]{1,16}-[A-Za-z0-9-]{1,64}$/

/** `logo/<id>.png` → `<id>`: what a set made from this logo is named after. */
export function logoIdOf(path: string | null | undefined): string | null {
  if (!path) return null
  const file = path.split('/').pop() ?? ''
  const id = file.replace(/\.[A-Za-z0-9]+$/, '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 64)
  return id || null
}

/** A new set's name: when, then which logo. */
export function setNameFor(logoId: string, now: number): string {
  return `${Math.max(0, Math.floor(now)).toString(36)}-${logoId}`
}

/** The logo a set was made from. */
export function logoOfSet(set: string): string {
  return set.slice(set.indexOf('-') + 1)
}

/** The newest of the sets in the bucket, by the time in their names. */
export function newestSet(names: readonly string[]): string | null {
  const sets = names.filter((name) => SET_NAME.test(name))
  if (sets.length === 0) return null
  const stamp = (name: string) => name.slice(0, name.indexOf('-'))
  // Same-length base-36 stamps sort as text; a longer stamp is a later time.
  return [...sets].sort(
    (a, b) => stamp(b).length - stamp(a).length || (stamp(b) > stamp(a) ? 1 : stamp(b) < stamp(a) ? -1 : 0),
  )[0]
}

/**
 * What there is to do, given the logo and the sets already stored.
 *
 * Nothing, when the newest set was made from this logo. A new set when it
 * was not, or when there is none. And with no logo, no sets: the app's own
 * icon comes back the moment the church's mark is taken down.
 */
export function iconWork(logoPath: string | null, names: readonly string[]): { make: string | null; remove: string[] } {
  const sets = names.filter((name) => SET_NAME.test(name))
  const logoId = logoIdOf(logoPath)
  if (!logoId) return { make: null, remove: sets }
  const current = newestSet(sets)
  if (current && logoOfSet(current) === logoId) return { make: null, remove: sets.filter((s) => s !== current) }
  return { make: logoId, remove: sets }
}

/** A colour as the canvas takes it. */
export type Rgb = [number, number, number]

/**
 * What the logo stands on in an icon.
 *
 * A logo that comes on a ground of its own (four opaque corners of one
 * colour: a black tile, a blue square) is the whole icon already, and its
 * ground is carried on to the edge wherever the square is bigger than the
 * picture. A logo with a transparent ground is a shape, and a shape needs
 * something behind it: white, unless the shape itself is light, in which
 * case white would hide it and it stands on black.
 */
export function iconGround(data: Uint8ClampedArray, width: number, height: number): { color: Rgb; tile: boolean } {
  const white: Rgb = [255, 255, 255]
  if (width <= 0 || height <= 0 || data.length < width * height * 4) return { color: white, tile: false }
  const at = (x: number, y: number) => {
    const i = (y * width + x) * 4
    return [data[i], data[i + 1], data[i + 2], data[i + 3]] as const
  }
  const corners = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)]
  const opaque = corners.every((c) => c[3] >= 250)
  const near = corners.every((c) => [0, 1, 2].every((k) => Math.abs(c[k] - corners[0][k]) <= 24))
  if (opaque && near) {
    const mean = (k: number) => Math.round(corners.reduce((sum, c) => sum + c[k], 0) / corners.length)
    return { color: [mean(0), mean(1), mean(2)], tile: true }
  }

  let light = 0
  let seen = 0
  for (let i = 0; i < width * height * 4; i += 4) {
    if (data[i + 3] < 128) continue
    light += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
    seen += 1
  }
  if (seen === 0) return { color: white, tile: false }
  return { color: light / seen > 0.6 ? [0, 0, 0] : white, tile: false }
}

/**
 * How much of the square the logo may take.
 *
 * A tile runs to the edge of a plain icon, as it was drawn. Under
 * Android's mask it is pulled in to the part the mask keeps, with its own
 * colour carried out to the edge. A shape gets air round it, and more of
 * it under the mask, so that no corner of it is cropped.
 */
export function iconShare(shape: IconShape, tile: boolean): number {
  // The mask keeps a circle 0.8 of the icon wide. A square shape fits
  // inside it at 0.8 / √2 = 0.566 and no more; a tile's own corners are
  // only its ground, which is the colour behind it anyway.
  if (shape === 'maskable') return tile ? 0.8 : 0.56
  return tile ? 1 : 0.76
}

/** Where the logo goes: as big as its share allows, its own shape, in the middle. */
export function placeInIcon(
  size: number,
  width: number,
  height: number,
  share: number,
): { x: number; y: number; width: number; height: number } {
  if (size <= 0 || width <= 0 || height <= 0) return { x: 0, y: 0, width: 0, height: 0 }
  const box = size * share
  const scale = Math.min(box / width, box / height)
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  return { x: Math.round((size - w) / 2), y: Math.round((size - h) / 2), width: w, height: h }
}

/** The set of pictures, drawn from the logo. */
export async function drawIcons(logo: Blob): Promise<{ file: string; blob: Blob }[]> {
  const source = URL.createObjectURL(logo)
  try {
    const image = await loadImage(source)
    const natural = { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height }
    if (!natural.width || !natural.height) throw new Error('The logo has no size to it.')

    // Read small: the ground is a question about colour, not about detail.
    const probe = placeInIcon(128, natural.width, natural.height, 1)
    const reading = document.createElement('canvas')
    reading.width = probe.width
    reading.height = probe.height
    const read = reading.getContext('2d')
    if (!read) throw new Error('This browser will not let the app draw an icon.')
    read.drawImage(image, 0, 0, probe.width, probe.height)
    const ground = iconGround(read.getImageData(0, 0, probe.width, probe.height).data, probe.width, probe.height)

    const icons: { file: string; blob: Blob }[] = []
    for (const spec of ICON_SPECS) {
      const canvas = document.createElement('canvas')
      canvas.width = spec.size
      canvas.height = spec.size
      const pen = canvas.getContext('2d')
      if (!pen) throw new Error('This browser will not let the app draw an icon.')
      pen.fillStyle = `rgb(${ground.color[0]}, ${ground.color[1]}, ${ground.color[2]})`
      pen.fillRect(0, 0, spec.size, spec.size)
      pen.imageSmoothingEnabled = true
      pen.imageSmoothingQuality = 'high'
      const at = placeInIcon(spec.size, natural.width, natural.height, iconShare(spec.shape, ground.tile))
      pen.drawImage(image, at.x, at.y, at.width, at.height)
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The icon could not be saved.'))), 'image/png')
      })
      icons.push({ file: spec.file, blob })
    }
    return icons
  } finally {
    URL.revokeObjectURL(source)
  }
}

/** The sets stored in the bucket. */
export async function listIconSets(): Promise<string[]> {
  const { data, error } = await supabase.storage
    .from(BRANDING_BUCKET)
    .list(ICON_FOLDER, { limit: 100, sortBy: { column: 'name', order: 'desc' } })
  if (error) throw error
  return (data ?? []).map((entry) => entry.name).filter((name) => SET_NAME.test(name))
}

const filesOf = (set: string) => ICON_SPECS.map((spec) => `${ICON_FOLDER}/${set}/${spec.file}`)

/**
 * Bring the stored icons into line with the logo. Returns the set now
 * current (null when the app's own icon stands), and whether anything was
 * changed. Only somebody who may change the logo can write to the bucket;
 * for anybody else the storage rules refuse and this throws.
 */
export async function syncAppIcons(logoPath: string | null): Promise<{ set: string | null; changed: boolean }> {
  const sets = await listIconSets()
  const work = iconWork(logoPath, sets)
  let current = work.make ? null : newestSet(sets.filter((s) => !work.remove.includes(s)))

  if (work.make && logoPath) {
    const { data: logo, error: readErr } = await supabase.storage.from(BRANDING_BUCKET).download(logoPath)
    if (readErr) throw readErr
    const icons = await drawIcons(logo)
    const set = setNameFor(work.make, Date.now())
    for (const icon of icons) {
      const { error } = await supabase.storage
        .from(BRANDING_BUCKET)
        // A set never changes once made, so whatever fetched it may keep it.
        .upload(`${ICON_FOLDER}/${set}/${icon.file}`, icon.blob, { contentType: 'image/png', cacheControl: '31536000' })
      if (error) {
        // Half a set is worse than none: a manifest would name pictures that are not there.
        await supabase.storage.from(BRANDING_BUCKET).remove(filesOf(set))
        throw error
      }
    }
    current = set
  }

  if (work.remove.length > 0) {
    // Best effort: a set left behind is tidied the next time this runs.
    await supabase.storage.from(BRANDING_BUCKET).remove(work.remove.flatMap(filesOf))
  }
  return { set: current, changed: !!work.make || work.remove.length > 0 }
}

/** Where a set's picture is served from (api/app-icon.js, by vercel.json). */
export function iconUrl(set: string, file: string): string {
  return `/app-icon/${set}/${file}`
}

/**
 * Point this page's own icons at the set: the tab's, and the one an iPhone
 * takes for its Home Screen. An iPhone reads `apple-touch-icon` from the
 * page as it stands when "Add to Home Screen" is pressed, not from the
 * manifest, so the link has to be changed on the page itself. With no set
 * the links are left as index.html wrote them.
 */
export function applyPageIcons(set: string | null, doc: Document = document): void {
  if (!set || !SET_NAME.test(set)) return
  const point = (rel: string, href: string, type?: string) => {
    let link = doc.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
    if (!link) {
      link = doc.createElement('link')
      link.rel = rel
      doc.head.appendChild(link)
    }
    if (type) link.type = type
    link.href = href
  }
  point('apple-touch-icon', iconUrl(set, 'apple-touch-icon.png'))
  point('icon', iconUrl(set, 'icon-192.png'), 'image/png')
}

/** The set a manifest names, if its icons are the church's. */
export function setOfManifest(manifest: unknown): string | null {
  const icons = (manifest as { icons?: { src?: unknown }[] } | null)?.icons
  if (!Array.isArray(icons)) return null
  for (const icon of icons) {
    const match = typeof icon?.src === 'string' ? /^\/app-icon\/([^/]+)\//.exec(icon.src) : null
    if (match && SET_NAME.test(match[1])) return match[1]
  }
  return null
}

/**
 * On opening, for everybody, signed in or not: ask the manifest which
 * icons are current and point the page's at them. Quiet about failure: the
 * links index.html wrote are the app's own icon, which is the right thing
 * to show when this cannot be asked.
 */
export async function pointPageAtPublishedIcons(): Promise<void> {
  try {
    const res = await fetch('/manifest.webmanifest', { credentials: 'omit' })
    if (!res.ok) return
    applyPageIcons(setOfManifest(await res.json()))
  } catch {
    // Offline, or a host with no manifest: nothing to change.
  }
}
