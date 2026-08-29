import { describe, expect, it } from 'vitest'
import { serviceSheetPage, type ServiceSheet } from './serviceSheet'
import { A4 } from './pdfDoc'

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
})
