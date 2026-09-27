import type { CSSProperties } from 'react'

/**
 * The Team Coordinator's row, in the colour an Admin chose (0107).
 *
 * Null is the night sky it has always been: indigo and blue, which the
 * `.galaxy` class in index.css draws when `--sky` is unset. A colour
 * replaces both, and darkens the deep and the night under it towards the
 * same hue, so a green sky is a green night rather than green clouds on
 * an indigo one. The stars and the glisten stay white either way — they
 * are what make it a sky.
 */
export function skyStyle(color: string | null | undefined): CSSProperties | undefined {
  if (!color) return undefined
  return {
    '--sky': color,
    '--sky-deep': `color-mix(in oklab, ${color} 38%, #05060f)`,
    '--sky-night': `color-mix(in oklab, ${color} 16%, #05060f)`,
    '--sky-night-2': `color-mix(in oklab, ${color} 24%, #05060f)`,
  } as CSSProperties
}
