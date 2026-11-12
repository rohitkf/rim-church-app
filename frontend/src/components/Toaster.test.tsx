import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toaster } from './Toaster'
import { dismissToast, showToast } from '../lib/toast'

/*
 * Where toasts are drawn. One with something to press (0281) is a button
 * in the same pill: pressing it runs the action once and the toast goes.
 */

const up: number[] = []
const say = (...args: Parameters<typeof showToast>) => {
  let id = 0
  act(() => {
    id = showToast(...args)
  })
  up.push(id)
  return id
}

afterEach(() => {
  act(() => {
    for (const id of up.splice(0)) dismissToast(id)
  })
})

describe('the toaster', () => {
  it('says a plain toast politely, with nothing to press', () => {
    render(<Toaster />)
    say('Saved')
    const region = screen.getByRole('status')
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(within(region).getByText('Saved')).toBeInTheDocument()
    expect(within(region).queryByRole('button')).toBeNull()
  })

  it('draws the action as a button, runs it once, and takes the toast down', async () => {
    const run = vi.fn()
    const user = userEvent.setup()
    render(<Toaster />)
    say('Marked as received', 'success', 10_000, { label: 'Undo', run })
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(run).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Marked as received')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })

  it('keeps one button for each thing that can be taken back', async () => {
    const ama = vi.fn()
    const ben = vi.fn()
    const user = userEvent.setup()
    render(<Toaster />)
    say('Checked in Ama', 'success', 10_000, { label: 'Undo', run: ama })
    say('Checked in Ben', 'success', 10_000, { label: 'Undo', run: ben })
    expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(2)
    // The one beside Ama's line is Ama's.
    await user.click(within(screen.getByText('Checked in Ama').parentElement!).getByRole('button', { name: 'Undo' }))
    expect(ama).toHaveBeenCalledTimes(1)
    expect(ben).not.toHaveBeenCalled()
    expect(screen.getByText('Checked in Ben')).toBeInTheDocument()
  })

  it('shows an error in its own colours', () => {
    render(<Toaster />)
    say('Could not undo that.', 'error', 6000)
    expect(screen.getByText('Could not undo that.').parentElement).toHaveClass('bg-error')
  })
})
