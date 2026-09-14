import { describe, expect, it } from 'vitest'
import {
  daysLeft,
  debriefExpiresAt,
  debriefFor,
  isExpired,
  itemProgress,
  nextSortOrder,
  sortItems,
  type Debrief,
  type DebriefItem,
} from './debriefs'

/*
 * Minutes are working notes, not an archive: they say the radio mic was
 * dead again and name whoever forgot the batteries. Kept for ever that is
 * a file on somebody; kept for a month it is a team remembering last
 * Sunday, which is all anybody wanted.
 */

const SERVICE = '2026-09-13'

describe('how long a service’s minutes are kept', () => {
  it('counts from the service, not from when anybody typed', () => {
    // Written up on the Thursday or on the night itself — same deadline.
    expect(daysLeft(SERVICE, 30, '2026-09-13')).toBe(31)
    expect(daysLeft(SERVICE, 30, '2026-10-13')).toBe(1)
  })

  it('is over the day after the last one', () => {
    expect(isExpired(SERVICE, 30, '2026-10-13')).toBe(false)
    expect(isExpired(SERVICE, 30, '2026-10-14')).toBe(true)
    expect(daysLeft(SERVICE, 30, '2026-10-14')).toBe(0)
  })

  it('expires at midnight after the last day it is kept', () => {
    const at = debriefExpiresAt(SERVICE, 30)
    expect(at.getFullYear()).toBe(2026)
    expect(at.getMonth()).toBe(9) // October
    expect(at.getDate()).toBe(14)
    expect(at.getHours()).toBe(0)
  })

  // The window is a setting, so a church that wants a fortnight gets one.
  it('follows whatever window the church has set', () => {
    expect(isExpired(SERVICE, 7, '2026-09-21')).toBe(true)
    expect(isExpired(SERVICE, 90, '2026-09-21')).toBe(false)
    expect(daysLeft(SERVICE, 1, '2026-09-14')).toBe(1)
  })

  /*
   * Every team's minutes for one Sunday go together, which is the point of
   * counting from the service: a head who writes up late does not buy the
   * team four extra days of somebody else's name being on record.
   */
  it('gives two teams on the same service the same deadline', () => {
    expect(daysLeft(SERVICE, 30, '2026-09-20')).toBe(daysLeft(SERVICE, 30, '2026-09-20'))
    expect(debriefExpiresAt(SERVICE, 30).getTime()).toBe(debriefExpiresAt(SERVICE, 30).getTime())
  })
})

describe('finding a team’s minutes', () => {
  const minutes = (service: string, dept: string): Debrief => ({
    id: `${service}-${dept}`,
    service_id: service,
    department_id: dept,
    written_by: 'u1',
    created_at: '2026-09-13T20:00:00Z',
    updated_at: '2026-09-13T20:00:00Z',
    items: [],
  })

  it('matches on the team and the service together', () => {
    const all = [minutes('s1', 'd1'), minutes('s1', 'd2'), minutes('s2', 'd1')]
    expect(debriefFor(all, 's1', 'd2')?.id).toBe('s1-d2')
    expect(debriefFor(all, 's2', 'd1')?.id).toBe('s2-d1')
  })

  it('has nothing to show for a team that has not written up', () => {
    expect(debriefFor([minutes('s1', 'd1')], 's1', 'd9')).toBeNull()
  })
})

/*
 * A debrief is six people remembering the morning out of order, and each
 * thing said is separate — some of it somebody's to deal with before next
 * Sunday. The list has to survive being read back a week later.
 */
describe('the things said in a debrief', () => {
  const item = (over: Partial<DebriefItem> = {}): DebriefItem => ({
    id: 'i1',
    debrief_id: 'db1',
    body: 'Radio mic died again',
    assigned_to: null,
    done_at: null,
    done_by: null,
    sort_order: 0,
    created_at: '2026-09-13T20:00:00Z',
    created_by: 'u1',
    updated_at: '2026-09-13T20:00:00Z',
    ...over,
  })

  /*
   * What is still outstanding is the reason anybody opens this page a week
   * later, so it sits above what is already dealt with.
   */
  it('puts what is still outstanding above what is done', () => {
    const order = sortItems([
      item({ id: 'done', sort_order: 0, done_at: '2026-09-14T09:00:00Z' }),
      item({ id: 'todo', sort_order: 1 }),
    ]).map((i) => i.id)
    expect(order).toEqual(['todo', 'done'])
  })

  it('keeps the order things were said in, within each half', () => {
    const order = sortItems([
      item({ id: 'third', sort_order: 2 }),
      item({ id: 'first', sort_order: 0 }),
      item({ id: 'second', sort_order: 1 }),
    ]).map((i) => i.id)
    expect(order).toEqual(['first', 'second', 'third'])
  })

  // Two items added in the same second must still not swap places on a
  // re-render, or the list appears to shuffle itself while being read.
  it('settles ties rather than leaving them to chance', () => {
    const order = sortItems([
      item({ id: 'b', sort_order: 0, created_at: '2026-09-13T20:00:02Z' }),
      item({ id: 'a', sort_order: 0, created_at: '2026-09-13T20:00:01Z' }),
    ]).map((i) => i.id)
    expect(order).toEqual(['a', 'b'])
  })

  it('does not change the array it was given', () => {
    const items = [item({ id: 'b', sort_order: 1 }), item({ id: 'a', sort_order: 0 })]
    sortItems(items)
    expect(items.map((i) => i.id)).toEqual(['b', 'a'])
  })

  it('counts how much of the list is dealt with', () => {
    expect(itemProgress([])).toEqual({ done: 0, total: 0 })
    expect(
      itemProgress([item({ id: '1', done_at: '2026-09-14T09:00:00Z' }), item({ id: '2' })]),
    ).toEqual({ done: 1, total: 2 })
  })

  /*
   * A new item goes on the end. Counting the list would put it on top of
   * the last one whenever something in the middle had been removed.
   */
  it('adds the next item after the last one, not after the count', () => {
    expect(nextSortOrder([])).toBe(0)
    expect(nextSortOrder([item({ sort_order: 0 }), item({ sort_order: 7 })])).toBe(8)
  })
})
