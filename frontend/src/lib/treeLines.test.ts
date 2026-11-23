import { describe, expect, it } from 'vitest'
import { hangLines, joinLines, stemFrom, type Box } from './treeLines'

/*
 * The lines of a family tree, from where its boxes are. Nothing here
 * knows who anybody is: boxes in, SVG path data out.
 */

const box = (x: number, y: number, w = 100, h = 80): Box => ({ x, y, w, h, cx: x + w / 2 })

describe('a couple', () => {
  it('is joined by a line between the two boxes, half way up the shorter', () => {
    expect(joinLines([box(0, 0, 100, 80), box(120, 0, 100, 120)])).toEqual(['M 100 40 H 120'])
  })

  it('has no line when the two wrapped onto different rows', () => {
    expect(joinLines([box(0, 0), box(0, 120)])).toEqual([])
  })

  it('hands its children down from between the two, or from under one alone', () => {
    expect(stemFrom([box(0, 0), box(120, 0)])).toEqual({ x: 110, y: 40 })
    expect(stemFrom([box(0, 0)])).toEqual({ x: 50, y: 80 })
    expect(stemFrom([])).toBeNull()
  })
})

describe('one generation hung from the one above', () => {
  it('is a stem to a bar half way down, and a drop from the bar onto each box', () => {
    const lines = hangLines({ x: 110, y: 40 }, 80, [box(0, 120), box(120, 120)])
    expect(lines).toEqual(['M 110 40 V 100', 'M 50 100 H 170', 'M 50 100 V 120', 'M 170 100 V 120'])
  })

  it('is a bar over them and no stem when nobody is above', () => {
    expect(hangLines(null, 100, [box(0, 120), box(120, 120)])).toEqual(['M 50 110 H 170', 'M 50 110 V 120', 'M 170 110 V 120'])
  })

  it('draws no bar for one box straight under the stem', () => {
    expect(hangLines({ x: 50, y: 80 }, 80, [box(0, 120)])).toEqual(['M 50 80 V 100', 'M 50 100 V 120'])
  })

  it('reaches a second row by a rail down the side, never through the first', () => {
    const lines = hangLines({ x: 110, y: 40 }, 80, [box(0, 120), box(120, 120), box(0, 240)])
    // The rail is left of every box, and joins the first bar to the second.
    expect(lines).toContain('M -9 100 V 220')
    expect(lines).toContain('M -9 220 H 50')
    expect(lines).toContain('M 50 220 V 240')
    // The first bar goes out to the rail.
    expect(lines).toContain('M -9 100 H 170')
  })

  it('puts a second row’s bar under what is over it, not under a taller box further along', () => {
    // Two children on a first row and one under them; beside them, a household with a very tall box.
    const tall = box(300, 120, 100, 300)
    const lines = hangLines({ x: 200, y: 40 }, 80, [box(0, 120), box(120, 120), tall, box(0, 240)])
    // Half way between the first row's bottom (200) and the second row's top (240), where there is room.
    expect(lines).toContain('M -9 220 H 50')
    expect(lines.some((d) => / 3[0-9]{2} H /.test(d))).toBe(false)
  })

  it('makes nothing of nobody', () => {
    expect(hangLines({ x: 0, y: 0 }, 0, [])).toEqual([])
  })
})
