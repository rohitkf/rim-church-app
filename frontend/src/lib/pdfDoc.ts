/**
 * A very small PDF writer: text and filled rectangles on one page.
 *
 * Enough for an equipment label and nothing more. It exists rather than a
 * PDF library because the only graphic here is a QR code, and a QR code is
 * a grid of squares — drawn as rectangles it stays sharp at any size a
 * label printer is set to, where a rasterised image would not, and the
 * whole file comes to a couple of kilobytes.
 *
 * Coordinates are given from the top-left, because that is how a page
 * reads; PDF measures from the bottom-left, and the conversion happens
 * here so callers never think about it.
 */

export interface PdfText {
  x: number
  y: number
  size: number
  text: string
  bold?: boolean
  /** Hex, like the rest of the app's colours. Black when left out. */
  color?: string
}

export interface PdfRect {
  x: number
  y: number
  w: number
  h: number
  color?: string
}

/** A line, for a border or a cut mark. */
export interface PdfLine {
  x1: number
  y1: number
  x2: number
  y2: number
  width?: number
  color?: string
  /** On/off lengths, for a cut line that reads as "cut here". */
  dash?: [number, number]
}

export interface PdfPage {
  width: number
  height: number
  texts: PdfText[]
  rects: PdfRect[]
  lines?: PdfLine[]
}

/** Hex to the three 0-1 components PDF wants. */
function rgb(hex: string | undefined): string {
  const value = (hex ?? '#000000').replace('#', '')
  const full = value.length === 3 ? [...value].map((c) => c + c).join('') : value
  const n = parseInt(full, 16)
  if (Number.isNaN(n)) return '0 0 0'
  const c = (shift: number) => Math.round((((n >> shift) & 255) / 255) * 1000) / 1000
  return `${c(16)} ${c(8)} ${c(0)}`
}

/** A4 in points, which is what PDF measures in. */
export const A4 = { width: 595.28, height: 841.89 }

/**
 * WinAnsi is a single-byte encoding, so a character written here is one
 * byte counted in the cross-reference table - which is why nothing wider
 * may survive. Latin-1 covers what an equipment label actually needs: the
 * pound sign, the middle dot, and the accents in people's names.
 *
 * Anything outside it is folded to the letters underneath where that keeps
 * the word readable, and replaced where it does not.
 */
const KEEPS = /[\x20-\x7e\xa0-\xff]/

export function latin1ForPdf(value: string): string {
  const straightened = value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')

  let out = ''
  let dropped = false
  for (const ch of straightened) {
    if (KEEPS.test(ch)) {
      out += ch
      dropped = false
      continue
    }
    const folded = [...ch.normalize('NFD')].filter((c) => KEEPS.test(c)).join('')
    if (folded) {
      out += folded
      dropped = false
    } else if (!dropped) {
      // One mark for a run, so a surrogate pair does not leave two.
      out += '?'
      dropped = true
    }
  }
  return out
}

/** `(`, `)` and `\` end or escape a string literal, so they are escaped. */
function escapeText(value: string): string {
  return latin1ForPdf(value).replace(/([\\()])/g, '\\$1')
}

const round = (n: number) => Math.round(n * 100) / 100

function contentStream(page: PdfPage): string {
  const parts: string[] = []

  for (const r of page.rects) {
    // Rectangles are given a top-left y; PDF wants the bottom edge.
    parts.push(
      `${rgb(r.color)} rg ${round(r.x)} ${round(page.height - r.y - r.h)} ${round(r.w)} ${round(r.h)} re f`,
    )
  }

  for (const l of page.lines ?? []) {
    parts.push(
      `q ${rgb(l.color)} RG ${round(l.width ?? 1)} w ` +
        `${l.dash ? `[${round(l.dash[0])} ${round(l.dash[1])}] 0 d ` : ''}` +
        `${round(l.x1)} ${round(page.height - l.y1)} m ${round(l.x2)} ${round(page.height - l.y2)} l S Q`,
    )
  }

  for (const t of page.texts) {
    parts.push(
      `BT ${rgb(t.color)} rg /${t.bold ? 'F2' : 'F1'} ${round(t.size)} Tf ` +
        `${round(t.x)} ${round(page.height - t.y)} Td (${escapeText(t.text)}) Tj ET`,
    )
  }

  return parts.join('\n')
}

/**
 * Assemble the file.
 *
 * The cross-reference table is a list of byte offsets to each object, so
 * the objects are laid out first and measured as they go. Everything is
 * ASCII by this point, so a character is a byte.
 */
export function buildPdf(page: PdfPage): Uint8Array {
  const stream = contentStream(page)

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${round(page.width)} ${round(page.height)}] ` +
      '/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ]

  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((object, i) => {
    offsets.push(body.length)
    body += `${i + 1} 0 obj\n${object}\nendobj\n`
  })

  const xrefAt = body.length
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) xref += `${String(offset).padStart(10, '0')} 00000 n \n`

  const file =
    body +
    xref +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`

  const bytes = new Uint8Array(file.length)
  for (let i = 0; i < file.length; i += 1) bytes[i] = file.charCodeAt(i) & 0xff
  return bytes
}
