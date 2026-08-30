import { describe, expect, it } from 'vitest'
import { servicesToShow, shiftIsoDays } from './rotaWindow'

const SERVICES = [
  { id: 'yesterday', date: '2026-08-23', service_type: 'English Service' },
  { id: 'today-en', date: '2026-08-30', service_type: 'English Service' },
  { id: 'today-ml', date: '2026-08-30', service_type: 'Malayalam Service' },
  { id: 'next', date: '2026-09-06', service_type: 'English Service' },
  { id: 'later', date: '2026-09-13', service_type: 'English Service' },
]
const TODAY = '2026-08-30'
const ids = (list: { id: string }[]) => list.map((s) => s.id)
const finished = (...done: string[]) => (id: string) => done.includes(id)

describe('shiftIsoDays', () => {
  it('walks whole days, over a month end', () => {
    expect(shiftIsoDays('2026-08-30', 7)).toBe('2026-09-06')
    expect(shiftIsoDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftIsoDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('servicesToShow', () => {
  it('leaves the past behind and shows the week ahead, in order', () => {
    // Every service in the next seven days — today's two and next Sunday's,
    // which lands exactly on the horizon — and nothing beyond it.
    expect(ids(servicesToShow(SERVICES, TODAY))).toEqual(['today-en', 'today-ml', 'next'])
  })

  it('is not capped by how many services share a day', () => {
    const busy = [
      { id: 'a', date: TODAY, service_type: 'A' },
      { id: 'b', date: TODAY, service_type: 'B' },
      { id: 'c', date: TODAY, service_type: 'C' },
      { id: 'd', date: TODAY, service_type: 'D' },
      { id: 'next', date: '2026-09-06', service_type: 'English Service' },
    ]
    expect(ids(servicesToShow(busy, TODAY))).toEqual(['a', 'b', 'c', 'd', 'next'])
  })

  it('keeps a finished service on its own day, but stops it holding the window', () => {
    // Both of today's are over, so next Sunday is what is next — and it is
    // already on the page rather than waiting for midnight.
    const shown = servicesToShow(SERVICES, TODAY, { isFinished: finished('today-en', 'today-ml') })
    expect(ids(shown)).toEqual(['today-en', 'today-ml', 'next'])
  })

  it('reaches out to the nearest day when the week ahead is empty', () => {
    const sparse = [
      { id: 'far-a', date: '2026-10-04', service_type: 'A' },
      { id: 'far-b', date: '2026-10-04', service_type: 'B' },
      { id: 'further', date: '2026-10-11', service_type: 'C' },
    ]
    expect(ids(servicesToShow(sparse, TODAY))).toEqual(['far-a', 'far-b'])
  })

  it('keeps a service somebody is on, however far past the window', () => {
    // The bug this exists for: a volunteer assigned to 13 September saw only
    // the services nearer than that, and read it as the app losing them.
    expect(ids(servicesToShow(SERVICES, TODAY, { mine: new Set(['later']) }))).toEqual([
      'today-en',
      'today-ml',
      'next',
      'later',
    ])
  })

  it('does not list a service twice for being both near and mine', () => {
    expect(ids(servicesToShow(SERVICES, TODAY, { mine: new Set(['next']) }))).toEqual([
      'today-en',
      'today-ml',
      'next',
    ])
  })

  it('never drags back a service that has already gone', () => {
    expect(ids(servicesToShow(SERVICES, TODAY, { mine: new Set(['yesterday']) }))).not.toContain(
      'yesterday',
    )
  })

  it('copes with nothing planned', () => {
    expect(servicesToShow([], TODAY)).toEqual([])
    expect(servicesToShow(SERVICES, '2027-01-01')).toEqual([])
  })
})
