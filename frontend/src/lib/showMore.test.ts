import { describe, expect, it } from 'vitest'
import { FIRST_PAGE, NEXT_PAGE, firstDays, moreWords } from './showMore'

/*
 * A long list, a screen at a time: the first days of a list grouped by
 * day, whole, and how many are still to come.
 */

const days = (...sizes: number[]): [string, string[]][] =>
  sizes.map((n, i) => [`2026-09-${String(13 + i).padStart(2, '0')}`, Array.from({ length: n }, (_, j) => `e${i}.${j}`)])

describe('the first days of a list', () => {
  it('takes whole days until enough entries are in', () => {
    const paged = firstDays(days(3, 4, 5, 6), 6)
    // Three, then four makes seven: enough. The third day is not started.
    expect(paged.shown.map(([d]) => d)).toEqual(['2026-09-13', '2026-09-14'])
    expect(paged.entries).toBe(7)
    expect(paged.left).toBe(11)
    expect(paged.lastDay).toBe('2026-09-14')
  })

  it('never cuts a day in half, however much is on it', () => {
    const paged = firstDays(days(25, 2), 10)
    expect(paged.shown).toHaveLength(1)
    expect(paged.shown[0][1]).toHaveLength(25)
    expect(paged.left).toBe(2)
  })

  it('stops at exactly enough', () => {
    const paged = firstDays(days(5, 5, 5), 10)
    expect(paged.shown).toHaveLength(2)
    expect(paged.entries).toBe(10)
    expect(paged.left).toBe(5)
  })

  it('shows everything there is when there is less than a screen', () => {
    const paged = firstDays(days(2, 1), 10)
    expect(paged.shown).toHaveLength(2)
    expect(paged.left).toBe(0)
    expect(paged.lastDay).toBe('2026-09-14')
  })

  it('is empty for an empty list', () => {
    expect(firstDays([], 10)).toEqual({ shown: [], entries: 0, left: 0, lastDay: null })
  })

  it('keeps the order it was given: newest first stays newest first', () => {
    const newestFirst = days(1, 1, 1).reverse()
    expect(firstDays(newestFirst, 2).shown.map(([d]) => d)).toEqual(['2026-09-15', '2026-09-14'])
  })

  it('does not change the list it was given', () => {
    const all = days(3, 4)
    firstDays(all, 3)
    expect(all).toHaveLength(2)
  })
})

describe('the sizes', () => {
  it('brings more on asking than it showed to begin with: somebody asking has decided to read', () => {
    expect(FIRST_PAGE).toBe(10)
    expect(NEXT_PAGE).toBeGreaterThan(FIRST_PAGE)
  })

  it('says how many are left', () => {
    expect(moreWords(178)).toBe('178 more')
    expect(moreWords(1)).toBe('1 more')
  })
})
