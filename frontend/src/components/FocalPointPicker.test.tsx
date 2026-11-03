import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FocalPointPicker } from './FocalPointPicker'

/*
 * The picture's focal point (0248): a tap or a drag puts the dot where the
 * subject is, the sliders do the same for a keyboard, and the preview is
 * the 16:9 crop the event's page will show.
 */

function show(value = { x: 50, y: 50 }) {
  const onChange = vi.fn()
  render(<FocalPointPicker src="https://public/events/x.jpg" value={value} onChange={onChange} />)
  return onChange
}

describe('the focal point picker', () => {
  it('places the dot where the picture is tapped, as a share of its width and height', () => {
    const onChange = show()
    const box = screen.getByRole('img', { name: /tap or drag to move it/ })
    vi.spyOn(box, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 50, width: 400, height: 200, right: 500, bottom: 250, x: 100, y: 50, toJSON: () => ({}) })
    fireEvent.pointerDown(box, { clientX: 200, clientY: 200, pointerId: 1 })
    expect(onChange).toHaveBeenLastCalledWith({ x: 25, y: 75 })
    // Dragging keeps placing it; past the edge it stops at the edge.
    fireEvent.pointerMove(box, { clientX: 700, clientY: 40, pointerId: 1 })
    expect(onChange).toHaveBeenLastCalledWith({ x: 100, y: 0 })
    fireEvent.pointerUp(box, { pointerId: 1 })
    fireEvent.pointerMove(box, { clientX: 300, clientY: 150, pointerId: 1 })
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('moves by the sliders too, and shows the crop as the page will', () => {
    const onChange = show({ x: 20, y: 80 })
    expect(screen.getByRole('slider', { name: 'Left to right' })).toHaveValue('20')
    expect(screen.getByRole('slider', { name: 'Top to bottom' })).toHaveValue('80')
    expect(screen.getByRole('img', { name: /How the picture will show/ })).toHaveStyle({ objectPosition: '20% 80%' })
    fireEvent.change(screen.getByRole('slider', { name: 'Left to right' }), { target: { value: '35' } })
    expect(onChange).toHaveBeenLastCalledWith({ x: 35, y: 80 })
    fireEvent.change(screen.getByRole('slider', { name: 'Top to bottom' }), { target: { value: '10' } })
    expect(onChange).toHaveBeenLastCalledWith({ x: 20, y: 10 })
  })

  it('goes back to the middle on a tap, and offers that only when it is off the middle', async () => {
    const user = userEvent.setup()
    const onChange = show({ x: 20, y: 80 })
    await user.click(screen.getByRole('button', { name: 'Back to the middle' }))
    expect(onChange).toHaveBeenLastCalledWith({ x: 50, y: 50 })
    show()
    expect(screen.getAllByRole('button', { name: 'Back to the middle' })[1]).toBeDisabled()
  })
})
