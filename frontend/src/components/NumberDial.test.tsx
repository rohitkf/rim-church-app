import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NumberDial, NumberDialField } from './NumberDial'

/*
 * The ruler's one job while a finger is on it: say what it is pointing at.
 *
 * It used to say whatever the parent last handed back, which is the same
 * thing only when the parent keeps the number in local state. The service
 * planner writes each change to the database, so the number sat still
 * through the whole drag — the ticks moved and nothing else did.
 */
const PX_PER_STEP = 16

/** Drag the ruler by a number of steps. Left is up, as on a real ruler. */
function drag(steps: number, { release = true } = {}) {
  const track = screen.getByRole('slider')
  fireEvent.pointerDown(track, { button: 0, clientX: 200 })
  fireEvent.pointerMove(window, { clientX: 200 - steps * PX_PER_STEP })
  if (release) fireEvent.pointerUp(window)
}

describe('the ruler picker', () => {
  it('shows the number it is being dragged to, whatever the parent does with it', () => {
    // The parent here is deliberately deaf: it takes the change and hands
    // back the same value, exactly as a page waiting on a round trip does.
    const onChange = vi.fn()
    render(<NumberDial value={15} onChange={onChange} min={0} max={60} label="Minutes" />)

    drag(4, { release: false })

    expect(screen.getByRole('button', { name: '19' })).toBeInTheDocument()
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '19')
  })

  it('reports every step by default, for a parent that can afford it', () => {
    const onChange = vi.fn()
    render(<NumberDial value={10} onChange={onChange} min={0} max={60} label="Minutes" />)

    drag(3)
    expect(onChange).toHaveBeenCalledWith(13)
  })

  it('goes back to the parent’s number once the drag is over', () => {
    // A parent that refuses the change wins in the end: the ruler is a
    // control, not the record.
    render(<NumberDial value={15} onChange={() => {}} min={0} max={60} label="Minutes" />)
    drag(4)
    expect(screen.getByRole('button', { name: '15' })).toBeInTheDocument()
  })

  it('holds the ruler inside its range', () => {
    const onChange = vi.fn()
    render(<NumberDial value={2} onChange={onChange} min={0} max={60} label="Minutes" />)
    drag(-10)
    expect(onChange).toHaveBeenLastCalledWith(0)
  })

  it('still takes a typed number', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<NumberDial value={15} onChange={onChange} min={0} max={60} label="Minutes" />)

    await user.click(screen.getByRole('button', { name: '15' }))
    const field = screen.getByRole('spinbutton', { name: 'Minutes' })
    await user.clear(field)
    await user.type(field, '47')
    fireEvent.blur(field)

    expect(onChange).toHaveBeenCalledWith(47)
  })
})

describe('the ruler in a row, opened from a chip', () => {
  it('writes once when the finger lets go, not on every tick of the drag', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <NumberDialField value={15} onChange={onChange} min={0} max={60} unit="min" label="Length" />,
    )

    await user.click(screen.getByRole('button', { name: 'Length' }))
    drag(5, { release: false })
    // Mid-drag: the chip and the big number both follow, and the database
    // has not been touched.
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '20' })).toBeInTheDocument()

    fireEvent.pointerUp(window)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(20)
  })

  it('keeps the chip showing what was chosen while the ruler is still open', async () => {
    const user = userEvent.setup()
    render(
      <NumberDialField value={15} onChange={() => {}} min={0} max={60} unit="min" label="Length" />,
    )
    await user.click(screen.getByRole('button', { name: 'Length' }))
    drag(3)
    // The parent never accepted it; the chip still says what this ruler
    // was left at, rather than snapping back under the open popover.
    expect(screen.getByRole('button', { name: /18/ })).toBeInTheDocument()
  })
})
