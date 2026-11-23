import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { FamilyGraph } from './FamilyGraph'
import { familyGraph } from '../lib/familyGraph'
import type { Family, FamilyMember } from '../lib/families'

/*
 * Moving about in the picture of a family: somebody is dragged to another
 * place with a mouse, their lines go with them, and Reset puts everybody
 * back. What a browser does with it (a pinch, Ctrl and the wheel, where
 * things end up on the screen) is looked at in a real one by /verify:
 * jsdom lays nothing out.
 */

const row = (id: string, account: string | null, kind: 'adult' | 'child', first: string): FamilyMember => ({
  id,
  user_id: account,
  kind,
  first_name: first,
  last_name: 'T',
  gender: null,
})
const annas: Family = { id: 'a', members: [row('a', 'anna', 'adult', 'Anna'), row('t', 'tom', 'adult', 'Tom'), row('k', 'kid', 'child', 'Kid')] }

const show = (onOpen = vi.fn()) => {
  const { container } = render(<FamilyGraph graph={familyGraph([annas])} label="The family" onOpen={onOpen} />)
  const node = (id: string) => container.querySelector<HTMLElement>(`[data-graph-node="${id}"]`)!
  const at = (id: string) => ({ left: parseFloat(node(id).style.left), top: parseFloat(node(id).style.top) })
  /** Where the lines are: each as "x1,y1 x2,y2". */
  const lines = () => [...container.querySelectorAll('[data-graph-edge] line')].map((l) => `${l.getAttribute('x1')},${l.getAttribute('y1')} ${l.getAttribute('x2')},${l.getAttribute('y2')}`)
  /** Press on somebody with a mouse, move by this much, and let go, the way a browser sends it. */
  const drag = (id: string, dx: number, dy: number, pointerType = 'mouse') => {
    const el = node(id)
    const target = el.querySelector('button') ?? el
    fireEvent.pointerDown(target, { pointerType, button: 0, clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(target, { pointerType, clientX: 100 + dx / 2, clientY: 100 + dy / 2, pointerId: 1 })
    fireEvent.pointerMove(target, { pointerType, clientX: 100 + dx, clientY: 100 + dy, pointerId: 1 })
    fireEvent.pointerUp(target, { pointerType, clientX: 100 + dx, clientY: 100 + dy, pointerId: 1 })
    fireEvent.click(target)
  }
  const size = () => within(screen.getByRole('group', { name: 'Size of the picture' }))
  return { onOpen, node, at, lines, drag, size }
}

describe('dragging somebody in the picture of a family', () => {
  it('moves them by as far as the mouse went, and their lines with them', () => {
    const { at, lines, drag } = show()
    const before = at('u:kid')
    const tom = at('u:tom')
    const linesBefore = lines()
    drag('u:kid', 40, -30)
    expect(at('u:kid')).toEqual({ left: before.left + 40, top: before.top - 30 })
    // Nobody else moved; the line to the child ends where the child now is.
    expect(at('u:tom')).toEqual(tom)
    expect(lines()).not.toEqual(linesBefore)
    expect(lines().some((l) => l.endsWith(`${before.left + 40},${before.top - 30 + 28}`))).toBe(true)
  })

  it('does not open their page: the press that ends a drag is not a press on them', () => {
    const { onOpen, drag } = show()
    drag('u:kid', 40, 0)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('still opens their page for a press that went nowhere, or hardly anywhere', () => {
    const { onOpen, at, drag, size } = show()
    const before = at('u:kid')
    drag('u:kid', 2, 2)
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(at('u:kid')).toEqual(before)
    expect(size().queryByRole('button', { name: 'Put everybody back where they were' })).toBeNull()
  })

  it('leaves a finger alone: on a phone a finger on somebody is scrolling', () => {
    const { at, drag, size } = show()
    const before = at('u:kid')
    drag('u:kid', 40, 40, 'touch')
    expect(at('u:kid')).toEqual(before)
    expect(size().queryByRole('button', { name: 'Put everybody back where they were' })).toBeNull()
  })

  it('offers Reset once somebody has moved, and Reset puts everybody back', () => {
    const { at, lines, drag, size } = show()
    const before = { kid: at('u:kid'), anna: at('u:anna') }
    const linesBefore = lines()
    expect(size().queryByRole('button', { name: 'Put everybody back where they were' })).toBeNull()
    drag('u:kid', 40, 30)
    drag('u:anna', -25, 10)
    fireEvent.click(size().getByRole('button', { name: 'Put everybody back where they were' }))
    expect({ kid: at('u:kid'), anna: at('u:anna') }).toEqual(before)
    expect(lines()).toEqual(linesBefore)
    expect(size().queryByRole('button', { name: 'Put everybody back where they were' })).toBeNull()
  })

  it('keeps them inside the picture however far the mouse goes', () => {
    const { at, drag } = show()
    drag('u:kid', -5000, -5000)
    // The middle of their circle is half a circle in from the corner, no nearer.
    expect(at('u:kid')).toEqual({ left: 28, top: 0 })
  })
})
