import { describe, expect, it } from 'vitest'
import { sectionServices } from './serviceSections'

const svc = (id: string, date: string) => ({ id, date })
const TODAY = '2026-10-04'

describe('the four service sections', () => {
  const services = [
    svc('lastweek', '2026-09-27'),
    svc('morning', TODAY),
    svc('evening', TODAY),
    svc('next-a', '2026-10-11'),
    svc('next-b', '2026-10-11'),
    svc('later', '2026-10-18'),
  ]

  it('puts today’s, the next service day, and the rest in their own sections', () => {
    const s = sectionServices(services, TODAY, () => false)
    expect(s.today.map((x) => x.id)).toEqual(['morning', 'evening'])
    expect(s.next.map((x) => x.id)).toEqual(['next-a', 'next-b'])
    expect(s.upcoming.map((x) => x.id)).toEqual(['later'])
    expect(s.finished.map((x) => x.id)).toEqual(['lastweek'])
  })

  it('moves a service of today to Finished once it is done on the page', () => {
    const s = sectionServices(services, TODAY, (x) => x.id === 'morning')
    expect(s.today.map((x) => x.id)).toEqual(['evening'])
    expect(s.finished.map((x) => x.id)).toEqual(['morning', 'lastweek'])
  })

  it('lists Finished newest day first, each day in its own order', () => {
    const s = sectionServices(services, TODAY, (x) => x.date === TODAY)
    expect(s.finished.map((x) => x.id)).toEqual(['morning', 'evening', 'lastweek'])
  })

  it('takes Next from the days still ahead', () => {
    const s = sectionServices([svc('a', TODAY), svc('b', '2026-10-11')], TODAY, () => false)
    expect(s.today.map((x) => x.id)).toEqual(['a'])
    expect(s.next.map((x) => x.id)).toEqual(['b'])
    expect(s.upcoming).toEqual([])
  })
})
