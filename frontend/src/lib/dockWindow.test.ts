import { describe, expect, it } from 'vitest'
import { dockHasMore, dockSlots, dockWindow } from './dockWindow'

/** Twelve destinations and three slots: the app's own shape. */
const app = (active: number) => dockWindow(12, active, 3)

describe('dockWindow', () => {
  it('starts at the beginning, because the first thing is worth seeing', () => {
    expect(app(0)).toEqual([0, 1, 2])
  })

  it('keeps you in the middle once you are past the start', () => {
    expect(app(1)).toEqual([0, 1, 2])
    expect(app(2)).toEqual([1, 2, 3])
    expect(app(5)).toEqual([4, 5, 6])
  })

  it('brings the next destination into view as you walk right', () => {
    // The whole point: standing on the third used to show nothing to the
    // right of it, so the only way onwards was to open a menu.
    const before = app(2)
    const after = app(3)
    expect(after).toEqual([2, 3, 4])
    // One falls off the left, one arrives on the right.
    expect(after[0]).toBe(before[1])
    expect(after).toContain(4)
    expect(after).not.toContain(before[0])
  })

  it('stops at the end rather than wrapping round', () => {
    expect(app(11)).toEqual([9, 10, 11])
    expect(app(10)).toEqual([9, 10, 11])
  })

  it('always holds the destination you are on', () => {
    for (let active = 0; active < 12; active += 1) {
      expect(app(active), `active ${active}`).toContain(active)
    }
  })

  it('never changes size, so the dock does not grow or shrink as you move', () => {
    for (let active = -1; active < 12; active += 1) {
      expect(app(active)).toHaveLength(3)
    }
  })

  it('rests at the start for a page that is not a destination', () => {
    // Settings, a team's own page, an inventory item: nowhere in the list.
    expect(app(-1)).toEqual([0, 1, 2])
  })

  it('shows what there is when there are fewer than the slots', () => {
    expect(dockWindow(2, 1, 3)).toEqual([0, 1])
    expect(dockWindow(1, 0, 3)).toEqual([0])
  })

  it('has nothing to say about nothing', () => {
    expect(dockWindow(0, -1, 3)).toEqual([])
    expect(dockWindow(5, 2, 0)).toEqual([])
  })
})

describe('dockSlots', () => {
  it('gives a phone three, however many destinations there are', () => {
    expect(dockSlots(360, 27)).toBe(3)
    expect(dockSlots(767, 27)).toBe(3)
    expect(dockSlots(412, 2)).toBe(2)
  })

  it('carries everything, with no More, where everything fits', () => {
    expect(dockSlots(1024, 12)).toBe(12)
    expect(dockSlots(1920, 27)).toBe(27)
  })

  /*
   * The bug: past a phone the bar carried every destination at a fixed
   * 44px, and an Owner's two dozen ran off the right of a tablet or a
   * laptop. Whatever it carries now has to fit, with More beside it.
   */
  it('never carries more than the screen has room for', () => {
    for (const width of [768, 820, 1024, 1100, 1280, 1366, 1440]) {
      for (const total of [8, 12, 20, 27, 40]) {
        const slots = dockSlots(width, total)
        const more = slots < total ? 50 : 0
        // One wearing its name (170), the rest icons (50 each), inside the
        // screen's margins and the bar's padding (44).
        const used = 170 + (slots - 1) * 50 + more
        expect(used, `${total} destinations at ${width}px`).toBeLessThanOrEqual(width - 44)
        expect(slots).toBeGreaterThanOrEqual(3)
        expect(slots).toBeLessThanOrEqual(total)
      }
    }
  })

  it('leaves at least one behind More when it cannot carry them all', () => {
    expect(dockSlots(768, 27)).toBe(11)
    expect(dockSlots(1100, 27)).toBe(17)
    expect(dockSlots(1100, 27)).toBeLessThan(27)
  })

  it('makes room for the assistant hanging off the end', () => {
    expect(dockSlots(1100, 27, true)).toBeLessThan(dockSlots(1100, 27))
  })

  /*
   * Measured in the built app at 1100px with the assistant: seventeen on
   * the bar left "Service Planner" 11px short of its own name. The button
   * is 84 wide with its divider and gaps (105), which leaves room for
   * fifteen and More.
   */
  it('counts the assistant at its real width, so the current page keeps its whole name', () => {
    for (const width of [768, 1024, 1100, 1280, 1440]) {
      const slots = dockSlots(width, 27, true)
      const used = 170 + (slots - 1) * 50 + 50 + 105
      expect(used, `at ${width}px`).toBeLessThanOrEqual(width - 44)
    }
    expect(dockSlots(1100, 27, true)).toBe(15)
    expect(dockSlots(768, 27, true)).toBe(8)
  })

  it('has nothing to show when there is nothing', () => {
    expect(dockSlots(1024, 0)).toBe(0)
  })
})

describe('dockHasMore', () => {
  it('is there whenever something is left off the bar', () => {
    expect(dockHasMore(390, 12)).toBe(true)
    expect(dockHasMore(1100, 27, true)).toBe(true)
  })

  it('goes when everything fits', () => {
    expect(dockHasMore(1920, 27, true)).toBe(false)
    expect(dockHasMore(390, 3)).toBe(false)
  })

  it('stays on a phone for the assistant, which lives nowhere else there', () => {
    expect(dockHasMore(390, 3, true)).toBe(true)
    expect(dockHasMore(390, 2, true)).toBe(true)
    // Past a phone the assistant is on the bar itself.
    expect(dockHasMore(1024, 3, true)).toBe(false)
  })
})
