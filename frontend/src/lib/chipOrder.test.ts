import { describe, expect, it } from 'vitest'
import { inShownOrder, placeAmong, type Box } from './chipOrder'

const box = (left: number, top: number, width = 100, height = 40): Box => ({ left, top, width, height })
const middle = (b: Box) => ({ x: b.left + b.width / 2, y: b.top + b.height / 2 })

describe('where a dragged chip belongs', () => {
  // Three names on one line, as a laptop draws them.
  const row = [box(0, 0), box(110, 0), box(220, 0)]

  it('stays where it is until it has passed somebody', () => {
    expect(placeAmong(middle(row[0]), row, 0)).toBe(0)
    expect(placeAmong(middle(row[1]), row, 1)).toBe(1)
    expect(placeAmong({ x: 150, y: 20 }, row, 0)).toBe(0)
  })

  it('moves along a line once it is past the middle of its neighbour', () => {
    expect(placeAmong({ x: 161, y: 20 }, row, 0)).toBe(1)
    expect(placeAmong({ x: 300, y: 20 }, row, 0)).toBe(2)
    expect(placeAmong({ x: 40, y: 20 }, row, 2)).toBe(0)
  })

  // The same three in a column, as a phone draws them.
  const column = [box(0, 0, 140), box(0, 50, 90), box(0, 100, 180)]

  it('moves down a column at the middle of the next one, whatever their widths', () => {
    expect(placeAmong({ x: 70, y: 69 }, column, 0)).toBe(0)
    expect(placeAmong({ x: 70, y: 71 }, column, 0)).toBe(1)
    expect(placeAmong({ x: 70, y: 130 }, column, 0)).toBe(2)
    // A narrow one going up past a wide one does not have to reach its middle sideways.
    expect(placeAmong({ x: 45, y: 15 }, column, 1)).toBe(0)
  })

  it('goes to the end when carried down to a line with one name on it', () => {
    const wrapped = [box(0, 0), box(110, 0), box(0, 50)]
    expect(placeAmong({ x: 50, y: 75 }, wrapped, 0)).toBe(2)
    // And the one on the second line, carried up between the first two.
    expect(placeAmong({ x: 100, y: 20 }, wrapped, 2)).toBe(1)
  })

  it('does not move the second of a pair for being lifted', () => {
    // The first is alone on its line only if the lifted one's own place is forgotten.
    const wrapped = [box(0, 0), box(110, 0), box(0, 50)]
    expect(placeAmong(middle(wrapped[1]), wrapped, 1)).toBe(1)
  })
})

describe('putting what is shown in a new order', () => {
  const keyOf = (s: string) => s

  it('reorders the ones shown', () => {
    expect(inShownOrder(['a', 'b', 'c'], ['c', 'a', 'b'], keyOf)).toEqual(['c', 'a', 'b'])
  })

  it('leaves one that is held but not shown where it was', () => {
    expect(inShownOrder(['a', 'gone', 'b', 'c'], ['c', 'b', 'a'], keyOf)).toEqual(['c', 'gone', 'b', 'a'])
  })
})
