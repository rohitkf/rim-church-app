import { describe, expect, it } from 'vitest'
import { dockWindow } from './dockWindow'

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
