import { describe, expect, it } from 'vitest'
import { whereAmIWords } from './whereAmI'

/*
 * What the dot under the date says: green only when CLOCK IN would work,
 * red only when the phone is sure it is away, and grey for everything in
 * between — always with a word, never colour alone.
 */
const answered = (answer: Record<string, unknown>) =>
  whereAmIWords({ at: 'answered', checkedAt: 0, answer: { radius_m: 100, needed_m: 50, ...answer } as never })

describe('the at-church dot', () => {
  it('is green, with the distance behind a tap, when CLOCK IN would work', () => {
    expect(answered({ state: 'in', distance_m: 30, accuracy_m: 12 })).toEqual({
      tone: 'green',
      label: 'At church',
      detail: '30 m from church · ± 12 m. CLOCK IN will work here.',
    })
  })

  it('is red only when the phone is sure it is away', () => {
    const words = answered({ state: 'out', distance_m: 2300, accuracy_m: 20 })
    expect(words).toMatchObject({ tone: 'red', label: 'Not at church' })
    expect(words.detail).toContain('2.3 km from church')
    expect(words.detail).toContain('within 100 m')
  })

  it('says it cannot tell yet when the reading is too rough, and what to do', () => {
    const words = answered({ state: 'unsure', distance_m: 90, accuracy_m: 140 })
    expect(words).toMatchObject({ tone: 'grey', label: 'Can’t tell yet' })
    expect(words.detail).toContain('± 50 m')
  })

  it('is grey, saying why, while finding, when blocked, and before the church is set', () => {
    expect(whereAmIWords({ at: 'checking' })).toMatchObject({ tone: 'grey', label: 'Finding you…' })
    expect(whereAmIWords({ at: 'blocked' })).toMatchObject({ tone: 'grey', label: 'Location blocked' })
    expect(answered({ state: 'no_place' })).toMatchObject({ tone: 'grey', label: 'Church location not set' })
  })
})
