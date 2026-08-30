import { A4, buildPdfPages, type PdfLine, type PdfPage, type PdfRect, type PdfText } from './pdfDoc'
import { fitBlock, textWidth } from './helveticaMetrics'

/**
 * Printable stickers for inventory items — one sticker, one QR, one item.
 *
 * Printed in black only. These go on equipment and get photocopied, faxed
 * to an insurer and scanned in poor light; a colour that identifies the
 * team is worth nothing once it has been through any of that, and colour
 * toner is the expensive kind. Black on white also gives the QR the
 * contrast it wants.
 *
 * Eight to an A4 sheet in a plain 2 x 4 grid, so a page of them can be run
 * off on ordinary label stock or on paper and cut down the printed guides.
 * The same layout serves one sticker or ninety.
 */

export interface ItemLabel {
  /** The register's own code — the thing to search the app for. */
  assetTag: string | null
  name: string
  brand: string | null
  /** The manufacturer's product name or model number. */
  model: string | null
  serial: string | null
  /** The QR as a square grid of true/false — true is a dark module. */
  modules: boolean[][]
}

const INK = '#000000'
const MUTED = '#5a5a5a'
const HAIRLINE = '#000000'
const GUIDE = '#c8c8c8'

/** A 2 x 4 grid on A4, with a margin the average printer can actually reach. */
const MARGIN = 34
const COLS = 2
const ROWS = 4
export const PER_PAGE = COLS * ROWS
const GUTTER = 16
const CELL_W = (A4.width - MARGIN * 2 - GUTTER * (COLS - 1)) / COLS
const CELL_H = (A4.height - MARGIN * 2 - GUTTER * (ROWS - 1)) / ROWS

interface Ctx {
  texts: PdfText[]
  rects: PdfRect[]
  lines: PdfLine[]
}

/** The QR, drawn as modules inside a white square with its quiet zone. */
function drawQr(ctx: Ctx, modules: boolean[][], x: number, y: number, size: number) {
  const count = modules.length
  if (count === 0) return
  // A QR needs light around it or a reader cannot find its edges. Four
  // modules is the specified quiet zone.
  const quiet = 4
  const unit = size / (count + quiet * 2)
  ctx.rects.push({ x, y, w: size, h: size, color: '#ffffff' })

  /*
   * Runs of dark modules become one rectangle rather than several.
   *
   * This started as one rectangle per module with a fixed 0.35pt overlap
   * to hide the seams a rasteriser leaves between neighbours. That is
   * harmless when a module is 5pt across and ruinous when it is 2.3pt:
   * the code stopped decoding, because every dark module was being drawn
   * 15% too fat and running into its neighbour.
   *
   * A run has no internal seams to hide, so the width can be exact. Only
   * the row edges need the hairline overlap, and that is taken as a
   * fraction of a module so it stays right at any size.
   */
  const bleed = unit * 0.02
  for (let row = 0; row < count; row += 1) {
    let col = 0
    while (col < count) {
      if (!modules[row][col]) {
        col += 1
        continue
      }
      let run = 1
      while (col + run < count && modules[row][col + run]) run += 1
      ctx.rects.push({
        x: x + (col + quiet) * unit,
        y: y + (row + quiet) * unit,
        w: run * unit,
        h: unit + bleed,
        color: INK,
      })
      col += run
    }
  }
}

/** A row of small caps label over its value, wrapping onto a second line. */
function drawField(ctx: Ctx, label: string, value: string, x: number, y: number, w: number) {
  ctx.texts.push({ x, y, size: 6, text: label.toUpperCase(), color: MUTED })
  const { size, lines } = fitBlock(value, 8.5, 6.5, w, 2, false)
  lines.forEach((line, i) => {
    ctx.texts.push({ x, y: y + 10 + i * (size + 1.5), size, text: line, color: INK })
  })
}

/** One sticker, drawn with its top-left corner at (x, y). */
function drawSticker(ctx: Ctx, label: ItemLabel, x: number, y: number) {
  const pad = 13
  const W = CELL_W
  const H = CELL_H

  // A solid hairline to cut to. On label stock it is ignored; on plain
  // paper it is the line the scissors follow.
  ctx.lines.push(
    { x1: x, y1: y, x2: x + W, y2: y, color: HAIRLINE, width: 0.7 },
    { x1: x, y1: y + H, x2: x + W, y2: y + H, color: HAIRLINE, width: 0.7 },
    { x1: x, y1: y, x2: x, y2: y + H, color: HAIRLINE, width: 0.7 },
    { x1: x + W, y1: y, x2: x + W, y2: y + H, color: HAIRLINE, width: 0.7 },
  )

  // The code reads first and largest: it is what somebody holding the item
  // types into the app. The QR sits beside it, square in the corner.
  const qr = 78
  const qrX = x + W - pad - qr
  const qrY = y + pad
  drawQr(ctx, label.modules, qrX, qrY, qr)

  const colW = qrX - (x + pad) - 12
  let ty = y + pad + 15

  const tag = label.assetTag ?? 'NO CODE'
  const code = fitBlock(tag, 17, 9, colW, 2, true)
  for (const line of code.lines) {
    ctx.texts.push({ x: x + pad, y: ty, size: code.size, text: line, bold: true, color: INK })
    ty += code.size + 3
  }

  ty += 5
  const name = fitBlock(label.name, 10.5, 7.5, colW, 3, true)
  for (const line of name.lines) {
    ctx.texts.push({ x: x + pad, y: ty, size: name.size, text: line, bold: true, color: INK })
    ty += name.size + 2
  }

  const fields: Array<[string, string]> = []
  if (label.brand) fields.push(['Brand', label.brand])
  if (label.model) fields.push(['Product', label.model])
  if (label.serial) fields.push(['Serial', label.serial])

  /*
   * The detail sits on the bottom edge rather than following the QR.
   *
   * Anchored to the top it floats wherever the name happened to end, and a
   * short name leaves a third of the sticker blank underneath — which reads
   * as a printing fault rather than a design. Anchored to the bottom, every
   * sticker on the sheet lines its detail up with its neighbours whatever
   * its name is, and the breathing room lands in the middle where it looks
   * deliberate.
   */
  const ROW_H = 30
  const rows = Math.max(1, Math.ceil(Math.min(fields.length, 4) / 2))
  const detailTop = Math.max(y + H - pad - rows * ROW_H + 6, ty + 14, qrY + qr + 14)

  ctx.lines.push({
    x1: x + pad,
    y1: detailTop - 11,
    x2: x + W - pad,
    y2: detailTop - 11,
    color: GUIDE,
    width: 0.6,
  })

  const cellW = (W - pad * 2 - 12) / 2
  fields.slice(0, 4).forEach(([fieldName, value], i) => {
    drawField(
      ctx,
      fieldName,
      value,
      x + pad + (i % 2) * (cellW + 12),
      detailTop + Math.floor(i / 2) * ROW_H,
      cellW,
    )
  })

  if (fields.length === 0) {
    // Nothing but a name and a code: say what the square is for, so the
    // sticker still tells somebody holding it what to do.
    const hint = 'Scan the code to open this item'
    ctx.texts.push({
      x: x + pad + (W - pad * 2 - textWidth(hint, 7.5)) / 2,
      y: detailTop + 9,
      size: 7.5,
      text: hint,
      color: MUTED,
    })
  }
}

/**
 * The stickers laid out on pages.
 *
 * Returned as pages rather than a finished PDF so the same drawing can be
 * painted onto a canvas for the on-screen preview — what is previewed is
 * then the document itself, not a picture of something like it.
 */
export function labelSheetPages(labels: ItemLabel[]): PdfPage[] {
  const pages: PdfPage[] = []

  for (let start = 0; start < Math.max(labels.length, 1); start += PER_PAGE) {
    const ctx: Ctx = { texts: [], rects: [], lines: [] }
    labels.slice(start, start + PER_PAGE).forEach((label, i) => {
      const col = i % COLS
      const row = Math.floor(i / COLS)
      drawSticker(
        ctx,
        label,
        MARGIN + col * (CELL_W + GUTTER),
        MARGIN + row * (CELL_H + GUTTER),
      )
    })
    pages.push({ ...A4, texts: ctx.texts, rects: ctx.rects, lines: ctx.lines })
  }

  return pages
}

export function labelSheetPdf(labels: ItemLabel[]): Uint8Array {
  return buildPdfPages(labelSheetPages(labels))
}
