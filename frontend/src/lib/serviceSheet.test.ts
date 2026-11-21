import { describe, expect, it } from 'vitest'
import { serviceSheetPage, sheetDate, type ServiceSheet } from './serviceSheet'
import { A4 } from './pdfDoc'
import { textWidth } from './helveticaMetrics'
import { contrastFloor, contrastRatio } from './contrast'

const sheet = (over: Partial<ServiceSheet> = {}): ServiceSheet => ({
  serviceType: 'Sunday Morning Celebration',
  date: '2026-08-30',
  sessions: [
    { time: '09:30 AM', minutes: 5, name: 'Welcome & Notices', leads: ['Ama Serwaa'] },
    { time: '09:35 AM', minutes: 25, name: 'Worship Set', leads: [] },
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
    expect(said).toContain('Sunday 30 August 2026')
    expect(said).toContain('Welcome & Notices')
    expect(said).toContain('Worship Set')
    // A clock is its figures and, smaller beside them, its am/pm.
    expect(said).toContain('09:30')
    expect(said).toContain('AM')
    expect(said).toContain('5 MIN')
    expect(said).toContain('1h 20m end to end')
  })

  it('says the date the way somebody would, and leaves anything else alone', () => {
    expect(sheetDate('2026-11-15')).toBe('Sunday 15 November 2026')
    expect(sheetDate('next week')).toBe('next week')
    expect(sheetDate('')).toBe('')
  })

  describe('what somebody reads from across the room', () => {
    // The Owner had to lean in to read a start time: the times, the
    // durations and the date were in the PDF's typewriter face, the
    // thinnest there is.
    it('sets nothing on the sheet in the typewriter face', () => {
      for (const theme of ['dark', 'light'] as const) {
        const page = serviceSheetPage(sheet({ endsAt: '10:50 AM' }), 'content', theme)
        expect(page.texts.filter((t) => t.mono).map((t) => t.text)).toEqual([])
      }
    })

    it('makes the clock the largest thing in a row, and bold', () => {
      const page = serviceSheetPage(sheet(), 'content')
      const clock = page.texts.filter((t) => t.text === '09:35')
      const name = page.texts.find((t) => t.text === 'Worship Set')!
      const row = clock.find((t) => Math.abs(t.y - name.y) < 0.01)!
      expect(row.bold).toBe(true)
      expect(row.size).toBeGreaterThan(name.size)
      expect(row.size).toBeGreaterThanOrEqual(24)
    })

    it('writes the length, the names and the labels in bold too', () => {
      const page = serviceSheetPage(sheet(), 'content')
      for (const text of ['5 MIN', 'Ama Serwaa', 'Nobody assigned', 'RUNNING ORDER', 'Sunday 30 August 2026']) {
        expect(page.texts.find((t) => t.text === text)?.bold, text).toBe(true)
      }
    })

    it('opens with when it starts, when it ends and how long it runs', () => {
      const page = serviceSheetPage(sheet({ startsAt: '09:30 AM', endsAt: '10:50 AM' }), 'content')
      const labels = ['STARTS', 'ENDS', 'RUNS FOR'].map((label) => page.texts.find((t) => t.text === label)!)
      expect(labels.every(Boolean)).toBe(true)
      // Above the running order, not under it.
      const order = page.texts.find((t) => t.text === 'RUNNING ORDER')!
      for (const label of labels) expect(label.y).toBeLessThan(order.y)
      expect(words(page)).toContain('10:50')
    })

    it('leaves out the end when nobody knows it, rather than drawing an empty box', () => {
      const said = words(serviceSheetPage(sheet({ endsAt: null }), 'content'))
      expect(said).toContain('STARTS')
      expect(said).not.toContain('ENDS')
    })

    it('still has something to say for a service with nothing planned', () => {
      const said = words(serviceSheetPage(sheet({ sessions: [] }), 'content'))
      expect(said).not.toContain('STARTS')
      expect(said).toContain('RUNS FOR')
    })
  })

  // The gap is the thing a planner is scanning for, so a blank cell would
  // be the one place the sheet is less useful than the screen.
  it('names an empty session rather than leaving the column blank', () => {
    const said = words(serviceSheetPage(sheet()))
    expect(said).toContain('Nobody assigned')
  })

  describe('substitutes (0182)', () => {
    const withSub = sheet({
      sessions: [
        { time: '09:30 AM', minutes: 5, name: 'Welcome & Notices', leads: ['Ama Serwaa'], substitutes: ['Kofi Asante', 'Pastor Sam'] },
        { time: '09:35 AM', minutes: 25, name: 'Worship Set', leads: ['Grace Mensah'] },
      ],
    })

    it('names whoever stands in under a SUBSTITUTE label, once, only where somebody does', () => {
      const said = words(serviceSheetPage(withSub))
      expect(said.filter((t) => t === 'SUBSTITUTE')).toHaveLength(1)
      expect(said).toContain('Kofi Asante')
      expect(said).toContain('Pastor Sam')
      expect(words(serviceSheetPage(sheet()))).not.toContain('SUBSTITUTE')
    })

    for (const theme of ['dark', 'light'] as const) {
      it(`draws a substitute's pill in its own colour, readable, in ${theme}`, () => {
        const page = serviceSheetPage(withSub, 'content', theme)
        const textAt = (name: string) => page.texts.find((t) => t.text === name)!
        const pillUnder = (name: string) => {
          const t = textAt(name)
          return page.rects
            .filter((r) => t.x >= r.x && t.x <= r.x + r.w && t.y >= r.y && t.y <= r.y + r.h)
            .sort((a, b) => a.w * a.h - b.w * b.h)[0]
        }
        const lead = pillUnder('Ama Serwaa')
        const sub = pillUnder('Kofi Asante')
        expect(sub.color).not.toBe(lead.color)
        expect(contrastRatio(textAt('Kofi Asante').color!, sub.color!)).toBeGreaterThanOrEqual(4.5)
        // The label sits on the session's card, not on a pill.
        const label = textAt('SUBSTITUTE')
        const card = page.rects
          .filter((r) => label.x >= r.x && label.x <= r.x + r.w && label.y >= r.y && label.y <= r.y + r.h)
          .sort((a, b) => a.w * a.h - b.w * b.h)[0]
        expect(contrastRatio(label.color!, card.color!)).toBeGreaterThanOrEqual(4.5)
      })
    }

    it('makes the row tall enough to hold them, pushing the next session down', () => {
      const plain = serviceSheetPage(sheet({ sessions: withSub.sessions.map((s) => ({ ...s, substitutes: [] })) }), 'content')
      const subbed = serviceSheetPage(withSub, 'content')
      const yOf = (page: ReturnType<typeof serviceSheetPage>) => page.texts.find((t) => t.text === 'Worship Set')!.y
      expect(yOf(subbed)).toBeGreaterThan(yOf(plain))
      const kofi = subbed.texts.find((t) => t.text === 'Kofi Asante')!
      expect(kofi.y).toBeLessThan(yOf(subbed))
    })
  })

  describe('translators (0315)', () => {
    const withBoth = sheet({
      sessions: [
        {
          time: '09:30 AM',
          minutes: 40,
          name: 'Message',
          leads: ['Ama Serwaa'],
          substitutes: ['Kofi Asante'],
          translators: ['Ps Saju Wigan', 'Rose Sam'],
        },
        { time: '10:10 AM', minutes: 25, name: 'Worship Set', leads: ['Grace Mensah'] },
      ],
    })

    it('names whoever translates under a TRANSLATOR label, once, only where somebody does', () => {
      const said = words(serviceSheetPage(withBoth))
      expect(said.filter((t) => t === 'TRANSLATOR')).toHaveLength(1)
      expect(said).toContain('Ps Saju Wigan')
      expect(said).toContain('Rose Sam')
      expect(words(serviceSheetPage(sheet()))).not.toContain('TRANSLATOR')
    })

    it('puts them under the substitutes, who are under the people taking it', () => {
      const page = serviceSheetPage(withBoth, 'content')
      const y = (text: string) => page.texts.find((t) => t.text === text)!.y
      expect(y('Ama Serwaa')).toBeLessThan(y('SUBSTITUTE'))
      expect(y('SUBSTITUTE')).toBeLessThan(y('Kofi Asante'))
      expect(y('Kofi Asante')).toBeLessThan(y('TRANSLATOR'))
      expect(y('TRANSLATOR')).toBeLessThan(y('Ps Saju Wigan'))
      // And the next session starts under all of it.
      expect(y('Rose Sam')).toBeLessThan(y('Worship Set'))
    })

    for (const theme of ['dark', 'light'] as const) {
      it(`draws a translator's pill in a colour of its own, readable, in ${theme}`, () => {
        const page = serviceSheetPage(withBoth, 'content', theme)
        const textAt = (name: string) => page.texts.find((t) => t.text === name)!
        const under = (name: string) => {
          const t = textAt(name)
          return page.rects
            .filter((r) => t.x >= r.x && t.x <= r.x + r.w && t.y >= r.y && t.y <= r.y + r.h)
            .sort((a, b) => a.w * a.h - b.w * b.h)[0]
        }
        const translator = under('Ps Saju Wigan')
        expect(translator.color).not.toBe(under('Ama Serwaa').color)
        expect(translator.color).not.toBe(under('Kofi Asante').color)
        expect(contrastRatio(textAt('Ps Saju Wigan').color!, translator.color!)).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(textAt('TRANSLATOR').color!, under('TRANSLATOR').color!)).toBeGreaterThanOrEqual(4.5)
      })
    }

    it('makes the row tall enough to hold them', () => {
      const without = serviceSheetPage(sheet({ sessions: withBoth.sessions.map((s) => ({ ...s, translators: [] })) }), 'content')
      const withThem = serviceSheetPage(withBoth, 'content')
      const yOf = (page: ReturnType<typeof serviceSheetPage>) => page.texts.find((t) => t.text === 'Worship Set')!.y
      expect(yOf(withThem)).toBeGreaterThan(yOf(without))
    })
  })

  describe('a guest’s note, under their name', () => {
    const GUEST = { name: 'Ps Saju Wigan', note: 'pastor from Harlow' }
    const withGuest = sheet({
      sessions: [
        { time: '09:30 AM', minutes: 40, name: 'Message', leads: [GUEST, 'Ama Serwaa'], substitutes: [{ name: 'Br Joel', note: 'from Reading' }], translators: [{ name: 'Rose Sam', note: null }] },
        { time: '10:10 AM', minutes: 25, name: 'Worship Set', leads: ['Grace Mensah'] },
      ],
    })

    it('says the note on the sheet for a guest on any of the three lists, and nothing for anybody without one', () => {
      const said = words(serviceSheetPage(withGuest))
      expect(said).toContain('Note: pastor from Harlow')
      expect(said).toContain('Note: from Reading')
      expect(said.filter((t) => t.startsWith('Note:'))).toHaveLength(2)
      // A name given as plain text, as it always could be, has none.
      expect(words(serviceSheetPage(sheet())).some((t) => t.startsWith('Note:'))).toBe(false)
    })

    it('puts it under the name and inside the same pill, smaller and quieter than the name', () => {
      const page = serviceSheetPage(withGuest, 'content')
      const name = page.texts.find((t) => t.text === 'Ps Saju Wigan')!
      const note = page.texts.find((t) => t.text === 'Note: pastor from Harlow')!
      expect(note.y).toBeGreaterThan(name.y)
      expect(note.x).toBe(name.x)
      expect(note.size).toBeLessThan(name.size)
      expect(note.bold ?? false).toBe(false)
      const pill = page.rects
        .filter((r) => name.x >= r.x && name.x <= r.x + r.w && name.y >= r.y && name.y <= r.y + r.h)
        .sort((a, b) => a.w * a.h - b.w * b.h)[0]
      expect(note.y).toBeLessThan(pill.y + pill.h - 4)
      expect(note.x + textWidth(note.text, note.size, false)).toBeLessThanOrEqual(pill.x + pill.w - 8)
      // The pill grew to hold it: taller than the one beside it with only a name.
      const plain = page.texts.find((t) => t.text === 'Ama Serwaa')!
      const plainPill = page.rects
        .filter((r) => plain.x >= r.x && plain.x <= r.x + r.w && plain.y >= r.y && plain.y <= r.y + r.h)
        .sort((a, b) => a.w * a.h - b.w * b.h)[0]
      expect(pill.h).toBeGreaterThan(plainPill.h)
    })

    it('wraps a long note inside its pill, every word of it, and the next session starts under it', () => {
      const long = 'senior pastor of the Harlow fellowship, visiting with his family for both days of the conference and speaking twice'
      const page = serviceSheetPage(
        sheet({
          sessions: [
            { time: '09:30 AM', minutes: 40, name: 'Message', leads: [{ name: 'Ps Saju Wigan', note: long }] },
            { time: '10:10 AM', minutes: 25, name: 'Worship Set', leads: ['Grace Mensah'] },
          ],
        }),
        'content',
      )
      const name = page.texts.find((t) => t.text === 'Ps Saju Wigan')!
      const next = page.texts.find((t) => t.text === 'Worship Set')!
      const lines = page.texts.filter((t) => t.size === 10.5 && t.x === name.x && t.y > name.y && t.y < next.y)
      expect(lines.length).toBeGreaterThan(1)
      expect(lines.map((t) => t.text).join(' ')).toBe(`Note: ${long}`)
      const pill = page.rects
        .filter((r) => name.x >= r.x && name.x <= r.x + r.w && name.y >= r.y && name.y <= r.y + r.h)
        .sort((a, b) => a.w * a.h - b.w * b.h)[0]
      for (const line of lines) {
        expect(line.x + textWidth(line.text, line.size, false)).toBeLessThanOrEqual(pill.x + pill.w - 8)
        expect(line.y).toBeLessThan(pill.y + pill.h - 2)
      }
      expect(next.y).toBeGreaterThan(pill.y + pill.h)
    })

    for (const theme of ['dark', 'light'] as const) {
      it(`reads against its pill on each of the three lists, in ${theme}`, () => {
        const three = sheet({
          sessions: [{ time: '09:30 AM', minutes: 40, name: 'Message', leads: [{ name: 'A One', note: 'lead note' }], substitutes: [{ name: 'B Two', note: 'sub note' }], translators: [{ name: 'C Three', note: 'tr note' }] }],
        })
        const page = serviceSheetPage(three, 'content', theme)
        for (const text of ['Note: lead note', 'Note: sub note', 'Note: tr note']) {
          const t = page.texts.find((x) => x.text === text)!
          const pill = page.rects
            .filter((r) => t.x >= r.x && t.x <= r.x + r.w && t.y >= r.y && t.y <= r.y + r.h)
            .sort((a, b) => a.w * a.h - b.w * b.h)[0]
          expect(contrastRatio(t.color!, pill.color!)).toBeGreaterThanOrEqual(4.5)
        }
      })
    }
  })

  describe('a session’s note (0316)', () => {
    const NOTE = 'Communion follows. Elements on the table by 10:40.'
    const noted = sheet({
      sessions: [
        { time: '09:30 AM', minutes: 40, name: 'Message', leads: ['Ama Serwaa'], substitutes: ['Kofi Asante'], translators: ['Ps Saju Wigan'], note: NOTE },
        { time: '10:10 AM', minutes: 25, name: 'Worship Set', leads: ['Grace Mensah'] },
      ],
    })

    it('is on the sheet under a NOTE label, once, only where there is one', () => {
      const said = words(serviceSheetPage(noted))
      expect(said.filter((t) => t === 'NOTE')).toHaveLength(1)
      expect(said).toContain(NOTE)
      expect(words(serviceSheetPage(sheet()))).not.toContain('NOTE')
      // One that is only space is no note.
      const blank = sheet({ sessions: [{ time: '09:30 AM', minutes: 5, name: 'Welcome', leads: [], note: '   ' }] })
      expect(words(serviceSheetPage(blank))).not.toContain('NOTE')
    })

    it('comes last in its session, and the next session starts under it', () => {
      const page = serviceSheetPage(noted, 'content')
      const y = (text: string) => page.texts.find((t) => t.text === text)!.y
      expect(y('Ps Saju Wigan')).toBeLessThan(y('NOTE'))
      expect(y('NOTE')).toBeLessThan(y(NOTE))
      expect(y(NOTE)).toBeLessThan(y('Worship Set'))
    })

    it('wraps a long one inside its row, every word of it, and makes the row hold it', () => {
      const long = 'The choir comes up during the last song of worship and stays on the stage through communion, so the band leaves the centre clear and the second microphone stays live for the reading that follows.'
      const sessions = (note: string) => [
        { time: '09:30 AM', minutes: 40, name: 'Message', leads: ['Ama Serwaa'], note },
        { time: '10:10 AM', minutes: 25, name: 'Worship Set', leads: ['Grace Mensah'] },
      ]
      const short = serviceSheetPage(sheet({ sessions: sessions('Short.') }), 'content')
      const page = serviceSheetPage(sheet({ sessions: sessions(long) }), 'content')
      const label = page.texts.find((t) => t.text === 'NOTE')!
      const next = page.texts.find((t) => t.text === 'Worship Set')!
      const lines = page.texts.filter((t) => t.y > label.y && t.y < next.y && t.x === label.x && t.size === 12.5)
      expect(lines.length).toBeGreaterThan(1)
      expect(lines.map((t) => t.text).join(' ')).toBe(long)
      // Inside the session's own card, both sides and the bottom.
      const card = page.rects.filter((r) => r.x <= label.x && label.x <= r.x + r.w && r.y <= label.y && label.y <= r.y + r.h).sort((a, b) => a.w * a.h - b.w * b.h)[0]
      for (const line of lines) {
        expect(line.x + textWidth(line.text, line.size, false)).toBeLessThanOrEqual(card.x + card.w - 20 + 0.01)
        expect(line.y).toBeLessThan(card.y + card.h - 10)
      }
      const yOf = (p: ReturnType<typeof serviceSheetPage>) => p.texts.find((t) => t.text === 'Worship Set')!.y
      expect(yOf(page)).toBeGreaterThan(yOf(short))
      expect(page.height).toBeGreaterThan(short.height)
    })

    for (const theme of ['dark', 'light'] as const) {
      it(`reads against its card, label and words, in ${theme}`, () => {
        const page = serviceSheetPage(noted, 'content', theme)
        const textAt = (text: string) => page.texts.find((t) => t.text === text)!
        const under = (text: string) => {
          const t = textAt(text)
          return page.rects
            .filter((r) => t.x >= r.x && t.x <= r.x + r.w && t.y >= r.y && t.y <= r.y + r.h)
            .sort((a, b) => a.w * a.h - b.w * b.h)[0]
        }
        expect(contrastRatio(textAt('NOTE').color!, under('NOTE').color!)).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(textAt(NOTE).color!, under(NOTE).color!)).toBeGreaterThanOrEqual(4.5)
        // Its own colour: not the substitute's amber nor the translator's indigo.
        expect(textAt('NOTE').color).not.toBe(textAt('SUBSTITUTE').color)
        expect(textAt('NOTE').color).not.toBe(textAt('TRANSLATOR').color)
      })
    }
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
            leads: ['Someone'],
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
          leads: ['Rohit Kochikkat Francis'],
        },
        { time: '12:28 PM', minutes: 60, name: 'Worship 3', leads: ['Blessy Jijin'] },
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
        sheet({ sessions: long.sessions.map((x) => ({ ...x, name: 'Short', leads: ['A B'] })) }),
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
      const cards = page.rects.filter((r) => r.radius === 16)
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
        leads: ['Somebody With A Long Name'],
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

    it('writes the time and the duration in ink that carries on paper', () => {
      // They had the sheet's quietest greys, which is right on black and
      // nearly invisible on white.
      const light = serviceSheetPage(sheet(), 'content', 'light')
      const inkOf = (text: string) => light.texts.find((t) => t.text === text)!.color
      expect(inkOf('09:35')).toBe('#1c1c1e')
      expect(inkOf('5 MIN')).toBe('#3a3a3c')
    })

    it('keeps the same pair legible the other way up', () => {
      const dark = serviceSheetPage(sheet(), 'content', 'dark')
      const inkOf = (text: string) => dark.texts.find((t) => t.text === text)!.color
      expect(inkOf('09:35')).toBe('#f5f5f7')
      expect(inkOf('5 MIN')).toBe('#c7c7cc')
    })

    it('keeps the unassigned pill readable on paper', () => {
      // The gap is the thing a planner is scanning for, so it is the last
      // thing that should be pale. Asserted as a ratio rather than a hex:
      // the colour may be tuned, the legibility may not.
      const light = serviceSheetPage(sheet(), 'content', 'light')
      const warned = light.texts.find((t) => t.text === 'Nobody assigned')!
      const pill = light.rects.find((r) => r.color === '#fdf1de')!
      expect(contrastRatio(warned.color!, pill.color!)).toBeGreaterThanOrEqual(4.5)
    })
  })

  /*
   * Every word on the sheet, against whatever it is actually sitting on.
   *
   * The sheet is drawn as coordinates and colours rather than as a page a
   * browser could be asked about, so "is that grey readable" would
   * otherwise be answered by somebody looking at their own screen, in
   * their own light, and being sure. This measures it: the ground under
   * each piece of text is the last thing painted beneath it — a circle
   * first, since those are drawn over the rectangles, then the topmost
   * rectangle containing it, then the page itself.
   */
  describe.each(['dark', 'light'] as const)('%s: everything is legible', (theme) => {
    const page = serviceSheetPage(
      sheet({
        sessions: [
          { time: '09:30 AM', minutes: 5, name: 'Welcome & Notices', leads: ['Ama Serwaa'] },
          { time: '09:35 AM', minutes: 25, name: 'Worship Set', leads: [] },
        ],
      }),
      'content',
      theme,
    )

    /** What this text is painted on. */
    const groundUnder = (t: (typeof page.texts)[number]) => {
      // A baseline sits at the bottom of the glyphs; the middle of the
      // line is what is actually behind them.
      const x = t.x + 1
      const y = t.y - t.size * 0.35
      const circle = (page.circles ?? []).find(
        (c) => (c.cx - x) ** 2 + (c.cy - y) ** 2 <= c.r ** 2,
      )
      if (circle?.color) return circle.color
      const covering = page.rects.filter(
        (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h,
      )
      return covering[covering.length - 1]?.color ?? page.background ?? '#ffffff'
    }

    it('clears the contrast floor for every piece of text on it', () => {
      const failures = page.texts
        .map((t) => ({
          text: t.text,
          ratio: contrastRatio(t.color ?? '#000000', groundUnder(t)),
          floor: contrastFloor({ size: t.size, bold: t.bold }),
          on: groundUnder(t),
          ink: t.color,
        }))
        .filter((row) => row.ratio < row.floor)
        .map((row) => `"${row.text}" ${row.ink} on ${row.on} — ${row.ratio.toFixed(2)}:1 (needs ${row.floor})`)

      expect(failures).toEqual([])
    })
  })
})

describe('a session several people are taking', () => {
  const sessionsOf = (leads: string[]) => [{ time: '09:30 AM', minutes: 5, name: 'Communion', leads }]

  it('prints every name, not just the first', () => {
    const page = serviceSheetPage(
      sheet({ sessions: sessionsOf(['Ama Serwaa', 'Tunde Alabi', 'Pastor Sam Varghese']) }),
      'content',
    )
    const said = page.texts.map((t) => t.text).join(' ')
    for (const name of ['Ama Serwaa', 'Tunde Alabi', 'Pastor Sam Varghese']) {
      expect(said).toContain(name)
    }
  })

  it('gives each of them their own pill and their own disc', () => {
    const page = serviceSheetPage(sheet({ sessions: sessionsOf(['Ama Serwaa', 'Tunde Alabi']) }), 'content')
    // The discs are the only circles big enough to hold initials; the
    // rail's dots are far smaller.
    expect((page.circles ?? []).filter((c) => c.r > 8)).toHaveLength(2)
    expect(page.texts.filter((t) => t.text === 'AS' || t.text === 'TA')).toHaveLength(2)
  })

  it('grows the row rather than overlapping the next when the names do not fit across', () => {
    const many = sheet({
      sessions: sessionsOf([
        'Ama Serwaa',
        'Tunde Alabi',
        'Samuel Boateng',
        'Pastor Sam Varghese',
        'Blessy Jijin',
        'Rohit Kochikkat Francis',
      ]),
    })
    const one = serviceSheetPage(sheet({ sessions: sessionsOf(['Ama Serwaa']) }), 'content')
    const page = serviceSheetPage(many, 'content')
    expect(page.height).toBeGreaterThan(one.height)

    // Nothing it drew has been pushed off the card it belongs to.
    const card = page.rects.filter((r) => r.radius === 16)[0]
    const pills = page.rects.filter(
      (r) => r !== card && r.x > card.x && r.y >= card.y && r.y < card.y + card.h,
    )
    expect(pills.length).toBe(6)
    for (const pill of pills) {
      expect(pill.y + pill.h).toBeLessThanOrEqual(card.y + card.h + 0.01)
      expect(pill.x + pill.w).toBeLessThanOrEqual(card.x + card.w + 0.01)
    }
  })

  it('still says so when nobody is on it at all', () => {
    const page = serviceSheetPage(sheet({ sessions: sessionsOf([]) }), 'content')
    expect(page.texts.map((t) => t.text)).toContain('Nobody assigned')
  })
})

describe('the pill that names who is leading', () => {
  /**
   * The disc, and the pill it sits in, for the first session on a sheet.
   *
   * The pill is the smallest box the disc is inside: the card behind it
   * and the page behind that both contain it too, and either of those
   * would make this measure something other than what it is about.
   */
  function firstPill(page: ReturnType<typeof serviceSheetPage>) {
    const disc = page.circles?.find((c) => c.r > 8)
    const pill = page.rects
      .filter(
        (r) =>
          disc &&
          r.x <= disc.cx &&
          r.x + r.w >= disc.cx &&
          r.y <= disc.cy &&
          r.y + r.h >= disc.cy,
      )
      .sort((a, b) => a.w * a.h - b.w * b.h)[0]
    return { disc, pill }
  }

  /*
   * The reported fault: the initials disc carried the text's padding —
   * twelve — while standing four from the top and four from the bottom,
   * so it floated in from the rounded end of its pill with a gap in front
   * of it. Even on all three sides is the only thing that reads as
   * deliberate, and it is what the app's own AssigneePill does.
   */
  it('insets the disc from the left by what it insets it from the top', () => {
    const page = serviceSheetPage(sheet())
    const { disc, pill } = firstPill(page)
    expect(disc).toBeDefined()
    expect(pill).toBeDefined()
    if (!disc || !pill) return

    const left = disc.cx - disc.r - pill.x
    const top = disc.cy - disc.r - pill.y
    const bottom = pill.y + pill.h - (disc.cy + disc.r)

    expect(top).toBeCloseTo(bottom, 5)
    expect(left).toBeCloseTo(top, 5)
  })

  it('still leaves the name room to breathe on the right', () => {
    // The disc moving left must not drag the words against the edge: the
    // text keeps its own padding at the far end.
    const page = serviceSheetPage(sheet())
    const { disc, pill } = firstPill(page)
    const name = page.texts.find((t) => t.text === 'Ama Serwaa')
    expect(name).toBeDefined()
    if (!disc || !pill || !name) return

    expect(name.x).toBeGreaterThan(disc.cx + disc.r)
    expect(pill.x + pill.w - name.x).toBeGreaterThan(textWidth(name.text, name.size, false))
  })
})

