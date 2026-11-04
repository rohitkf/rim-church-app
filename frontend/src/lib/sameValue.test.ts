import { describe, expect, it } from 'vitest'
import { sameValue } from './sameValue'

describe('the same setting', () => {
  it('ignores the order an object’s keys came back in, at any depth', () => {
    // What was written, and what Postgres hands back for it.
    expect(sameValue({ rotaLook: { weekStart: 1, dense: true }, accent: 'blue' }, { accent: 'blue', rotaLook: { dense: true, weekStart: 1 } })).toBe(true)
  })
  it('still sees a real change', () => {
    expect(sameValue({ a: 1 }, { a: 2 })).toBe(false)
    expect(sameValue({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(sameValue([1, 2], [2, 1])).toBe(false)
    expect(sameValue(3, 0)).toBe(false)
    expect(sameValue('', null)).toBe(false)
  })
  it('takes a missing key and an undefined one as the same', () => {
    expect(sameValue({ a: 1, b: undefined }, { a: 1 })).toBe(true)
    expect(sameValue(undefined, null)).toBe(true)
  })
})
