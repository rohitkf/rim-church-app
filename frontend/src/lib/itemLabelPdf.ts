import { A4, buildPdf, type PdfRect, type PdfText } from './pdfDoc'

/**
 * The printed label for one item: everything the register knows about it,
 * and the code that gets you back here.
 *
 * Laid out for a sheet of A4 that gets cut down or taped to a flight case,
 * so the detail sits at the top and the code below it, big enough to read
 * from a phone held at arm's length.
 */

export interface LabelField {
  label: string
  value: string
}

export interface ItemLabel {
  title: string
  subtitle?: string
  fields: LabelField[]
  /** The QR as a square grid of true/false — true is a dark module. */
  modules: boolean[][]
  /** Printed under the code so a label still works if the code is damaged. */
  caption: string
  footer?: string
}

const MARGIN = 56
const QR_SIZE = 220

export function itemLabelPdf(label: ItemLabel): Uint8Array {
  const texts: PdfText[] = []
  const rects: PdfRect[] = []
  let y = MARGIN + 18

  texts.push({ x: MARGIN, y, size: 22, text: label.title, bold: true })
  y += 20

  if (label.subtitle) {
    texts.push({ x: MARGIN, y, size: 11, text: label.subtitle, grey: 0.4 })
    y += 18
  }

  y += 10
  rects.push({ x: MARGIN, y, w: A4.width - MARGIN * 2, h: 0.8, grey: 0.75 })
  y += 26

  // Two columns of label/value, so a long location does not push the code
  // off the page.
  for (const field of label.fields) {
    texts.push({ x: MARGIN, y, size: 9, text: field.label.toUpperCase(), grey: 0.45 })
    texts.push({ x: MARGIN + 130, y, size: 11, text: field.value })
    y += 20
  }

  // The code follows the detail rather than being pinned to the foot of
  // the page: a label is usually cut out, and a hand's width of blank
  // paper in the middle of it is just something to cut off.
  const qrTop = y + 24
  const qrLeft = (A4.width - QR_SIZE) / 2
  const count = label.modules.length
  const module = count > 0 ? QR_SIZE / count : 0

  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (!label.modules[row][col]) continue
      rects.push({
        x: qrLeft + col * module,
        y: qrTop + row * module,
        // A hair of overlap, so neighbouring modules do not show a seam
        // where a printer rounds them to different pixels.
        w: module + 0.4,
        h: module + 0.4,
      })
    }
  }

  texts.push({
    x: MARGIN,
    y: qrTop + QR_SIZE + 22,
    size: 9,
    text: label.caption,
    grey: 0.45,
  })

  if (label.footer) {
    texts.push({ x: MARGIN, y: A4.height - MARGIN + 8, size: 8, text: label.footer, grey: 0.55 })
  }

  return buildPdf({ ...A4, texts, rects })
}
