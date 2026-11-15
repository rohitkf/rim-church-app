import { describe, expect, it } from 'vitest'
import { dashboardSections } from './dashboardSections'

const TODAY = '2026-11-15'
const svc = (id: string, date: string) => ({ id, date })
const labels = (live: { id: string; date: string }[], running: string[] = []) =>
  dashboardSections(live, (s) => running.includes(s.id), TODAY).map((section) => [section.label, section.services.map((s) => s.id)])

describe('the headings over the Dashboard’s services', () => {
  it('does not call a service that is on now upcoming', () => {
    expect(labels([svc('mal', TODAY)], ['mal'])).toEqual([['On now', ['mal']]])
  })

  it('says what is still to come today under what is on, and later days after that', () => {
    expect(labels([svc('eng', TODAY), svc('mal', TODAY), svc('next', '2026-11-22')], ['eng'])).toEqual([
      ['On now', ['eng']],
      ['Later today', ['mal']],
      ['Upcoming services', ['next']],
    ])
  })

  it('calls the day’s services today’s before any has started', () => {
    expect(labels([svc('eng', TODAY), svc('mal', TODAY)])).toEqual([['Today’s services', ['eng', 'mal']]])
  })

  it('is all upcoming on a day with no service, as it always was', () => {
    expect(labels([svc('a', '2026-11-22'), svc('b', '2026-11-22')])).toEqual([['Upcoming services', ['a', 'b']]])
  })

  it('still calls a service on now when it is marked not ended past midnight’s date, or dated another day', () => {
    // Whatever its date, a service that is running is on now.
    expect(labels([svc('late', '2026-11-14')], ['late'])).toEqual([['On now', ['late']]])
  })

  it('draws nothing for nothing', () => {
    expect(labels([])).toEqual([])
  })
})
