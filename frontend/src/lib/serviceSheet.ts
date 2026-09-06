import { A4, type PdfCircle, type PdfLine, type PdfPage, type PdfRect, type PdfText } from './pdfDoc'
import { textWidth, wrapText, wrapToLines } from './helveticaMetrics'

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

/**
 * The app's own palettes, so the file and the screen are one thing.
 *
 * Dark is what the planner looks like and what a running order dropped
 * into a group chat should look like. Light is what a printer wants: a
 * black page costs a cartridge and comes out of most church printers grey
 * and streaked, and somebody pinning the order to a wall wants ink on
 * paper rather than paper made of ink.
 *
 * The two are the app's own tokens, read off `index.css` rather than
 * invented here — the accents step to their light-background variants so
 * they keep their contrast instead of glowing.
 */
export type SheetTheme = 'dark' | 'light'

interface Palette {
  backdrop: string
  surface: string
  card: string
  pill: string
  pillEmpty: string
  ink: string
  muted: string
  faint: string
  rail: string
  /** The initials disc, and the letters on it — a pair, so they hold. */
  avatarDisc: string
  avatarInk: string
  primary: string
  warn: string
  windowTile: string
  /**
   * The two numbers in the left column: when a session starts, and how
   * long it runs.
   *
   * They had the sheet's quietest greys, which is right on black and
   * nearly invisible on white — the duration in particular, at #8e8e93 on
   * paper. They are the column somebody standing at the back reads off a
   * printout, so each theme names its own pair: bright enough to carry,
   * with the duration a step quieter than the time so the hierarchy holds.
   */
  time: string
  minutes: string
}

const PALETTES: Record<SheetTheme, Palette> = {
  dark: {
    backdrop: '#000000',
    surface: '#141418',
    card: '#1c1c22',
    pill: '#26262e',
    pillEmpty: '#2a2118',
    ink: '#f5f5f7',
    muted: '#a5a5ab',
    faint: '#9a9aa0',
    rail: '#38383f',
    avatarDisc: '#4a4a52',
    avatarInk: '#ececf0',
    primary: '#0a84ff',
    warn: '#ff9f0a',
    windowTile: '#101a26',
    time: '#f5f5f7',
    minutes: '#c7c7cc',
  },
  light: {
    backdrop: '#ffffff',
    surface: '#f2f2f7',
    card: '#ffffff',
    pill: '#ebebf0',
    pillEmpty: '#fdf1de',
    ink: '#1c1c1e',
    muted: '#57575c',
    faint: '#5c5c63',
    rail: '#c7c7cc',
    avatarDisc: '#d8d8de',
    avatarInk: '#3a3a3c',
    primary: '#007aff',
    // Dark enough to read on its own pale ground: #ff9f0a on paper is a
    // smear, and even the theme's own #b86e00 only manages 3.6:1 there.
    warn: '#8a5200',
    windowTile: '#eaf2ff',
    time: '#1c1c1e',
    minutes: '#3a3a3c',
  },
}

const PAGE_PAD = 34
const CARD_PAD = 22
const RAIL_X = PAGE_PAD + CARD_PAD + 96
const ROW_X = RAIL_X + 22
/**
 * A row is at least this tall, and taller when what is in it needs the
 * room.
 *
 * It used to be exactly this tall, always, and anything that did not fit
 * was cut with an ellipsis — so "Welcome | Introduction | Short Message"
 * left the sheet as "Welcome | Introduction | Short Me…". A running order
 * is handed to somebody who was not in the room when it was planned;
 * three quarters of a session's name is not information, it is a hint.
 * Everything wraps now, and the row grows to hold it.
 */
const ROW_MIN_H = 54
const ROW_GAP = 8
const ROW_PAD_Y = 13
const NAME_SIZE = 13
const NAME_LINE = 17
const LEAD_SIZE = 10.5
const LEAD_LINE = 14
/** How wide a name pill may get before it starts wrapping instead. */
const LEAD_MAX_W = 150
const PILL_PAD = 10
const AVATAR = 11

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

export function serviceSheetPage(
  sheet: ServiceSheet,
  fit: SheetFit = 'page',
  theme: SheetTheme = 'dark',
): PdfPage {
  const {
    backdrop: BACKDROP,
    surface: SURFACE,
    card: CARD,
    pill: PILL,
    pillEmpty: PILL_EMPTY,
    ink: INK,
    muted: MUTED,
    faint: FAINT,
    rail: RAIL,
    avatarDisc: AVATAR_DISC,
    avatarInk: AVATAR_INK,
    primary: PRIMARY,
    warn: WARN,
    windowTile: WINDOW_TILE,
    time: TIME_INK,
    minutes: MINUTES_INK,
  } = PALETTES[theme]

  const texts: PdfText[] = []
  const rects: PdfRect[] = []
  const lines: PdfLine[] = []
  const circles: PdfCircle[] = []
  const W = A4.width
  const cardW = W - PAGE_PAD * 2
  const rowW = W - PAGE_PAD - CARD_PAD - ROW_X

  // Title, as the page has it: the service, and its date beneath in mono.
  // A service named at length pushes the card down rather than losing its
  // own name.
  const titleLines = wrapText(sheet.serviceType, 26, cardW, true)
  let titleY = 62
  for (const line of titleLines) {
    texts.push({ x: PAGE_PAD, y: titleY, size: 26, text: line, bold: true, color: INK })
    titleY += 32
  }
  const dateY = titleY - 32 + 20
  texts.push({ x: PAGE_PAD, y: dateY, size: 9.5, text: sheet.date, mono: true, color: MUTED })

  // The running-order card.
  const cardTop = dateY + 22
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
  // Where the rail starts and stops: the middle of the first row and of
  // the last, which is no longer a fixed distance apart now that rows
  // grow to fit what is in them.
  let railTop: number | null = null
  let railBottom = y

  sheet.sessions.forEach((session, i) => {
    const top = y

    /*
     * The row is measured before it is drawn.
     *
     * The pill takes what it needs up to its own limit and wraps beyond
     * it; the name takes the rest of the width and wraps into as many
     * lines as it needs; and the row is as tall as the taller of the two.
     * Nothing is cut, which is the whole point of the sheet.
     */
    const lead = session.lead
    const leadText = lead ?? 'Nobody assigned'
    const leadLines = wrapText(leadText, LEAD_SIZE, LEAD_MAX_W)
    const leadW = Math.max(...leadLines.map((line) => textWidth(line, LEAD_SIZE, false)))
    const pillW = (lead ? AVATAR * 2 + 8 : 0) + PILL_PAD * 2 + leadW
    const pillH = Math.max(30, leadLines.length * LEAD_LINE + 12)
    const pillX = ROW_X + rowW - 12 - pillW

    // Never narrower than something a word can land in: a very wide pill
    // must not squeeze the name into a column one letter across.
    const nameW = Math.max(pillX - ROW_X - 26, 90)
    const nameLines = wrapText(session.name, NAME_SIZE, nameW)

    const rowH = Math.max(
      ROW_MIN_H,
      nameLines.length * NAME_LINE + ROW_PAD_Y * 2,
      pillH + 16,
    )
    const mid = top + rowH / 2
    if (railTop === null) railTop = mid
    railBottom = mid

    // Time and duration in the left column, right-aligned to the rail.
    const time = session.time
    texts.push({
      x: RAIL_X - 14 - textWidth(time, 11, false, true),
      y: mid - 2,
      size: 11,
      text: time,
      mono: true,
      color: TIME_INK,
    })
    const mins = `${session.minutes} min`
    texts.push({
      x: RAIL_X - 14 - textWidth(mins, 9, false, true),
      y: mid + 12,
      size: 9,
      text: mins,
      mono: true,
      color: MINUTES_INK,
    })

    // The dot on the rail. The first is lit, as the page lights the one
    // the service opens with.
    circles.push({ cx: RAIL_X, cy: mid, r: i === 0 ? 4 : 3, color: i === 0 ? PRIMARY : RAIL })

    // The session's own card.
    rects.push({ x: ROW_X, y: top, w: rowW, h: rowH, color: CARD, radius: 14 })

    // The name, centred on the row however many lines it runs to.
    let nameY = mid - ((nameLines.length - 1) * NAME_LINE) / 2 + 4
    for (const line of nameLines) {
      texts.push({ x: ROW_X + 18, y: nameY, size: NAME_SIZE, text: line, color: INK })
      nameY += NAME_LINE
    }

    // The assignee pill: an initials disc, then the name — or the gap,
    // named, because that is what a planner is scanning for.
    rects.push({
      x: pillX,
      y: mid - pillH / 2,
      w: pillW,
      h: pillH,
      color: lead ? PILL : PILL_EMPTY,
      radius: Math.min(15, pillH / 2),
    })
    if (lead) {
      circles.push({ cx: pillX + PILL_PAD + AVATAR, cy: mid, r: AVATAR, color: AVATAR_DISC })
      const ini = initialsOf(lead)
      texts.push({
        x: pillX + PILL_PAD + AVATAR - textWidth(ini, 7.5, false, true) / 2,
        y: mid + 3,
        size: 7.5,
        text: ini,
        mono: true,
        color: AVATAR_INK,
      })
    }
    let leadY = mid - ((leadLines.length - 1) * LEAD_LINE) / 2 + 4
    for (const line of leadLines) {
      texts.push({
        x: pillX + PILL_PAD + (lead ? AVATAR * 2 + 8 : 0),
        y: leadY,
        size: LEAD_SIZE,
        text: line,
        color: lead ? INK : WARN,
      })
      leadY += LEAD_LINE
    }

    y += rowH + ROW_GAP
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
      y1: railTop ?? y,
      x2: RAIL_X,
      y2: railBottom,
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
  const windowLines = sheet.windowLabel
    ? wrapText(sheet.windowLabel, 10.5, cardW - CARD_PAD * 2)
    : []
  const tileH = windowLines.length > 0 ? 74 + 8 + windowLines.length * 15 : 74
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
  let windowY = tileTop + 80
  for (const line of windowLines) {
    texts.push({ x: PAGE_PAD + CARD_PAD, y: windowY, size: 10.5, text: line, color: MUTED })
    windowY += 15
  }

  /*
   * A4 is a floor, not a ceiling.
   *
   * A printed sheet wants the whole page, so a short service still fills
   * one and puts its footer at the bottom. A long one — twenty sessions,
   * or ten with names that wrap — needs more than A4 holds, and a page
   * that keeps its declared height while the rows run past it does not
   * shorten the service: it loses the end of it, silently, which is the
   * worst way to lose anything.
   */
  const footerY = tileTop + tileH + 26
  const footerBaseline = fit === 'page' ? Math.max(A4.height - 30, footerY) : footerY
  texts.push({
    x: PAGE_PAD,
    y: footerBaseline,
    size: 8,
    text: `Rehoboth International Ministries · ${sheet.printedOn}`,
    color: FAINT,
  })

  const height = fit === 'page' ? Math.max(A4.height, footerY + 26) : footerY + 26
  // The backdrop has to cover whatever height we settled on.
  rects[0] = { x: 0, y: 0, w: W, h: height, color: BACKDROP }

  return { width: W, height, texts, rects, lines, circles, background: BACKDROP }
}

/** Long names push a row taller; the sheet stays readable either way. */
export const SHEET_ROW_HEIGHT = ROW_MIN_H
export { wrapToLines }
