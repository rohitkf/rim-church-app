import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { StageCanvas } from './StageCanvas'
import { regionsOf, type StageBlock } from '../lib/stage'

/*
 * The canvas, driven with pointer events the way a finger or a mouse
 * would. jsdom has no layout, so positions are read off the styles the
 * canvas writes rather than measured.
 */

const areas = [
  { id: 'A', name: 'Stage', width: 1200, height: 700, top_label: 'Back of stage', bottom_label: 'Front · congregation', position: 0 },
  { id: 'B', name: 'Audience', width: 1200, height: 900, top_label: 'Stage', bottom_label: 'Back of hall', position: 1 },
]
const regions = regionsOf(areas)

const block = (over: Partial<StageBlock> = {}): StageBlock => ({
  id: 'b1', layout_id: 'l', area_id: 'A', label: 'Keyboard', person_id: null, color: '#0A84FF',
  x: 100, y: 100, w: 160, h: 100, rotation: 0, z: 1, kind: 'block', seats: 0, corners: 'sharp', icon: null, locked_by: null, locked_at: null,
  placed_by: 'u', placed_at: '2026-10-17T10:00:00Z', updated_by: 'u', updated_at: '2026-10-17T10:00:00Z',
  person: null, placer: { id: 'u', first_name: 'Rohit', last_name: 'K' }, updater: null,
  ...over,
})

function draw(over: Partial<Parameters<typeof StageCanvas>[0]> = {}) {
  const onCommit = vi.fn()
  const onSelect = vi.fn()
  render(
    <StageCanvas regions={regions} blocks={[block()]} selectedId={null} onSelect={onSelect} canEdit onCommit={onCommit} {...over} />,
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

  it('draws square corners unless a block is rounded, and an item as its picture with its name', () => {
    draw({
      blocks: [
        block(),
        block({ id: 'b2', label: 'Soft', corners: 'rounded', x: 400 }),
        block({ id: 'b3', label: 'Camera 1', kind: 'item', icon: 'camera', x: 700, color: '#30D158' }),
        block({ id: 'b4', label: 'Mystery', kind: 'item', icon: 'no-such-thing', x: 900 }),
      ],
    })
    expect(screen.getByRole('button', { name: 'Keyboard' }).className).toContain('rounded-none')
    expect(screen.getByRole('button', { name: 'Soft' }).className).toContain('rounded-[14px]')
    const camera = screen.getByRole('button', { name: 'Camera 1' })
    const svg = camera.querySelector('svg[data-icon="camera"]')!
    expect(svg).not.toBeNull()
    expect(svg.getAttribute('stroke')).toBe('#30D158')
    expect(camera.style.background).toBe('')
    expect(camera).toHaveTextContent('Camera 1')
    // An unknown picture falls back to a plain block.
    const mystery = screen.getByRole('button', { name: 'Mystery' })
    expect(mystery.querySelector('svg[data-icon]')).toBeNull()
    expect(mystery.style.background).toContain('linear-gradient')
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
    expect(box).toEqual({ x: 220, y: 100, w: 160, h: 100, area_id: 'A' })
  })

  it('pulls a dragged block onto a neighbour’s edge and shows the guide while it is held', () => {
    const neighbour = block({ id: 'b2', label: 'Drums', x: 400, y: 300 })
    const { onCommit } = draw({ blocks: [block(), neighbour] })
    const el = screen.getByRole('button', { name: 'Keyboard' })
    // 145 screen px at 50% is 290 stage px: x 390, ten short of the drums' left edge, within reach.
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 200, clientY: 100 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 245, clientY: 100 })
    expect(el.style.left).toBe('400px')
    const guide = document.querySelector('[data-guide="x"]') as HTMLElement
    expect(guide).not.toBeNull()
    expect(guide.style.left).toBe('398.5px')
    expect(document.querySelector('[data-guide="y"]')).toBeNull()
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 245, clientY: 100 })
    expect(onCommit).toHaveBeenCalledWith('b1', { x: 400, y: 100, w: 160, h: 100, area_id: 'A' })
    expect(document.querySelector('[data-guide]')).toBeNull()
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
    expect(onCommit).toHaveBeenCalledWith('b1', { x: 100, y: 100, w: 260, h: 150, area_id: 'A' })
  })

  it('nudges with the arrow keys and offers Delete', () => {
    const onDelete = vi.fn()
    const { onCommit } = draw({ selectedId: 'b1', onDelete })
    const app = screen.getByRole('application', { name: 'Stage' })
    fireEvent.keyDown(app, { key: 'ArrowRight' })
    expect(onCommit).toHaveBeenCalledWith('b1', { x: 110, y: 100, w: 160, h: 100, area_id: 'A' })
    fireEvent.keyDown(app, { key: 'ArrowUp', shiftKey: true })
    expect(onCommit).toHaveBeenLastCalledWith('b1', { x: 100, y: 50, w: 160, h: 100, area_id: 'A' })
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

  it('will not drag a block the caller says cannot move, until a move is being proposed', () => {
    const onPropose = vi.fn()
    const locked = block({ locked_by: 'a', locked_at: '2026-10-17T09:00:00Z' })
    const { onCommit } = draw({ blocks: [locked], canMove: () => false, onPropose })
    const el = screen.getByRole('button', { name: 'Keyboard (locked)' })
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 160, clientY: 100 })
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 160, clientY: 100 })
    expect(onCommit).not.toHaveBeenCalled()
    expect(onPropose).not.toHaveBeenCalled()
  })

  it('tells the caller once when a block that cannot move is pulled, not on a plain tap', () => {
    const onRefused = vi.fn()
    const locked = block({ locked_by: 'a', locked_at: '2026-10-17T09:00:00Z' })
    const { onCommit, onSelect } = draw({ blocks: [locked], canMove: () => false, onRefused })
    const el = screen.getByRole('button', { name: 'Keyboard (locked)' })
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 101, clientY: 100 })
    expect(onSelect).toHaveBeenLastCalledWith('b1')
    expect(onRefused).not.toHaveBeenCalled()
    fireEvent.pointerDown(el, { pointerId: 2, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(el, { pointerId: 2, clientX: 130, clientY: 100 })
    fireEvent.pointerMove(el, { pointerId: 2, clientX: 160, clientY: 100 })
    fireEvent.pointerUp(el, { pointerId: 2, clientX: 160, clientY: 100 })
    expect(onRefused).toHaveBeenCalledTimes(1)
    expect(onRefused).toHaveBeenCalledWith('b1')
    expect(onCommit).not.toHaveBeenCalled()
    expect(el.style.left).toBe('100px')
  })

  it('turns a drag into a proposal for the block being proposed', () => {
    const onPropose = vi.fn()
    const locked = block({ locked_by: 'a', locked_at: '2026-10-17T09:00:00Z' })
    const { onCommit } = draw({ blocks: [locked], canMove: () => false, proposing: 'b1', onPropose })
    const el = screen.getByRole('button', { name: 'Keyboard (locked)' })
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 160, clientY: 100 })
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 160, clientY: 100 })
    expect(onCommit).not.toHaveBeenCalled()
    expect(onPropose).toHaveBeenCalledWith('b1', { x: 220, y: 100, w: 160, h: 100, area_id: 'A' })
  })

  it('draws every area as a region of one workspace, and lets a block cross from one to the next', () => {
    const { onCommit } = draw()
    expect(document.querySelectorAll('[data-region]')).toHaveLength(2)
    expect(screen.getByText('Audience')).toBeInTheDocument()
    const el = screen.getByRole('button', { name: 'Keyboard' })
    // The hall starts 760 stage units down (700 + the gap); at 50% that is 380 screen px.
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 100, clientY: 300 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 100, clientY: 500 })
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 100, clientY: 500 })
    const [, box] = onCommit.mock.calls[0]
    expect(box.area_id).toBe('B')
    // 100 + 800 stage units down = 900 in the workspace, which is 140 into the hall.
    expect(box.y).toBe(140)
    expect(box.x).toBe(100)
  })
})
