import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { StageCanvas } from './StageCanvas'
import type { StageBlock } from '../lib/stage'

/*
 * The canvas, driven with pointer events the way a finger or a mouse
 * would. jsdom has no layout, so positions are read off the styles the
 * canvas writes rather than measured.
 */

const block = (over: Partial<StageBlock> = {}): StageBlock => ({
  id: 'b1', layout_id: 'l', label: 'Keyboard', person_id: null, color: '#0A84FF',
  x: 100, y: 100, w: 160, h: 100, rotation: 0, z: 1,
  placed_by: 'u', placed_at: '2026-10-17T10:00:00Z', updated_by: 'u', updated_at: '2026-10-17T10:00:00Z',
  person: null, placer: { id: 'u', first_name: 'Rohit', last_name: 'K' }, updater: null,
  ...over,
})

const stage = { width: 1200, height: 700 }

function draw(over: Partial<Parameters<typeof StageCanvas>[0]> = {}) {
  const onCommit = vi.fn()
  const onSelect = vi.fn()
  render(
    <StageCanvas stage={stage} blocks={[block()]} selectedId={null} onSelect={onSelect} canEdit onCommit={onCommit} {...over} />,
  )
  return { onCommit, onSelect }
}

// jsdom's elements have no pointer capture.
beforeAll(() => {
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
})

describe('the stage canvas', () => {
  it('draws each block where it is, with its name and its person', () => {
    draw({ blocks: [block({ person: { id: 'p', first_name: 'Jolsna', last_name: 'R' } })] })
    const el = screen.getByRole('button', { name: 'Keyboard, Jolsna R' })
    expect(el.style.left).toBe('100px')
    expect(el.style.top).toBe('100px')
  })

  it('selects a block on a tap, and clears on a tap of empty stage', () => {
    const { onSelect } = draw()
    const el = screen.getByRole('button', { name: 'Keyboard' })
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 50, clientY: 50 })
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 50, clientY: 50 })
    expect(onSelect).toHaveBeenLastCalledWith('b1')
    const app = screen.getByRole('application', { name: 'Stage' })
    fireEvent.pointerDown(app, { pointerId: 2, clientX: 5, clientY: 5 })
    fireEvent.pointerUp(app, { pointerId: 2, clientX: 5, clientY: 5 })
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })

  it('commits a drag once, where the finger lifted, snapped to the grid', () => {
    const { onCommit } = draw()
    const el = screen.getByRole('button', { name: 'Keyboard' })
    // The canvas opens at 50% in a box with no size, so 60 screen px is 120 stage px.
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 130, clientY: 100 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 160, clientY: 100 })
    expect(onCommit).not.toHaveBeenCalled()
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 160, clientY: 100 })
    expect(onCommit).toHaveBeenCalledTimes(1)
    const [id, box] = onCommit.mock.calls[0]
    expect(id).toBe('b1')
    expect(box.x).toBe(220)
    expect(box.y).toBe(100)
    expect(box.x % 10).toBe(0)
  })

  it('does not move anything for somebody who may only look', () => {
    const { onCommit, onSelect } = draw({ canEdit: false })
    const el = screen.getByRole('button', { name: 'Keyboard' })
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 200, clientY: 100 })
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 200, clientY: 100 })
    expect(onCommit).not.toHaveBeenCalled()
    expect(onSelect).toHaveBeenCalledWith('b1')
  })

  it('resizes from the corner of the selected block', () => {
    const { onCommit } = draw({ selectedId: 'b1' })
    const handle = screen.getByRole('button', { name: 'Resize Keyboard' })
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 150, clientY: 125 })
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 150, clientY: 125 })
    expect(onCommit).toHaveBeenCalledWith('b1', { x: 100, y: 100, w: 260, h: 150 })
  })

  it('nudges with the arrow keys and offers Delete', () => {
    const onDelete = vi.fn()
    const { onCommit } = draw({ selectedId: 'b1', onDelete })
    const app = screen.getByRole('application', { name: 'Stage' })
    fireEvent.keyDown(app, { key: 'ArrowRight' })
    expect(onCommit).toHaveBeenCalledWith('b1', { x: 110, y: 100, w: 160, h: 100 })
    fireEvent.keyDown(app, { key: 'ArrowUp', shiftKey: true })
    expect(onCommit).toHaveBeenLastCalledWith('b1', { x: 100, y: 50, w: 160, h: 100 })
    fireEvent.keyDown(app, { key: 'Delete' })
    expect(onDelete).toHaveBeenCalledWith('b1')
  })

  it('zooms with the buttons and says how far', () => {
    draw()
    expect(screen.getByRole('button', { name: 'Fit the whole stage' })).toHaveTextContent('50%')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByRole('button', { name: 'Fit the whole stage' })).toHaveTextContent('63%')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(screen.getByRole('button', { name: 'Fit the whole stage' })).toHaveTextContent('50%')
  })
})
