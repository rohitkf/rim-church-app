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
/** The left column: when it starts, and how long it runs. */
const TIME_COL = 104
const RAIL_X = PAGE_PAD + CARD_PAD + TIME_COL
const ROW_X = RAIL_X + 24
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
const ROW_MIN_H = 76
const ROW_GAP = 10
const ROW_PAD_X = 20
const ROW_PAD_Y = 16
/*
 * The type scale.
 *
 * The sheet was drawn at the sizes a dense screen uses — a 13pt session
 * name on a 595pt page — and then looked at as a phone-sized image, where
 * it read as a photograph of a document rather than as a document: right,
 * but too far away to use. A running order is read at arm's length off a
 * printout, or on a phone in a dark room five minutes before the doors
 * open. So the name is the size of a heading, the time beside it is the
 * size of a clock, and the person is a line of prose rather than a label.
 */
const TITLE_SIZE = 34
const TITLE_LINE = 40
const DATE_SIZE = 12.5
const EYEBROW_SIZE = 10.5
const NAME_SIZE = 19
const NAME_LINE = 24
const LEAD_SIZE = 13
const LEAD_LINE = 17
const TIME_SIZE = 16
const MINUTES_SIZE = 11
const FOOTER_SIZE = 9.5
const PILL_PAD = 12
const PILL_GAP = 9
const AVATAR = 13
/*
 * How far the initials disc sits from the edge of its pill.
 *
 * The same on the left as above and below, which is the whole point of
 * it: the disc had the text's padding — twelve — while standing four from
 * the top and four from the bottom, so it floated in from the rounded end
 * with a gap in front of it and read as a spacing mistake, which it was.
 * Four puts it concentric with the end of a one-line pill, which is how
 * the app's own AssigneePill has always drawn it (`py-1.5 pl-1.5`).
 */
const AVATAR_INSET = 4

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
  const titleLines = wrapText(sheet.serviceType, TITLE_SIZE, cardW, true)
  let titleY = 70
  for (const line of titleLines) {
    texts.push({ x: PAGE_PAD, y: titleY, size: TITLE_SIZE, text: line, bold: true, color: INK })
    titleY += TITLE_LINE
  }
  const dateY = titleY - TITLE_LINE + 26
  texts.push({ x: PAGE_PAD, y: dateY, size: DATE_SIZE, text: sheet.date, mono: true, color: MUTED })

  // The running-order card.
  const cardTop = dateY + 26
  let y = cardTop + 34

  texts.push({
    x: PAGE_PAD + CARD_PAD,
    y,
    size: EYEBROW_SIZE,
    text: 'RUNNING ORDER',
    mono: true,
    color: MUTED,
  })
  const count = `${sheet.sessions.length} ${sheet.sessions.length === 1 ? 'session' : 'sessions'} · ${sheet.totalLabel}`
  texts.push({
    x: W - PAGE_PAD - CARD_PAD - textWidth(count, EYEBROW_SIZE, false, true),
    y,
    size: EYEBROW_SIZE,
    text: count,
    mono: true,
    color: MUTED,
  })

  y += 26
  // Where the rail starts and stops: the anchor of the first row and of
  // the last, which is no longer a fixed distance apart now that rows
  // grow to fit what is in them.
  let railTop: number | null = null
  let railBottom = y

  sheet.sessions.forEach((session, i) => {
    const top = y

    /*
     * The row is two lines stacked, not two columns side by side.
     *
     * Side by side, a long name and a long lead fought over one width and
     * both lost — the name squeezed into a column a few letters across
     * while the pill wrapped into a paragraph. Down the page they each
     * get the whole row: the name at heading size on the first line, and
     * who is doing it directly beneath, which is also the order somebody
     * reads them in.
     */
    const lead = session.lead
    const leadText = lead ?? 'Nobody assigned'
    const innerW = rowW - ROW_PAD_X * 2
    const nameLines = wrapText(session.name, NAME_SIZE, innerW)

    // A pill with a disc in it starts at the disc's inset; one with only
    // words in it starts at the text's own padding. Both end at the
    // text's padding, so the words are never crowded against the edge.
    const padLeft = lead ? AVATAR_INSET : PILL_PAD
    const discW = lead ? AVATAR * 2 + PILL_GAP : 0
    const leadTextW = innerW - padLeft - PILL_PAD - discW
    const leadLines = wrapText(leadText, LEAD_SIZE, Math.max(leadTextW, 60))
    const leadW = Math.max(...leadLines.map((line) => textWidth(line, LEAD_SIZE, false)))
    const pillW = padLeft + discW + leadW + PILL_PAD
    const pillH = Math.max(AVATAR * 2 + AVATAR_INSET * 2, leadLines.length * LEAD_LINE + 12)

    // What the row hangs from: the first line of the name, so the clock
    // beside it and the dot on the rail line up with the words rather
    // than with the middle of a box whose height depends on the text.
    // A baseline is not a top edge, so the cap height is added back —
    // otherwise the padding above the name measures shorter than the
    // padding below the pill and the row sits low in its own box.
    const anchor = top + ROW_PAD_Y + NAME_SIZE * 0.72
    const pillTop = anchor + (nameLines.length - 1) * NAME_LINE + 10
    const rowH = Math.max(ROW_MIN_H, pillTop - top + pillH + ROW_PAD_Y)
    if (railTop === null) railTop = anchor
    railBottom = anchor

    // Time and duration in the left column, right-aligned to the rail.
    const time = session.time
    texts.push({
      x: RAIL_X - 16 - textWidth(time, TIME_SIZE, true, true),
      y: anchor,
      size: TIME_SIZE,
      text: time,
      mono: true,
      bold: true,
      color: TIME_INK,
    })
    const mins = `${session.minutes} min`
    texts.push({
      x: RAIL_X - 16 - textWidth(mins, MINUTES_SIZE, false, true),
      y: anchor + 18,
      size: MINUTES_SIZE,
      text: mins,
      mono: true,
      color: MINUTES_INK,
    })

    // The dot on the rail. The first is lit, as the page lights the one
    // the service opens with.
    circles.push({ cx: RAIL_X, cy: anchor - 5, r: i === 0 ? 5 : 3.5, color: i === 0 ? PRIMARY : RAIL })

    // The session's own card.
    rects.push({ x: ROW_X, y: top, w: rowW, h: rowH, color: CARD, radius: 16 })

    // The name, as many lines as it runs to.
    let nameY = anchor
    for (const line of nameLines) {
      texts.push({ x: ROW_X + ROW_PAD_X, y: nameY, size: NAME_SIZE, text: line, bold: true, color: INK })
      nameY += NAME_LINE
    }

    // Who is doing it, on its own line beneath — or the gap, named,
    // because that is what a planner is scanning for.
    const pillX = ROW_X + ROW_PAD_X
    rects.push({
      x: pillX,
      y: pillTop,
      w: pillW,
      h: pillH,
      color: lead ? PILL : PILL_EMPTY,
      radius: Math.min(17, pillH / 2),
    })
    const pillMid = pillTop + pillH / 2
    if (lead) {
      circles.push({ cx: pillX + padLeft + AVATAR, cy: pillMid, r: AVATAR, color: AVATAR_DISC })
      const ini = initialsOf(lead)
      texts.push({
        x: pillX + padLeft + AVATAR - textWidth(ini, 9, false, true) / 2,
        y: pillMid + 3.5,
        size: 9,
        text: ini,
        mono: true,
        color: AVATAR_INK,
      })
    }
    let leadY = pillMid - ((leadLines.length - 1) * LEAD_LINE) / 2 + 4.5
    for (const line of leadLines) {
      texts.push({
        x: pillX + padLeft + discW,
        y: leadY,
        size: LEAD_SIZE,
        text: line,
        color: lead ? INK : WARN,
      })
      leadY += LEAD_LINE
    }

    y = top + rowH + ROW_GAP
  })

  if (sheet.sessions.length === 0) {
    texts.push({
      x: ROW_X,
      y: y + 22,
      size: NAME_SIZE,
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
    ? wrapText(sheet.windowLabel, LEAD_SIZE, cardW - CARD_PAD * 2)
    : []
  const tileH = windowLines.length > 0 ? 92 + 8 + windowLines.length * 18 : 92
  rects.push({ x: PAGE_PAD, y: tileTop, w: cardW, h: tileH, color: WINDOW_TILE, radius: 20 })
  texts.push({
    x: PAGE_PAD + CARD_PAD,
    y: tileTop + 30,
    size: EYEBROW_SIZE,
    text: 'SERVICE WINDOW',
    mono: true,
    color: MUTED,
  })
  texts.push({
    x: PAGE_PAD + CARD_PAD,
    y: tileTop + 70,
    size: 28,
    text: sheet.totalLabel,
    bold: true,
    mono: true,
    color: INK,
  })
  texts.push({
    x: PAGE_PAD + CARD_PAD + textWidth(sheet.totalLabel, 28, true, true) + 12,
    y: tileTop + 70,
    size: LEAD_SIZE,
    text: 'end to end',
    color: MUTED,
  })
  let windowY = tileTop + 96
  for (const line of windowLines) {
    texts.push({ x: PAGE_PAD + CARD_PAD, y: windowY, size: LEAD_SIZE, text: line, color: MUTED })
    windowY += 18
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
    size: FOOTER_SIZE,
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
