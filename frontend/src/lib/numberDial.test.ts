import { describe, expect, it } from 'vitest'
import { indexOf, isMajor, stepCount, valueAt, visibleTicks } from './numberDial'

describe('indexOf and valueAt', () => {
  it('walks between a value and its place on the ruler', () => {
    expect(indexOf(44, 0, 1)).toBe(44)
    expect(valueAt(44, 0, 100, 1)).toBe(44)
    expect(indexOf(30, 0, 5)).toBe(6)
    expect(valueAt(6, 0, 100, 5)).toBe(30)
  })

  it('snaps a half-dragged position to a real step', () => {
    expect(valueAt(6.4, 0, 100, 5)).toBe(30)
    expect(valueAt(6.6, 0, 100, 5)).toBe(35)
  })

  it('will not hand back a value outside the range', () => {
    expect(valueAt(-3, 1, 10, 1)).toBe(1)
    expect(valueAt(99, 1, 10, 1)).toBe(10)
  })

  it('keeps a fractional step from turning into 0.30000000000000004', () => {
    expect(valueAt(3, 0, 10, 0.1)).toBe(0.3)
    expect(valueAt(7, 0, 10, 0.01)).toBe(0.07)
  })

  it('handles a range that does not start at zero', () => {
    expect(indexOf(2027, 2020, 1)).toBe(7)
    expect(valueAt(7, 2020, 2030, 1)).toBe(2027)
  })
})

describe('stepCount', () => {
  it('counts the steps end to end', () => {
    expect(stepCount(0, 100, 1)).toBe(100)
    expect(stepCount(0, 100, 5)).toBe(20)
    expect(stepCount(5, 5, 1)).toBe(0)
  })
})

describe('visibleTicks', () => {
  it('draws only what fits, plus a margin', () => {
    // 280px wide, 14px a step: ten steps either side of centre.
    expect(visibleTicks(50, 280, 14, 100, 2)).toEqual({ from: 38, to: 62 })
  })

  it('does not run off either end of the ruler', () => {
    expect(visibleTicks(1, 280, 14, 100, 2).from).toBe(0)
    expect(visibleTicks(99, 280, 14, 100, 2).to).toBe(100)
  })

  it('stays cheap on a range no browser should draw whole', () => {
    const { from, to } = visibleTicks(5000, 320, 14, 10080)
    expect(to - from).toBeLessThan(50)
  })
})

describe('isMajor', () => {
  it('numbers every fifth tick by default', () => {
    expect(isMajor(0, 5)).toBe(true)
    expect(isMajor(5, 5)).toBe(true)
    expect(isMajor(7, 5)).toBe(false)
  })

  it('numbers none of them when asked for none', () => {
    expect(isMajor(5, 0)).toBe(false)
  })
})
