import { A4, type PdfCircle, type PdfLine, type PdfPage, type PdfRect, type PdfText } from './pdfDoc'
import { truncateToWidth, textWidth, wrapToLines } from './helveticaMetrics'

/**
 * A service's running order as a sheet — the page the planner shows,
 * turned into a file.
 *
 * It is built as page primitives rather than as a PDF or an image, because
 * it is wanted as both: the same description is handed to the PDF writer
 * or painted onto a canvas and saved as a JPG. One layout, two files,
 * rather than two layouts that agree until one of them is edited.
 *
 * The design follows the preview deliberately. Someone exporting a running
 * order has just been looking at it on screen; a sheet that reorganised it
 * into a spreadsheet would be a different document about the same service,
 * and they would have to read it twice to trust it.
 */

export interface SheetSession {
  time: string
  minutes: number
  name: string
  lead: string | null
}

export interface ServiceSheet {
  serviceType: string
  date: string
  sessions: SheetSession[]
  /** Just the duration - "3h 7m". The sheet adds "end to end" itself. */
  totalLabel: string
  windowLabel: string | null
  printedOn: string
}

/* The app's own dark palette, so the file and the screen are one thing. */
const BACKDROP = '#000000'
const SURFACE = '#141418'
const CARD = '#1c1c22'
const PILL = '#26262e'
const INK = '#f5f5f7'
const MUTED = '#98989d'
const FAINT = '#8e8e93'
const RAIL = '#38383f'
const PRIMARY = '#0a84ff'
const WARN = '#ff9f0a'
const WINDOW_TILE = '#101a26'

const PAGE_PAD = 34
const CARD_PAD = 22
const RAIL_X = PAGE_PAD + CARD_PAD + 96
const ROW_X = RAIL_X + 22
const ROW_H = 54
const ROW_GAP = 8

/**
 * `page` keeps A4, which is what a printed PDF wants. `content` ends the
 * sheet where the running order does — a six-item service shared in a chat
 * should not be two thirds empty paper.
 */
export type SheetFit = 'page' | 'content'

/** Two letters for the avatar, the way the app draws them. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '··'
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export function serviceSheetPage(sheet: ServiceSheet, fit: SheetFit = 'page'): PdfPage {
  const texts: PdfText[] = []
  const rects: PdfRect[] = []
  const lines: PdfLine[] = []
  const circles: PdfCircle[] = []
  const W = A4.width
  const cardW = W - PAGE_PAD * 2
  const rowW = W - PAGE_PAD - CARD_PAD - ROW_X

  // Title, as the page has it: the service, and its date beneath in mono.
  texts.push({
    x: PAGE_PAD,
    y: 62,
    size: 26,
    text: truncateToWidth(sheet.serviceType, 26, cardW, true),
    bold: true,
    color: INK,
  })
  texts.push({ x: PAGE_PAD, y: 82, size: 9.5, text: sheet.date, mono: true, color: MUTED })

  // The running-order card.
  const cardTop = 104
  let y = cardTop + 30

  texts.push({ x: PAGE_PAD + CARD_PAD, y, size: 8.5, text: 'RUNNING ORDER', mono: true, color: MUTED })
  const count = `${sheet.sessions.length} ${sheet.sessions.length === 1 ? 'session' : 'sessions'} · ${sheet.totalLabel}`
  texts.push({
    x: W - PAGE_PAD - CARD_PAD - textWidth(count, 8.5, false, true),
    y,
    size: 8.5,
    text: count,
    mono: true,
    color: MUTED,
  })

  y += 22
  const railTop = y + ROW_H / 2

  sheet.sessions.forEach((session, i) => {
    const top = y
    const mid = top + ROW_H / 2

    // Time and duration in the left column, right-aligned to the rail.
    const time = session.time
    texts.push({
      x: RAIL_X - 14 - textWidth(time, 11, false, true),
      y: mid - 2,
      size: 11,
      text: time,
      mono: true,
      color: MUTED,
    })
    const mins = `${session.minutes} min`
    texts.push({
      x: RAIL_X - 14 - textWidth(mins, 9, false, true),
      y: mid + 12,
      size: 9,
      text: mins,
      mono: true,
      color: FAINT,
    })

    // The dot on the rail. The first is lit, as the page lights the one
    // the service opens with.
    circles.push({ cx: RAIL_X, cy: mid, r: i === 0 ? 4 : 3, color: i === 0 ? PRIMARY : RAIL })

    // The session's own card.
    rects.push({ x: ROW_X, y: top, w: rowW, h: ROW_H, color: CARD, radius: 14 })

    const lead = session.lead
    const leadText = lead ?? 'Nobody assigned'
    const leadSize = 10.5
    const avatar = 11
    const pillPad = 10
    const leadW = Math.min(textWidth(leadText, leadSize, false), 150)
    const pillW = (lead ? avatar * 2 + 8 : 0) + pillPad * 2 + leadW
    const pillX = ROW_X + rowW - 12 - pillW

    const nameW = pillX - ROW_X - 30
    texts.push({
      x: ROW_X + 18,
      y: mid + 4,
      size: 13,
      text: truncateToWidth(session.name, 13, nameW, false),
      color: INK,
    })

    // The assignee pill: an initials disc, then the name — or the gap,
    // named, because that is what a planner is scanning for.
    rects.push({
      x: pillX,
      y: mid - 15,
      w: pillW,
      h: 30,
      color: lead ? PILL : '#2a2118',
      radius: 15,
    })
    if (lead) {
      circles.push({ cx: pillX + pillPad + avatar, cy: mid, r: avatar, color: RAIL })
      const ini = initialsOf(lead)
      texts.push({
        x: pillX + pillPad + avatar - textWidth(ini, 7.5, false, true) / 2,
        y: mid + 3,
        size: 7.5,
        text: ini,
        mono: true,
        color: MUTED,
      })
    }
    texts.push({
      x: pillX + pillPad + (lead ? avatar * 2 + 8 : 0),
      y: mid + 4,
      size: leadSize,
      text: truncateToWidth(leadText, leadSize, 150, false),
      color: lead ? INK : WARN,
    })

    y += ROW_H + ROW_GAP
  })

  if (sheet.sessions.length === 0) {
    texts.push({
      x: ROW_X,
      y: y + 18,
      size: 11,
      text: 'No sessions planned yet.',
      color: MUTED,
    })
    y += 44
  } else {
    // The rail runs between the first dot and the last, behind them.
    lines.push({
      x1: RAIL_X,
      y1: railTop,
      x2: RAIL_X,
      y2: y - ROW_GAP - ROW_H / 2,
      color: RAIL,
      width: 1,
    })
  }

  const cardH = y - ROW_GAP + CARD_PAD - cardTop
  // Drawn first so everything above sits on it — rects paint in order.
  rects.unshift({ x: PAGE_PAD, y: cardTop, w: cardW, h: cardH, color: SURFACE, radius: 20 })
  rects.unshift({ x: 0, y: 0, w: W, h: fit === 'page' ? A4.height : 0, color: BACKDROP })

  // The service-window tile, as the page ends.
  const tileTop = cardTop + cardH + 16
  const tileH = sheet.windowLabel ? 96 : 74
  rects.push({ x: PAGE_PAD, y: tileTop, w: cardW, h: tileH, color: WINDOW_TILE, radius: 20 })
  texts.push({
    x: PAGE_PAD + CARD_PAD,
    y: tileTop + 26,
    size: 8.5,
    text: 'SERVICE WINDOW',
    mono: true,
    color: MUTED,
  })
  texts.push({
    x: PAGE_PAD + CARD_PAD,
    y: tileTop + 56,
    size: 22,
    text: sheet.totalLabel,
    bold: true,
    mono: true,
    color: INK,
  })
  texts.push({
    x: PAGE_PAD + CARD_PAD + textWidth(sheet.totalLabel, 22, true, true) + 10,
    y: tileTop + 56,
    size: 10.5,
    text: 'end to end',
    color: MUTED,
  })
  if (sheet.windowLabel) {
    texts.push({
      x: PAGE_PAD + CARD_PAD,
      y: tileTop + 80,
      size: 10.5,
      text: truncateToWidth(sheet.windowLabel, 10.5, cardW - CARD_PAD * 2, false),
      color: MUTED,
    })
  }

  const footerY = tileTop + tileH + 26
  texts.push({
    x: PAGE_PAD,
    y: fit === 'page' ? A4.height - 30 : footerY,
    size: 8,
    text: `Rehoboth International Ministries · ${sheet.printedOn}`,
    color: FAINT,
  })

  const height = fit === 'page' ? A4.height : footerY + 26
  // The backdrop has to cover whatever height we settled on.
  rects[0] = { x: 0, y: 0, w: W, h: height, color: BACKDROP }

  return { width: W, height, texts, rects, lines, circles }
}

/** Long names push a row taller; the sheet stays readable either way. */
export const SHEET_ROW_HEIGHT = ROW_H
export { wrapToLines }
