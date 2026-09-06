import { describe, expect, it } from 'vitest'
import { serviceSheetPage, type ServiceSheet } from './serviceSheet'
import { A4 } from './pdfDoc'
import { textWidth } from './helveticaMetrics'

const sheet = (over: Partial<ServiceSheet> = {}): ServiceSheet => ({
  serviceType: 'Sunday Morning Celebration',
  date: '2026-08-30',
  sessions: [
    { time: '09:30 AM', minutes: 5, name: 'Welcome & Notices', lead: 'Ama Serwaa' },
    { time: '09:35 AM', minutes: 25, name: 'Worship Set', lead: null },
  ],
  totalLabel: '1h 20m end to end',
  windowLabel: 'Doors at 09:30 AM, closing around 10:50 AM.',
  printedOn: 'exported 29 August 2026',
  ...over,
})

const words = (page: ReturnType<typeof serviceSheetPage>) => page.texts.map((t) => t.text)

describe('serviceSheetPage', () => {
  it('puts the service, the date and every session on the sheet', () => {
    const page = serviceSheetPage(sheet())
    const said = words(page)
    expect(said).toContain('Sunday Morning Celebration')
    expect(said).toContain('2026-08-30')
    expect(said).toContain('Welcome & Notices')
    expect(said).toContain('Worship Set')
    expect(said).toContain('09:30 AM')
    expect(said).toContain('1h 20m end to end')
  })

  // The gap is the thing a planner is scanning for, so a blank cell would
  // be the one place the sheet is less useful than the screen.
  it('names an empty session rather than leaving the column blank', () => {
    const said = words(serviceSheetPage(sheet()))
    expect(said).toContain('Nobody assigned')
  })

  it('says so plainly when nothing is planned yet', () => {
    const said = words(serviceSheetPage(sheet({ sessions: [] })))
    expect(said).toContain('No sessions planned yet.')
  })

  describe('fit', () => {
    it('keeps a full page for printing', () => {
      expect(serviceSheetPage(sheet(), 'page').height).toBe(A4.height)
    })

    // A five-item service shared in a chat should not be two thirds empty
    // paper.
    it('ends where the content does for an image', () => {
      const cropped = serviceSheetPage(sheet(), 'content')
      expect(cropped.height).toBeLessThan(A4.height)
      expect(cropped.width).toBe(A4.width)
    })

    it('grows the cropped sheet as the running order grows', () => {
      const short = serviceSheetPage(sheet(), 'content').height
      const long = serviceSheetPage(
        sheet({
          sessions: Array.from({ length: 12 }, (_, i) => ({
            time: '09:30 AM',
            minutes: 5,
            name: `Session ${i + 1}`,
            lead: 'Someone',
          })),
        }),
        'content',
      ).height
      expect(long).toBeGreaterThan(short)
    })

    it('keeps the footer on the sheet whichever way it is cut', () => {
      for (const fit of ['page', 'content'] as const) {
        const page = serviceSheetPage(sheet(), fit)
        const footer = page.texts.find((t) => t.text.startsWith('Rehoboth'))
        expect(footer).toBeDefined()
        expect(footer!.y).toBeLessThanOrEqual(page.height)
      }
    })
  })

  it('keeps everything it draws inside the page it declares', () => {
    const page = serviceSheetPage(sheet(), 'content')
    for (const r of page.rects) expect(r.x + r.w).toBeLessThanOrEqual(page.width + 0.01)
    for (const l of page.lines ?? []) expect(Math.max(l.x1, l.x2)).toBeLessThanOrEqual(page.width)
  })

  /*
   * Nothing on this sheet is allowed to be cut short. It is handed to
   * somebody who was not in the room when the service was planned, and
   * three quarters of a session's name is a hint rather than information.
   */
  describe('long text', () => {
    const long = sheet({
      serviceType: 'Malayalam Service of Word, Worship and Communion',
      sessions: [
        {
          time: '12:18 PM',
          minutes: 10,
          name: 'Welcome | Introduction | Short Message | Announcements',
          lead: 'Rohit Kochikkat Francis',
        },
        { time: '12:28 PM', minutes: 60, name: 'Worship 3', lead: 'Blessy Jijin' },
      ],
    })

    /** Every word of a phrase, in order, somewhere in the page's text. */
    const carries = (page: ReturnType<typeof serviceSheetPage>, phrase: string) => {
      const said = page.texts.map((t) => t.text).join(' ')
      return phrase.split(/\s+/).every((word) => said.includes(word))
    }

    it('never writes an ellipsis, which is the shape of a cut', () => {
      for (const t of serviceSheetPage(long, 'content').texts) {
        expect(t.text, t.text).not.toMatch(/\.\.\.|…/)
      }
    })

    it('keeps every word of a long session name', () => {
      const page = serviceSheetPage(long, 'content')
      expect(carries(page, 'Welcome | Introduction | Short Message | Announcements')).toBe(true)
    })

    it('keeps every word of a long lead name and a long service name', () => {
      const page = serviceSheetPage(long, 'content')
      expect(carries(page, 'Rohit Kochikkat Francis')).toBe(true)
      expect(carries(page, 'Malayalam Service of Word, Worship and Communion')).toBe(true)
    })

    it('grows the sheet to hold what it is now drawing', () => {
      const wrapped = serviceSheetPage(long, 'content').height
      const plain = serviceSheetPage(
        sheet({ sessions: long.sessions.map((x) => ({ ...x, name: 'Short', lead: 'A B' })) }),
        'content',
      ).height
      expect(wrapped).toBeGreaterThan(plain)
    })

    it('leaves no line of text running off the edge of the sheet', () => {
      const page = serviceSheetPage(long, 'content')
      for (const t of page.texts) {
        const right = t.x + textWidth(t.text, t.size, !!t.bold, !!t.mono)
        expect(right, t.text).toBeLessThanOrEqual(page.width - 4)
      }
    })

    it('keeps the rows apart rather than letting a tall one overlap the next', () => {
      const page = serviceSheetPage(long, 'content')
      // The session cards, in the order they were drawn.
      const cards = page.rects.filter((r) => r.radius === 14)
      for (let i = 1; i < cards.length; i++) {
        expect(cards[i].y).toBeGreaterThanOrEqual(cards[i - 1].y + cards[i - 1].h)
      }
    })
  })

  it('grows a printed page past A4 rather than losing the end of a long service', () => {
    const many = sheet({
      sessions: Array.from({ length: 24 }, (_, i) => ({
        time: '09:30 AM',
        minutes: 5,
        name: `Session ${i + 1} with a name long enough to want a second line of its own`,
        lead: 'Somebody With A Long Name',
      })),
    })
    const page = serviceSheetPage(many, 'page')
    expect(page.height).toBeGreaterThan(A4.height)
    // And everything it drew is on it.
    for (const t of page.texts) expect(t.y, t.text).toBeLessThanOrEqual(page.height)
    for (const r of page.rects) expect(r.y + r.h).toBeLessThanOrEqual(page.height + 0.01)
  })

  it('still gives a short service the whole printed page', () => {
    expect(serviceSheetPage(sheet(), 'page').height).toBe(A4.height)
  })

  /*
   * The same sheet, printable. A black page costs a cartridge and comes
   * out of most church printers grey, so the light one exists for paper;
   * the dark one is what belongs in a group chat.
   */
  describe('light and dark', () => {
    const ground = (page: ReturnType<typeof serviceSheetPage>) => page.rects[0].color

    it('paints the dark sheet on black, and says so for a format with no transparency', () => {
      const page = serviceSheetPage(sheet(), 'content', 'dark')
      expect(ground(page)).toBe('#000000')
      expect(page.background).toBe('#000000')
    })

    it('paints the light sheet on white', () => {
      const page = serviceSheetPage(sheet(), 'content', 'light')
      expect(ground(page)).toBe('#ffffff')
      expect(page.background).toBe('#ffffff')
    })

    it('is dark unless asked otherwise, as it has always been', () => {
      expect(serviceSheetPage(sheet(), 'content').background).toBe('#000000')
    })

    it('turns the ink over with the ground rather than only the background', () => {
      const dark = serviceSheetPage(sheet(), 'content', 'dark')
      const light = serviceSheetPage(sheet(), 'content', 'light')
      const inkOf = (page: ReturnType<typeof serviceSheetPage>) =>
        page.texts.find((t) => t.text === 'Sunday Morning Celebration')!.color
      expect(inkOf(dark)).toBe('#f5f5f7')
      expect(inkOf(light)).toBe('#1c1c1e')
    })

    it('lays both out identically — only the colours differ', () => {
      const strip = (page: ReturnType<typeof serviceSheetPage>) =>
        JSON.stringify({
          height: page.height,
          texts: page.texts.map(({ x, y, size, text }) => ({ x, y, size, text })),
          rects: page.rects.map(({ x, y, w, h }) => ({ x, y, w, h })),
        })
      expect(strip(serviceSheetPage(sheet(), 'content', 'light'))).toBe(
        strip(serviceSheetPage(sheet(), 'content', 'dark')),
      )
    })

    it('keeps the unassigned pill readable on paper', () => {
      // #ff9f0a on white is a smear; the light theme has its own orange.
      const light = serviceSheetPage(sheet(), 'content', 'light')
      const warned = light.texts.find((t) => t.text === 'Nobody assigned')!
      expect(warned.color).toBe('#b86e00')
    })
  })
})
