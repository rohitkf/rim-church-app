/**
 * Advance widths for the two fonts a label uses, in 1/1000 of the font
 * size — the units PDF's base-14 fonts are defined in.
 *
 * A PDF has no layout engine: text goes exactly where it is told, and runs
 * off the edge if it is too long. Wrapping an item name onto a label needs
 * to know how wide the words are, so the widths live here rather than
 * being guessed from an average character. They are checked against a real
 * renderer in the tests.
 */

const REGULAR =
  '278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 ' +
  '556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 ' +
  '1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 ' +
  '667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 ' +
  '333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 ' +
  '556 556 333 500 278 556 500 722 500 500 500 334 260 334 584'

const BOLD =
  '278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 ' +
  '556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 ' +
  '975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 ' +
  '667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 ' +
  '333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 ' +
  '611 611 389 556 333 611 556 778 556 556 500 389 280 389 584'

const WIDTHS = {
  regular: REGULAR.trim().split(/\s+/).map(Number),
  bold: BOLD.trim().split(/\s+/).map(Number),
}

/**
 * Latin-1 characters above the ASCII range are rare on a label and vary
 * little in width; the base letter they were folded from is close enough
 * to keep a line inside its column.
 */
const FALLBACK = { regular: 556, bold: 611 }

/** Courier is fixed pitch: every glyph is 600, at both weights. */
const COURIER = 600

export function charWidth(char: string, bold = false, mono = false): number {
  if (mono) return COURIER
  const code = char.charCodeAt(0)
  const table = bold ? WIDTHS.bold : WIDTHS.regular
  if (code >= 0x20 && code <= 0x7e) return table[code - 0x20]
  return bold ? FALLBACK.bold : FALLBACK.regular
}

/** How wide a string is when set at `size` points. */
export function textWidth(text: string, size: number, bold = false, mono = false): number {
  let total = 0
  for (const char of text) total += charWidth(char, bold, mono)
  return (total * size) / 1000
}

/**
 * Break text into lines that fit `maxWidth`.
 *
 * A word longer than the whole column — a serial number, usually — is cut
 * rather than allowed to overhang, because on a label the overhang is off
 * the edge of the sticker.
 */
export function wrapText(text: string, size: number, maxWidth: number, bold = false): string[] {
  const lines: string[] = []
  let line = ''

  const push = () => {
    if (line) lines.push(line)
    line = ''
  }

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word
    if (textWidth(candidate, size, bold) <= maxWidth) {
      line = candidate
      continue
    }
    push()

    if (textWidth(word, size, bold) <= maxWidth) {
      line = word
      continue
    }
    // Too long even alone. Break after a hyphen where there is one: an
    // asset code should read as MED-BRT-0001- / SPARE-B, not
    // MED-BRT-0001-S / PARE-B. Only a segment with nothing to break on
    // gets cut mid-token.
    for (const segment of word.split(/(?<=-)/)) {
      const joined = line + segment
      if (textWidth(joined, size, bold) <= maxWidth) {
        line = joined
        continue
      }
      push()

      if (textWidth(segment, size, bold) <= maxWidth) {
        line = segment
        continue
      }
      let chunk = ''
      for (const char of segment) {
        if (textWidth(chunk + char, size, bold) > maxWidth) {
          lines.push(chunk)
          chunk = char
        } else {
          chunk += char
        }
      }
      line = chunk
    }
  }

  push()
  return lines.length > 0 ? lines : ['']
}

/** Shorten to fit one line, ending in an ellipsis where it had to cut. */
export function truncateToWidth(
  text: string,
  size: number,
  maxWidth: number,
  bold = false,
  mono = false,
): string {
  if (textWidth(text, size, bold, mono) <= maxWidth) return text
  let out = ''
  for (const char of text) {
    if (textWidth(`${out}${char}...`, size, bold, mono) > maxWidth) break
    out += char
  }
  return `${out.trimEnd()}...`
}

/**
 * Wrap to at most `maxLines`, marking the last one if there was more.
 *
 * A label that silently drops the end of a name is worse than one that
 * shows it was cut: "Shure SM58 Vocal Microphone (spare, stage" reads as
 * the whole name until you go looking for the item and cannot find it.
 */
export function wrapToLines(
  text: string,
  size: number,
  maxWidth: number,
  maxLines: number,
  bold = false,
): string[] {
  const lines = wrapText(text, size, maxWidth, bold)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  kept[maxLines - 1] = truncateToWidth(
    `${kept[maxLines - 1]} ${lines[maxLines]}`,
    size,
    maxWidth,
    bold,
  )
  return kept
}

/**
 * The largest size at or below `maxSize` that fits `text` into `maxWidth`.
 *
 * For the one string on a label that must never be shortened — the asset
 * code. Truncating a name is a cosmetic loss; truncating the code that
 * identifies the item defeats the label. Shrinking the type instead keeps
 * every character, and `minSize` stops it shrinking past legibility (past
 * that the caller is expected to fall back to truncation).
 */
export function fitToWidth(
  text: string,
  maxSize: number,
  minSize: number,
  maxWidth: number,
  bold = false,
  mono = false,
): number {
  let size = maxSize
  while (size > minSize && textWidth(text, size, bold, mono) > maxWidth) {
    size -= 0.5
  }
  return size
}

/**
 * The largest size at or below `maxSize` at which `text` wraps into no more
 * than `maxLines` lines.
 *
 * A label is a fixed box with variable content: one item is called "Mixer"
 * and the next "Behringer X32 Compact Digital Mixing Desk". Rather than
 * shortening the long one, the type steps down until it fits the lines it
 * has been given — and only if it still does not fit at `minSize` does the
 * last line get cut.
 */
export function fitBlock(
  text: string,
  maxSize: number,
  minSize: number,
  maxWidth: number,
  maxLines: number,
  bold = false,
): { size: number; lines: string[] } {
  let size = maxSize
  while (size > minSize && wrapText(text, size, maxWidth, bold).length > maxLines) {
    size -= 0.5
  }
  return { size, lines: wrapToLines(text, size, maxWidth, maxLines, bold) }
}
