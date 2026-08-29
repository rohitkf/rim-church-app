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
  /** 0 is black, 1 is white. */
  grey?: number
}

export interface PdfRect {
  x: number
  y: number
  w: number
  h: number
  grey?: number
}

export interface PdfPage {
  width: number
  height: number
  texts: PdfText[]
  rects: PdfRect[]
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
    const grey = r.grey ?? 0
    // Rectangles are given a top-left y; PDF wants the bottom edge.
    parts.push(
      `${round(grey)} g ${round(r.x)} ${round(page.height - r.y - r.h)} ${round(r.w)} ${round(r.h)} re f`,
    )
  }

  for (const t of page.texts) {
    const grey = t.grey ?? 0
    parts.push(
      `BT ${round(grey)} g /${t.bold ? 'F2' : 'F1'} ${round(t.size)} Tf ` +
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
