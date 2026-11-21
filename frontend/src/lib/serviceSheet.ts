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
  /** Everybody taking it, in the order the planner has them. */
  leads: string[]
  /**
   * Whoever steps in if they cannot (0182), drawn apart under a
   * SUBSTITUTE label in amber, so the two are never confused.
   */
  substitutes?: string[]
  /**
   * Whoever translates it as it is taken (0315), drawn apart again under
   * a TRANSLATOR label in indigo: neither taking it nor standing by.
   */
  translators?: string[]
}

export interface ServiceSheet {
  serviceType: string
  date: string
  sessions: SheetSession[]
  /** Just the duration - "3h 7m". The sheet adds "end to end" itself. */
  totalLabel: string
  windowLabel: string | null
  printedOn: string
  /** When the doors open and when it closes, as clocks: "10:00 AM". Either may be unknown. */
  startsAt?: string | null
  endsAt?: string | null
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
  /** A substitute's pill and initials disc, and the label above them (0182). */
  subPill: string
  subDisc: string
  subLabel: string
  /** A translator's, the same three (0315). */
  trPill: string
  trDisc: string
  trLabel: string
  /** The small tag under each time that says how long the session runs. */
  chip: string
}

const PALETTES: Record<SheetTheme, Palette> = {
  dark: {
    backdrop: '#000000',
    surface: '#141418',
    card: '#1c1c22',
    pill: '#26262e',
    pillEmpty: '#2a2118',
    ink: '#f5f5f7',
    muted: '#b9b9c0',
    faint: '#9a9aa0',
    rail: '#38383f',
    avatarDisc: '#4a4a52',
    avatarInk: '#ececf0',
    primary: '#0a84ff',
    warn: '#ff9f0a',
    windowTile: '#101a26',
    time: '#f5f5f7',
    minutes: '#c7c7cc',
    subPill: '#33261a',
    subDisc: '#6b4a1c',
    subLabel: '#ff9f0a',
    trPill: '#23234a',
    trDisc: '#44428f',
    trLabel: '#a5a3ff',
    chip: '#2e2e37',
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
    subPill: '#fbe9cf',
    subDisc: '#f0c98f',
    subLabel: '#8a5200',
    trPill: '#e7e7fb',
    trDisc: '#c5c4f4',
    trLabel: '#4340b5',
    chip: '#e3e3ea',
  },
}

const PAGE_PAD = 34
const CARD_PAD = 22
/** The left column: when it starts, and how long it runs. */
const TIME_COL = 122
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
const ROW_MIN_H = 86
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
const DATE_SIZE = 15
const EYEBROW_SIZE = 10
const NAME_SIZE = 21
const NAME_LINE = 26
const LEAD_SIZE = 13.5
const LEAD_LINE = 17
/*
 * The clock is the largest thing in a row, and nothing on the sheet is in
 * the typewriter face any more.
 *
 * The times, the durations and the date were all set in Courier, because
 * the screen sets them in a monospace. On screen that face is a sturdy
 * one; in a PDF it is Courier, the thinnest face there is, and at sixteen
 * points the column a stage manager reads from across a room was the
 * faintest thing on the page — the Owner had to lean in to read a start
 * time. Helvetica's figures are all one width anyway, so the column still
 * lines up; it is now bold, at the size of a clock, with the am/pm set
 * small beside it and the length in a tag of its own underneath.
 */
const TIME_SIZE = 26
const AMPM_SIZE = 12
const MINUTES_SIZE = 10.5
const CHIP_H = 20
/** The three figures under the title: starts, ends, runs for. */
const STAT_H = 74
const STAT_GAP = 10
const STAT_VALUE = 24
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
/** Between one line of pills and the next, when they do not all fit across. */
const PILL_ROW_GAP = 6
/** Between the people taking a session and the SUBSTITUTE label under them. */
const SUB_GAP = 10
/** The label's own line, above the substitutes' pills. */
const SUB_LABEL_H = 16

/** Pills laid out in lines across `innerW`, side by side while they fit. */
function pillLines(pills: Pill[], innerW: number): { rows: Pill[][]; heights: number[]; total: number } {
  const rows: Pill[][] = []
  let line: Pill[] = []
  let lineW = 0
  for (const pill of pills) {
    const widthWith = line.length > 0 ? lineW + PILL_GAP + pill.w : pill.w
    if (line.length > 0 && widthWith > innerW) {
      rows.push(line)
      line = [pill]
      lineW = pill.w
    } else {
      line.push(pill)
      lineW = widthWith
    }
  }
  if (line.length > 0) rows.push(line)
  const heights = rows.map((row) => Math.max(...row.map((pill) => pill.h)))
  const total = heights.reduce((sum, h) => sum + h, 0) + Math.max(0, rows.length - 1) * PILL_ROW_GAP
  return { rows, heights, total }
}

/** One name's pill, measured before anything is drawn. */
interface Pill {
  /** The name, or null for the one that says nobody is on this. */
  lead: string | null
  lines: string[]
  w: number
  h: number
  padLeft: number
  discW: number
}

/**
 * How much room one pill needs.
 *
 * A pill with a disc in it starts at the disc's inset; one with only
 * words in it starts at the text's own padding. Both end at the text's
 * padding, so the words are never crowded against the edge.
 */
function measurePill(lead: string | null, innerW: number): Pill {
  const padLeft = lead ? AVATAR_INSET : PILL_PAD
  const discW = lead ? AVATAR * 2 + PILL_GAP : 0
  const lines = wrapText(lead ?? 'Nobody assigned', LEAD_SIZE, Math.max(innerW - padLeft - PILL_PAD - discW, 60), true)
  const textW = Math.max(...lines.map((line) => textWidth(line, LEAD_SIZE, true)))
  return {
    lead,
    lines,
    w: padLeft + discW + textW + PILL_PAD,
    h: Math.max(AVATAR * 2 + AVATAR_INSET * 2, lines.length * LEAD_LINE + 12),
    padLeft,
    discW,
  }
}

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

/**
 * "2026-11-15" as somebody says it: "Sunday 15 November 2026". Anything
 * that is not a date is left exactly as it came.
 */
export function sheetDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!m) return iso
  const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  if (Number.isNaN(day.getTime())) return iso
  const part = (options: Intl.DateTimeFormatOptions) => day.toLocaleDateString('en-GB', { ...options, timeZone: 'UTC' })
  return `${part({ weekday: 'long' })} ${part({ day: 'numeric' })} ${part({ month: 'long' })} ${part({ year: 'numeric' })}`
}

/** "10:00 AM" as the figures and what follows them, so each can be its own size. */
function clockParts(time: string): { figures: string; suffix: string } {
  const at = time.trim().indexOf(' ')
  return at < 0 ? { figures: time.trim(), suffix: '' } : { figures: time.trim().slice(0, at), suffix: time.trim().slice(at + 1) }
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
    subPill: SUB_PILL,
    subDisc: SUB_DISC,
    subLabel: SUB_LABEL,
    trPill: TR_PILL,
    trDisc: TR_DISC,
    trLabel: TR_LABEL,
    chip: CHIP,
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
  texts.push({ x: PAGE_PAD, y: dateY, size: DATE_SIZE, text: sheetDate(sheet.date), bold: true, color: PRIMARY })

  /*
   * The three things asked of a running order before anybody reads a row
   * of it: when does it start, when is it over, how long is that. They
   * were a tile at the foot of the sheet, under every session; they are
   * the first thing under the title now, each in its own box at the size
   * of a heading. A box is left out when its figure is not known rather
   * than drawn empty.
   */
  const startsAt = sheet.startsAt ?? sheet.sessions[0]?.time ?? null
  const stats = [
    startsAt ? { label: 'STARTS', value: startsAt } : null,
    sheet.endsAt ? { label: 'ENDS', value: sheet.endsAt } : null,
    { label: 'RUNS FOR', value: sheet.totalLabel },
  ].filter((stat): stat is { label: string; value: string } => stat !== null)
  const statTop = dateY + 22
  const statW = (cardW - STAT_GAP * (stats.length - 1)) / stats.length
  stats.forEach((stat, i) => {
    const x = PAGE_PAD + i * (statW + STAT_GAP)
    rects.push({ x, y: statTop, w: statW, h: STAT_H, color: WINDOW_TILE, radius: 18 })
    texts.push({ x: x + 18, y: statTop + 26, size: EYEBROW_SIZE, text: stat.label, bold: true, color: MUTED })
    const { figures, suffix } = clockParts(stat.value)
    // A duration ("1h 25m") is all figures; a clock keeps its am/pm small.
    const whole = /\d[hm]/.test(stat.value)
    texts.push({ x: x + 18, y: statTop + 56, size: STAT_VALUE, text: whole ? stat.value : figures, bold: true, color: INK })
    if (!whole && suffix) {
      texts.push({
        x: x + 18 + textWidth(figures, STAT_VALUE, true) + 5,
        y: statTop + 56,
        size: AMPM_SIZE,
        text: suffix,
        bold: true,
        color: MUTED,
      })
    }
  })

  // The running-order card.
  const cardTop = statTop + STAT_H + 16
  let y = cardTop + 34

  texts.push({
    x: PAGE_PAD + CARD_PAD,
    y,
    size: EYEBROW_SIZE,
    text: 'RUNNING ORDER',
    bold: true,
    color: MUTED,
  })
  const count = `${sheet.sessions.length} ${sheet.sessions.length === 1 ? 'SESSION' : 'SESSIONS'}`
  texts.push({
    x: W - PAGE_PAD - CARD_PAD - textWidth(count, EYEBROW_SIZE, true),
    y,
    size: EYEBROW_SIZE,
    text: count,
    bold: true,
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
    const innerW = rowW - ROW_PAD_X * 2
    const nameLines = wrapText(session.name, NAME_SIZE, innerW, true)

    /*
     * One pill per person, and one saying nobody when there is nobody.
     *
     * A session holds as many names as it takes — worship is a team, and
     * communion is served by several people — so the names are laid out
     * the way the page lays them out: side by side while they fit, onto
     * another line when they do not. A pill is never split across lines;
     * a single very long name wraps inside its own pill instead.
     */
    const leads = pillLines(
      (session.leads.length > 0 ? session.leads : [null]).map((lead) => measurePill(lead, innerW)),
      innerW,
    )
    // And whoever stands in, under their own label — nothing at all when
    // nobody does.
    const apart = (names: string[] | undefined) =>
      names && names.length > 0 ? pillLines(names.map((name) => measurePill(name, innerW)), innerW) : null
    const subs = apart(session.substitutes)
    // And whoever translates, the same way under theirs (0315).
    const trs = apart(session.translators)
    const pillsH =
      leads.total + (subs ? SUB_GAP + SUB_LABEL_H + subs.total : 0) + (trs ? SUB_GAP + SUB_LABEL_H + trs.total : 0)

    // What the row hangs from: the first line of the name, so the clock
    // beside it and the dot on the rail line up with the words rather
    // than with the middle of a box whose height depends on the text.
    // A baseline is not a top edge, so the cap height is added back —
    // otherwise the padding above the name measures shorter than the
    // padding below the pill and the row sits low in its own box.
    const anchor = top + ROW_PAD_Y + NAME_SIZE * 0.72
    const pillTop = anchor + (nameLines.length - 1) * NAME_LINE + 10
    const rowH = Math.max(ROW_MIN_H, pillTop - top + pillsH + ROW_PAD_Y)
    if (railTop === null) railTop = anchor - 8
    railBottom = anchor - 8

    // The clock in the left column, right-aligned to the rail: the
    // figures large, the am/pm small beside them on the same baseline.
    const { figures, suffix } = clockParts(session.time)
    const suffixW = suffix ? textWidth(suffix, AMPM_SIZE, true) + 4 : 0
    const clockRight = RAIL_X - 18
    texts.push({
      x: clockRight - suffixW - textWidth(figures, TIME_SIZE, true),
      y: anchor,
      size: TIME_SIZE,
      text: figures,
      bold: true,
      color: TIME_INK,
    })
    if (suffix) {
      texts.push({
        x: clockRight - suffixW + 4,
        y: anchor,
        size: AMPM_SIZE,
        text: suffix,
        bold: true,
        color: MINUTES_INK,
      })
    }
    // How long it runs, in a tag of its own under the clock.
    const mins = `${session.minutes} MIN`
    const chipW = textWidth(mins, MINUTES_SIZE, true) + 18
    rects.push({ x: clockRight - chipW, y: anchor + 9, w: chipW, h: CHIP_H, color: CHIP, radius: CHIP_H / 2 })
    texts.push({
      x: clockRight - chipW + 9,
      y: anchor + 9 + CHIP_H / 2 + MINUTES_SIZE * 0.36,
      size: MINUTES_SIZE,
      text: mins,
      bold: true,
      color: MINUTES_INK,
    })

    // The dot on the rail. The first is lit, as the page lights the one
    // the service opens with.
    circles.push({ cx: RAIL_X, cy: anchor - 8, r: i === 0 ? 6 : 4.5, color: i === 0 ? PRIMARY : RAIL })

    // The session's own card.
    rects.push({ x: ROW_X, y: top, w: rowW, h: rowH, color: CARD, radius: 16 })

    // The name, as many lines as it runs to.
    let nameY = anchor
    for (const line of nameLines) {
      texts.push({ x: ROW_X + ROW_PAD_X, y: nameY, size: NAME_SIZE, text: line, bold: true, color: INK })
      nameY += NAME_LINE
    }

    // Who is doing it, on its own line beneath — or the gap, named,
    // because that is what a planner is scanning for. Then, if anybody
    // stands in, the SUBSTITUTE label and their pills in amber; and if
    // anybody translates, the TRANSLATOR label and theirs in indigo.
    let pillY = pillTop
    const drawPills = (lines: ReturnType<typeof pillLines>, part: 'lead' | 'substitute' | 'translator') =>
      lines.rows.forEach((row, rowIndex) => {
      let pillX = ROW_X + ROW_PAD_X
      for (const pill of row) {
        rects.push({
          x: pillX,
          y: pillY,
          w: pill.w,
          h: pill.h,
          color: part === 'substitute' ? SUB_PILL : part === 'translator' ? TR_PILL : pill.lead ? PILL : PILL_EMPTY,
          radius: Math.min(17, pill.h / 2),
        })
        const pillMid = pillY + pill.h / 2
        if (pill.lead) {
          circles.push({
            cx: pillX + pill.padLeft + AVATAR,
            cy: pillMid,
            r: AVATAR,
            color: part === 'substitute' ? SUB_DISC : part === 'translator' ? TR_DISC : AVATAR_DISC,
          })
          const ini = initialsOf(pill.lead)
          texts.push({
            x: pillX + pill.padLeft + AVATAR - textWidth(ini, 9.5, true) / 2,
            y: pillMid + 3.5,
            size: 9.5,
            text: ini,
            bold: true,
            color: AVATAR_INK,
          })
        }
        let leadY = pillMid - ((pill.lines.length - 1) * LEAD_LINE) / 2 + 4.5
        for (const textLine of pill.lines) {
          texts.push({
            x: pillX + pill.padLeft + pill.discW,
            y: leadY,
            size: LEAD_SIZE,
            text: textLine,
            bold: true,
            color: pill.lead ? INK : WARN,
          })
          leadY += LEAD_LINE
        }
        pillX += pill.w + PILL_GAP
      }
      pillY += lines.heights[rowIndex] + PILL_ROW_GAP
    })
    drawPills(leads, 'lead')
    const drawApart = (lines: ReturnType<typeof pillLines>, part: 'substitute' | 'translator') => {
      // pillY has stepped one gap past the last line above.
      pillY += SUB_GAP - PILL_ROW_GAP
      texts.push({
        x: ROW_X + ROW_PAD_X,
        y: pillY + EYEBROW_SIZE,
        size: EYEBROW_SIZE,
        text: part === 'substitute' ? 'SUBSTITUTE' : 'TRANSLATOR',
        bold: true,
        color: part === 'substitute' ? SUB_LABEL : TR_LABEL,
      })
      pillY += SUB_LABEL_H
      drawPills(lines, part)
    }
    if (subs) drawApart(subs, 'substitute')
    if (trs) drawApart(trs, 'translator')

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
      width: 2,
    })
  }

  const cardH = y - ROW_GAP + CARD_PAD - cardTop
  // Drawn first so everything above sits on it — rects paint in order.
  rects.unshift({ x: PAGE_PAD, y: cardTop, w: cardW, h: cardH, color: SURFACE, radius: 20 })
  rects.unshift({ x: 0, y: 0, w: W, h: fit === 'page' ? A4.height : 0, color: BACKDROP })

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
  const footerY = cardTop + cardH + 30
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
