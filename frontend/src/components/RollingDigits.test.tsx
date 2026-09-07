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

  /*
   * The first version of this hid its overflow on the column itself and
   * shaded the window's edges towards --color-background. Both were
   * wrong on a tile that is not the page background: the shading drew a
   * grey box around every digit, and an inline-block that clips takes
   * its baseline from its bottom edge, which lifted the digits off the
   * line — visibly so beside the "d" of "5d".
   */
  it('takes its baseline from a digit rather than from the edge of a clipped box', () => {
    const { container } = render(<RollingDigits value="7" />)

    const column = container.querySelector('span[style*="translateY"]')?.closest('span.relative')
    expect(column).not.toBeNull()
    // Nothing clips on the column, so it keeps an ordinary text baseline.
    expect(column).not.toHaveClass('overflow-hidden')
    // A hidden nought sits in it, which is what sets that baseline and
    // sizes the column to whatever face and size it landed in.
    expect(column?.querySelector('.invisible')?.textContent).toBe('0')
  })

  it('paints nothing over the digits', () => {
    const { container } = render(<RollingDigits value="7" />)
    // A face drawn in --color-background is only invisible where the
    // clock happens to sit on the page background. It never did.
    for (const el of container.querySelectorAll('span')) {
      expect(el.className).not.toMatch(/bg-/)
    }
  })

  it('says nothing to a screen reader, which reads the label instead', () => {
    const { container } = render(<RollingDigits value="07" />)
    // Twenty rows per column is not something anybody should have read out.
    for (const el of container.querySelectorAll('span[style*="translateY"]')) {
      expect(el.closest('[aria-hidden="true"]')).not.toBeNull()
    }
  })
})
