import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddTimeDialog } from './AddTimeDialog'
import type { RunSession } from '../lib/sessionRunPlan'

const session: RunSession = {
  id: 'b',
  session_name: 'Sermon',
  start_time: '2026-09-06T11:45:00.000Z',
  duration_minutes: 30,
}

function show(overrides: Partial<RunSession> = {}) {
  const onConfirm = vi.fn()
  const onClose = vi.fn()
  render(
    <AddTimeDialog
      session={{ ...session, ...overrides }}
      busy={false}
      onConfirm={onConfirm}
      onClose={onClose}
    />,
  )
  return { onConfirm, onClose, user: userEvent.setup() }
}

describe('AddTimeDialog', () => {
  it('offers ten minutes, which is what gets asked for', async () => {
    const { onConfirm, user } = show()
    await user.click(screen.getByRole('button', { name: 'Add 10 min' }))
    expect(onConfirm).toHaveBeenCalledWith(10, '')
  })

  it('shows what the session will run to before it is agreed', async () => {
    const { user } = show()
    expect(screen.getByText('40m')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '+15 min' }))
    expect(screen.getByText('45m')).toBeInTheDocument()
  })

  it('takes an amount nobody put on a button', async () => {
    const { onConfirm, user } = show()
    // The ruler is the default, but tapping the number still lets you type
    // the odd amount nobody made a button for.
    await user.click(screen.getByRole('button', { name: '10' }))
    const field = screen.getByRole('spinbutton')
    await user.clear(field)
    await user.type(field, '7{Enter}')
    await user.click(screen.getByRole('button', { name: 'Add 7 min' }))
    expect(onConfirm).toHaveBeenCalledWith(7, '')
  })

  it('nudges a minute at a time from the keyboard', async () => {
    const { onConfirm, user } = show()
    const ruler = screen.getByRole('slider', { name: 'Minutes to add' })
    ruler.focus()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(ruler).toHaveAttribute('aria-valuenow', '12')
    await user.click(screen.getByRole('button', { name: 'Add 12 min' }))
    expect(onConfirm).toHaveBeenCalledWith(12, '')
  })

  it('carries who asked, which is what makes it a grant', async () => {
    const { onConfirm, user } = show()
    await user.type(screen.getByPlaceholderText('Pastor asked for ten more'), 'Pastor, for the appeal')
    await user.click(screen.getByRole('button', { name: 'Add 10 min' }))
    expect(onConfirm).toHaveBeenCalledWith(10, 'Pastor, for the appeal')
  })

  it('shows the planned length and what it is running to, not one number', () => {
    show({ added_minutes: 10 })
    // Planned 30, running to 40 — both, because losing the first is the bug
    // this whole shape exists to avoid.
    expect(screen.getByText(/Planned for/)).toBeInTheDocument()
    expect(screen.getByText('30m')).toBeInTheDocument()
    expect(screen.getByText(/10 minutes already asked for/)).toBeInTheDocument()
  })

  it('counts a grant already given into what it will run to', async () => {
    const { user } = show({ added_minutes: 10 })
    // 30 planned + 10 given + 15 more.
    await user.click(screen.getByRole('button', { name: '+15 min' }))
    expect(screen.getByText('55m')).toBeInTheDocument()
  })

  it('will not add nothing — the ruler stops at one minute', async () => {
    const { user } = show()
    const ruler = screen.getByRole('slider', { name: 'Minutes to add' })
    ruler.focus()
    // Home is the far end of the ruler, and the far end is one, not zero:
    // a grant of no time is not a thing anyone means to ask for.
    await user.keyboard('{Home}')
    expect(ruler).toHaveAttribute('aria-valuenow', '1')
    expect(screen.getByRole('button', { name: 'Add 1 min' })).toBeEnabled()

    // Typing zero lands on the same floor rather than arming a dead button.
    await user.click(screen.getByRole('button', { name: '1' }))
    const field = screen.getByRole('spinbutton')
    await user.clear(field)
    await user.type(field, '0{Enter}')
    expect(screen.getByRole('slider', { name: 'Minutes to add' })).toHaveAttribute('aria-valuenow', '1')
  })
})
