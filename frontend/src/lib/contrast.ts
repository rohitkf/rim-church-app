/**
 * How readable one colour is on another, by the only measure that is not
 * an opinion.
 *
 * WCAG's contrast ratio: both colours are turned into relative luminance
 * and compared. 4.5:1 is the floor for ordinary text, 3:1 for large text
 * — 18pt, or 14pt bold — because a bigger letterform carries a thinner
 * signal.
 *
 * This is here for the exported sheet, which is drawn as coordinates and
 * colours rather than as a page a browser could be asked about. Nothing
 * about it is specific to that, and a test can hold the whole sheet to it
 * at once — which is the point: "is that grey readable" is a question
 * somebody would otherwise answer by looking at their own screen, in
 * their own light, and being sure.
 */

/** #rgb or #rrggbb to its three channels. */
export function channels(hex: string): [number, number, number] {
  const clean = hex.trim().replace('#', '')
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`Not a plain hex colour: ${hex}`)
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}

/** Relative luminance, as WCAG defines it. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const channel = v / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** 1 for two identical colours, 21 for black on white. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/**
 * The floor this text has to clear: 3:1 once it is large enough to carry
 * on its own, 4.5:1 otherwise. Sizes are in points, which is what the
 * sheet is measured in.
 */
export function contrastFloor({ size, bold }: { size: number; bold?: boolean }): number {
  const large = size >= 18 || (!!bold && size >= 14)
  return large ? 3 : 4.5
}
