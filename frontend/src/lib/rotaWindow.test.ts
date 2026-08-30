import { describe, expect, it } from 'vitest'
import { servicesToShow } from './rotaWindow'

const SERVICES = [
  { id: 'yesterday', date: '2026-08-23', service_type: 'English Service' },
  { id: 'today-en', date: '2026-08-30', service_type: 'English Service' },
  { id: 'today-ml', date: '2026-08-30', service_type: 'Malayalam Service' },
  { id: 'next', date: '2026-09-06', service_type: 'English Service' },
  { id: 'later', date: '2026-09-13', service_type: 'English Service' },
]
const TODAY = '2026-08-30'
const ids = (list: { id: string }[]) => list.map((s) => s.id)

describe('servicesToShow', () => {
  it('leaves the past behind and shows the next few, in order', () => {
    expect(ids(servicesToShow(SERVICES, TODAY, { limit: 3 }))).toEqual([
      'today-en',
      'today-ml',
      'next',
    ])
  })

  it('keeps a service somebody is on, however far past the window', () => {
    // The bug this exists for: a volunteer assigned to 13 September saw only
    // the two services on today, and read that as the app losing them.
    expect(ids(servicesToShow(SERVICES, TODAY, { limit: 2, mine: new Set(['later']) }))).toEqual([
      'today-en',
      'today-ml',
      'later',
    ])
  })

  it('does not list a service twice for being both near and mine', () => {
    expect(ids(servicesToShow(SERVICES, TODAY, { limit: 3, mine: new Set(['next']) }))).toEqual([
      'today-en',
      'today-ml',
      'next',
    ])
  })

  it('never drags back a service that has already gone', () => {
    expect(ids(servicesToShow(SERVICES, TODAY, { limit: 3, mine: new Set(['yesterday']) }))).not.toContain(
      'yesterday',
    )
  })

  it('copes with nothing planned', () => {
    expect(servicesToShow([], TODAY, { limit: 3 })).toEqual([])
    expect(servicesToShow(SERVICES, '2027-01-01', { limit: 3 })).toEqual([])
  })
})
