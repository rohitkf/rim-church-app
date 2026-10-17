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
  /** Courier rather than Helvetica — for times and counts, as on screen. */
  mono?: boolean
}

export interface PdfRect {
  x: number
  y: number
  w: number
  h: number
  color?: string
  /** Corner radius. The app's surfaces are rounded; its exports should be. */
  radius?: number
}

export interface PdfCircle {
  cx: number
  cy: number
  r: number
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

/**
 * A line drawing, stroked: an SVG path in a 24-unit box, placed at (x, y)
 * and drawn `size` points across. Only absolute M, L, H, V, C and Z are
 * understood — the subset the stage icons (lib/stageIcons) are written in.
 */
export interface PdfPath {
  d: string
  x: number
  y: number
  size: number
  color?: string
  /** Stroke width in the path's own 24-unit box. */
  width?: number
}

export interface PdfPage {
  width: number
  height: number
  texts: PdfText[]
  rects: PdfRect[]
  lines?: PdfLine[]
  circles?: PdfCircle[]
  paths?: PdfPath[]
  /**
   * The ground the page is painted on, for a format with no transparency
   * to fall back to. A PDF ignores it — its own backdrop rectangle is
   * drawn like any other — but a JPEG has to start from something, and
   * starting from white put a white hairline round a black sheet.
   */
  background?: string
}

/**
 * A circular arc is not a bezier, but four beziers with their control
 * points at this fraction of the radius are within a thousandth of one —
 * far closer than a printer can resolve.
 */
const KAPPA = 0.5523

/** A rounded rectangle as a path, in PDF's bottom-left coordinates. */
function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const k = r * KAPPA
  const R = (n: number) => round(n)
  return (
    `${R(x + r)} ${R(y)} m ` +
    `${R(x + w - r)} ${R(y)} l ` +
    `${R(x + w - r + k)} ${R(y)} ${R(x + w)} ${R(y + r - k)} ${R(x + w)} ${R(y + r)} c ` +
    `${R(x + w)} ${R(y + h - r)} l ` +
    `${R(x + w)} ${R(y + h - r + k)} ${R(x + w - r + k)} ${R(y + h)} ${R(x + w - r)} ${R(y + h)} c ` +
    `${R(x + r)} ${R(y + h)} l ` +
    `${R(x + r - k)} ${R(y + h)} ${R(x)} ${R(y + h - r + k)} ${R(x)} ${R(y + h - r)} c ` +
    `${R(x)} ${R(y + r)} l ` +
    `${R(x)} ${R(y + r - k)} ${R(x + r - k)} ${R(y)} ${R(x + r)} ${R(y)} c h`
  )
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

/**
 * The path's operators in page space: each point scaled from the 24-box
 * and, for the PDF, turned over (its y runs up the page). A command the
 * subset does not know ends the path there rather than drawing nonsense.
 */
export function pathOps(d: string, place: (x: number, y: number) => [number, number]): string {
  const tokens = d.match(/[MLHVCZ]|-?\d*\.?\d+/gi) ?? []
  const out: string[] = []
  let i = 0
  let cx = 0
  let cy = 0
  const num = () => Number(tokens[i++])
  const pt = (x: number, y: number) => {
    const [px, py] = place(x, y)
    return `${round(px)} ${round(py)}`
  }
  while (i < tokens.length) {
    const cmd = tokens[i++]
    switch (cmd) {
      case 'M':
        cx = num(); cy = num(); out.push(`${pt(cx, cy)} m`)
        break
      case 'L':
        cx = num(); cy = num(); out.push(`${pt(cx, cy)} l`)
        break
      case 'H':
        cx = num(); out.push(`${pt(cx, cy)} l`)
        break
      case 'V':
        cy = num(); out.push(`${pt(cx, cy)} l`)
        break
      case 'C': {
        const a = pt(num(), num())
        const b = pt(num(), num())
        cx = num(); cy = num()
        out.push(`${a} ${b} ${pt(cx, cy)} c`)
        break
      }
      case 'Z':
        out.push('h')
        break
      default:
        return out.join(' ')
    }
  }
  return out.join(' ')
}

function contentStream(page: PdfPage): string {
  const parts: string[] = []

  for (const r of page.rects) {
    // Rectangles are given a top-left y; PDF wants the bottom edge.
    const bottom = page.height - r.y - r.h
    const radius = Math.min(r.radius ?? 0, r.w / 2, r.h / 2)
    parts.push(
      radius > 0
        ? `${rgb(r.color)} rg ${roundedRectPath(r.x, bottom, r.w, r.h, radius)} f`
        : `${rgb(r.color)} rg ${round(r.x)} ${round(bottom)} ${round(r.w)} ${round(r.h)} re f`,
    )
  }

  for (const c of page.circles ?? []) {
    const cy = page.height - c.cy
    const k = c.r * KAPPA
    parts.push(
      `${rgb(c.color)} rg ` +
        `${round(c.cx + c.r)} ${round(cy)} m ` +
        `${round(c.cx + c.r)} ${round(cy + k)} ${round(c.cx + k)} ${round(cy + c.r)} ${round(c.cx)} ${round(cy + c.r)} c ` +
        `${round(c.cx - k)} ${round(cy + c.r)} ${round(c.cx - c.r)} ${round(cy + k)} ${round(c.cx - c.r)} ${round(cy)} c ` +
        `${round(c.cx - c.r)} ${round(cy - k)} ${round(c.cx - k)} ${round(cy - c.r)} ${round(c.cx)} ${round(cy - c.r)} c ` +
        `${round(c.cx + k)} ${round(cy - c.r)} ${round(c.cx + c.r)} ${round(cy - k)} ${round(c.cx + c.r)} ${round(cy)} c h f`,
    )
  }

  for (const l of page.lines ?? []) {
    parts.push(
      `q ${rgb(l.color)} RG ${round(l.width ?? 1)} w ` +
        `${l.dash ? `[${round(l.dash[0])} ${round(l.dash[1])}] 0 d ` : ''}` +
        `${round(l.x1)} ${round(page.height - l.y1)} m ${round(l.x2)} ${round(page.height - l.y2)} l S Q`,
    )
  }

  for (const p of page.paths ?? []) {
    const s = p.size / 24
    const ops = pathOps(p.d, (x, y) => [p.x + x * s, page.height - (p.y + y * s)])
    if (ops) parts.push(`q ${rgb(p.color)} RG ${round((p.width ?? 1.6) * s)} w 1 J 1 j ${ops} S Q`)
  }

  for (const t of page.texts) {
    parts.push(
      `BT ${rgb(t.color)} rg /${t.mono ? (t.bold ? 'F4' : 'F3') : t.bold ? 'F2' : 'F1'} ${round(t.size)} Tf ` +
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
 *
 * Object numbering: the catalog and the page tree take 1 and 2, then each
 * page contributes a pair (the page, then its content stream), and the
 * four fonts are shared at the end.
 */
export function buildPdfPages(pages: PdfPage[]): Uint8Array {
  if (pages.length === 0) throw new Error('A PDF needs at least one page.')

  const fontBase = 3 + pages.length * 2
  const kids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ')
  const fonts =
    `/F1 ${fontBase} 0 R /F2 ${fontBase + 1} 0 R ` +
    `/F3 ${fontBase + 2} 0 R /F4 ${fontBase + 3} 0 R`

  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
  ]

  pages.forEach((page, i) => {
    const stream = contentStream(page)
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${round(page.width)} ${round(page.height)}] ` +
        `/Resources << /Font << ${fonts} >> >> /Contents ${4 + i * 2} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    )
  })

  objects.push(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>',
  )

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

/** The single-page case, which is most of them. */
export function buildPdf(page: PdfPage): Uint8Array {
  return buildPdfPages([page])
}
