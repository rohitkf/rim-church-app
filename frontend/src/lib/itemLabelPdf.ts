import { A4, buildPdf, type PdfLine, type PdfRect, type PdfText } from './pdfDoc'
import { fitToWidth, textWidth, truncateToWidth, wrapToLines } from './helveticaMetrics'

/**
 * The printed label for one item — made to be cut out and stuck on.
 *
 * Two of them to a sheet, because equipment is not one size: the large one
 * suits a flight case or a stand, the small one a microphone, a cable drum
 * or a battery box. Both carry the same code, so it does not matter which
 * gets used.
 *
 * Each sits inside a dashed cut line with a solid card border just within
 * it, so there is something to cut along and something to cut *to* — the
 * border survives a wobbly pair of scissors.
 */

export interface LabelField {
  label: string
  value: string
}

export interface ItemLabel {
  title: string
  teamName: string | null
  /** Tints the header band; the team's own colour, when it has one. */
  teamColor?: string | null
  assetTag: string | null
  statusLabel: string
  fields: LabelField[]
  /** The QR as a square grid of true/false — true is a dark module. */
  modules: boolean[][]
  footer: string
}

const INK = '#111111'
const MUTED = '#6b6b6b'
const HAIRLINE = '#d8d8d8'
const CUT = '#bcbcbc'
const DEFAULT_TEAM = '#1f6feb'

/** Black on a light band, white on a dark one, so the team name survives either. */
function inkOn(hex: string): string {
  const v = hex.replace('#', '')
  const n = parseInt(v.length === 3 ? [...v].map((c) => c + c).join('') : v, 16)
  if (Number.isNaN(n)) return '#ffffff'
  const luminance = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  return luminance > 150 ? '#111111' : '#ffffff'
}

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
   * the code on the small label stopped decoding, because every dark
   * module was being drawn 15% too fat and running into its neighbour.
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

/** The dashed line to cut along, and the card edge to cut to. */
function drawCard(ctx: Ctx, x: number, y: number, w: number, h: number) {
  const bleed = 9
  const cut = { x: x - bleed, y: y - bleed, w: w + bleed * 2, h: h + bleed * 2 }
  const dash: [number, number] = [4, 3]
  ctx.lines.push(
    { x1: cut.x, y1: cut.y, x2: cut.x + cut.w, y2: cut.y, color: CUT, width: 0.6, dash },
    { x1: cut.x, y1: cut.y + cut.h, x2: cut.x + cut.w, y2: cut.y + cut.h, color: CUT, width: 0.6, dash },
    { x1: cut.x, y1: cut.y, x2: cut.x, y2: cut.y + cut.h, color: CUT, width: 0.6, dash },
    { x1: cut.x + cut.w, y1: cut.y, x2: cut.x + cut.w, y2: cut.y + cut.h, color: CUT, width: 0.6, dash },
  )
  ctx.lines.push(
    { x1: x, y1: y, x2: x + w, y2: y, color: HAIRLINE, width: 0.8 },
    { x1: x, y1: y + h, x2: x + w, y2: y + h, color: HAIRLINE, width: 0.8 },
    { x1: x, y1: y, x2: x, y2: y + h, color: HAIRLINE, width: 0.8 },
    { x1: x + w, y1: y, x2: x + w, y2: y + h, color: HAIRLINE, width: 0.8 },
  )
}

/** The big label: the one for a case, a stand or a rack. */
function drawLarge(ctx: Ctx, label: ItemLabel, x: number, y: number) {
  const W = 340
  const H = 250
  const band = 30
  const pad = 14
  const team = label.teamColor || DEFAULT_TEAM

  drawCard(ctx, x, y, W, H)

  ctx.rects.push({ x, y, w: W, h: band, color: team })
  ctx.texts.push({
    x: x + pad,
    y: y + 20,
    size: 11,
    text: (label.teamName ?? 'Equipment').toUpperCase(),
    bold: true,
    color: inkOn(team),
  })
  const status = label.statusLabel.toUpperCase()
  ctx.texts.push({
    x: x + W - pad - textWidth(status, 9, true),
    y: y + 20,
    size: 9,
    text: status,
    bold: true,
    color: inkOn(team),
  })

  // The code sits top right; the name and tag take the column beside it.
  const qr = 112
  const qrX = x + W - pad - qr
  const qrY = y + band + pad
  drawQr(ctx, label.modules, qrX, qrY, qr)

  const colW = qrX - (x + pad) - 14
  let ty = qrY + 13

  for (const line of wrapToLines(label.title, 13, colW, 2, true)) {
    ctx.texts.push({ x: x + pad, y: ty, size: 13, text: line, bold: true, color: INK })
    ty += 16
  }

  if (label.assetTag) {
    ty += 10
    // The code is what the label is for, so it shrinks to fit rather than
    // being cut short: a long code set a little smaller is still readable,
    // half a code is not.
    const size = fitToWidth(label.assetTag, 24, 13, colW, true)
    ctx.texts.push({
      x: x + pad,
      y: ty,
      size,
      text: truncateToWidth(label.assetTag, size, colW, true),
      bold: true,
      color: team,
    })
  }

  // The detail runs the full width underneath both, in two columns, so
  // four fields take two rows rather than four and the card keeps its
  // proportions however long a location is.
  const detailTop = qrY + qr + 16
  ctx.lines.push({
    x1: x + pad,
    y1: detailTop - 10,
    x2: x + W - pad,
    y2: detailTop - 10,
    color: HAIRLINE,
    width: 0.6,
  })

  const cellW = (W - pad * 2 - 12) / 2
  label.fields.slice(0, 4).forEach((field, i) => {
    const cx = x + pad + (i % 2) * (cellW + 12)
    const cy = detailTop + Math.floor(i / 2) * 26
    ctx.texts.push({ x: cx, y: cy, size: 7, text: field.label.toUpperCase(), color: MUTED })
    ctx.texts.push({
      x: cx,
      y: cy + 11,
      size: 9.5,
      text: truncateToWidth(field.value, 9.5, cellW, false),
      color: INK,
    })
  })

  ctx.texts.push({
    x: x + pad,
    y: y + H - 10,
    size: 7,
    text: truncateToWidth(`Scan the code to open this item \u00b7 ${label.footer}`, 7, W - pad * 2, false),
    color: MUTED,
  })
}

/** The small label: for a microphone, a cable drum, a battery box. */
function drawSmall(ctx: Ctx, label: ItemLabel, x: number, y: number) {
  // Wide enough that a full asset code sits beside the QR at a readable
  // size. It was 200pt, which left a 96pt column — a code as ordinary as
  // MED-BRT-0001 needs 108pt at 15pt type, so it came out as "MED-BRT-0..."
  // and the label lost the one thing it exists to carry.
  const W = 250
  const H = 104
  const pad = 10
  const team = label.teamColor || DEFAULT_TEAM

  drawCard(ctx, x, y, W, H)
  ctx.rects.push({ x, y, w: W, h: 5, color: team })

  const qr = 74
  const qrX = x + W - pad - qr
  drawQr(ctx, label.modules, qrX, y + 5 + pad + 3, qr)

  const colW = qrX - (x + pad) - 10
  let ty = y + 5 + pad + 12

  if (label.assetTag) {
    const size = fitToWidth(label.assetTag, 15, 9, colW, true)
    ctx.texts.push({
      x: x + pad,
      y: ty,
      size,
      text: truncateToWidth(label.assetTag, size, colW, true),
      bold: true,
      color: team,
    })
    ty += size
  }

  for (const line of wrapToLines(label.title, 8.5, colW, 3, true)) {
    ctx.texts.push({ x: x + pad, y: ty, size: 8.5, text: line, bold: true, color: INK })
    ty += 10
  }

  if (label.teamName) {
    ctx.texts.push({
      x: x + pad,
      y: y + H - 10,
      size: 7,
      text: truncateToWidth(label.teamName.toUpperCase(), 7, colW, false),
      color: MUTED,
    })
  }
}

export function itemLabelPdf(label: ItemLabel): Uint8Array {
  const ctx: Ctx = { texts: [], rects: [], lines: [] }
  const left = 62
  let y = 74

  ctx.texts.push({
    x: left,
    y: y - 26,
    size: 8,
    text: 'CUT ALONG THE DASHED LINE - BOTH LABELS OPEN THE SAME ITEM',
    color: MUTED,
  })

  drawLarge(ctx, label, left, y)
  y += 250 + 54
  drawSmall(ctx, label, left, y)

  return buildPdf({ ...A4, texts: ctx.texts, rects: ctx.rects, lines: ctx.lines })
}
