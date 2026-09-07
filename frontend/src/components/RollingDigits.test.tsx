import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { RollingDigits } from './RollingDigits'

/** Where a digit's strip is sitting, in ems down from the top. */
const rows = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('span[style*="translateY"]')].map((strip) =>
    Number(/translateY\(-(\d+)em\)/.exec(strip.style.transform)?.[1] ?? -1),
  )

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => vi.useRealTimers())

describe('RollingDigits', () => {
  it('shows the number it was given', () => {
    const { container } = render(<RollingDigits value="42" />)
    expect(rows(container)).toEqual([4, 2])
  })

  it('draws what is not a digit as itself', () => {
    const { container } = render(<RollingDigits value="01:30" />)
    // Two columns, a colon, two columns — the colon does not roll.
    expect(rows(container)).toEqual([0, 1, 3, 0])
    expect(container.textContent).toContain(':')
  })

  it('rolls forward to the next number', () => {
    const { container, rerender } = render(<RollingDigits value="8" />)
    rerender(<RollingDigits value="9" />)
    // Down the strip by one, which is one step of the wheel.
    expect(rows(container)).toEqual([9])
  })

  /*
   * The property the doubled strip exists for. A seconds column counting
   * 1, 0, 9 would otherwise spin backwards through eight digits to reach
   * the nine, which looks like a mistake being corrected.
   */
  it('goes on turning the same way past nine, rather than spinning back', () => {
    const { container, rerender } = render(<RollingDigits value="9" />)
    rerender(<RollingDigits value="0" />)

    const [row] = rows(container)
    // Row 10 is the second lap's nought: one step further down, not nine
    // steps back up.
    expect(row).toBe(10)
  })

  it('steps back a lap once the roll has landed, so it always has room', () => {
    const { container, rerender } = render(<RollingDigits value="9" />)
    rerender(<RollingDigits value="0" />)
    expect(rows(container)).toEqual([10])

    act(() => void vi.advanceTimersByTime(500))
    // Same nought, first lap, and no animation on the way — nothing to see.
    expect(rows(container)).toEqual([0])
  })

  it('stays put when the number has not changed', () => {
    // A clock re-renders every second; only the column whose digit moved
    // should move. A wheel that turned on every render would never rest.
    const { container, rerender } = render(<RollingDigits value="55" />)
    rerender(<RollingDigits value="55" />)
    expect(rows(container)).toEqual([5, 5])
  })

  it('moves only the column that changed', () => {
    const { container, rerender } = render(<RollingDigits value="59" />)
    rerender(<RollingDigits value="58" />)
    // The tens digit is where it was; the units rolled on by nine, which
    // is one step forward on a wheel that only turns one way.
    expect(rows(container)).toEqual([5, 18])
  })

  it('says nothing to a screen reader, which reads the label instead', () => {
    const { container } = render(<RollingDigits value="07" />)
    // Twenty rows per column is not something anybody should have read out.
    for (const el of container.querySelectorAll('span[style*="translateY"]')) {
      expect(el.closest('[aria-hidden="true"]')).not.toBeNull()
    }
  })
})
