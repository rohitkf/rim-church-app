import { describe, expect, it } from 'vitest'
import { translateYOf } from './useDragReorder'

/**
 * The swap rule asks a neighbour where it is settling, not where it is
 * being drawn — and that difference is whatever transform is still in
 * flight on it. Reading it wrong is not a cosmetic bug: it is the list
 * swapping a row back the instant it swaps it forward.
 */
const withTransform = (transform: string) => {
  const el = document.createElement('div')
  el.style.transform = transform
  return el
}

describe('translateYOf', () => {
  it('reads the vertical translation out of a 2d matrix', () => {
    expect(translateYOf(withTransform('matrix(1, 0, 0, 1, 0, -42)'))).toBe(-42)
  })

  it('reads it out of a 3d matrix, where it sits somewhere else entirely', () => {
    const m = 'matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 17, 0, 1)'
    expect(translateYOf(withTransform(m))).toBe(17)
  })

  it('is nought for a row that is not moved', () => {
    expect(translateYOf(withTransform('none'))).toBe(0)
    expect(translateYOf(document.createElement('div'))).toBe(0)
  })

  it('is nought for anything it cannot make sense of', () => {
    // Every browser resolves a computed transform to a matrix, so this is
    // the case that should not arise — and falls back to the old
    // behaviour rather than to a NaN that would move a row to nowhere.
    expect(translateYOf(withTransform('translateY(20px)'))).toBe(0)
  })
})
