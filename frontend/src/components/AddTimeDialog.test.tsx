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
    const field = screen.getByLabelText('Minutes to add')
    await user.clear(field)
    await user.type(field, '7')
    await user.click(screen.getByRole('button', { name: 'Add 7 min' }))
    expect(onConfirm).toHaveBeenCalledWith(7, '')
  })

  it('carries who asked, which is what makes it a grant', async () => {
    const { onConfirm, user } = show()
    await user.type(screen.getByPlaceholderText('Pastor asked for ten more'), 'Pastor, for the appeal')
    await user.click(screen.getByRole('button', { name: 'Add 10 min' }))
    expect(onConfirm).toHaveBeenCalledWith(10, 'Pastor, for the appeal')
  })

  it('says how much was already granted, so it is not granted twice over', () => {
    show({ added_minutes: 10 })
    expect(screen.getByText(/10 minutes were already asked for/)).toBeInTheDocument()
  })

  it('will not add nothing', async () => {
    const { onConfirm, user } = show()
    const field = screen.getByLabelText('Minutes to add')
    await user.clear(field)
    await user.type(field, '0')
    expect(screen.getByRole('button', { name: 'Add 0 min' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Add 0 min' }))
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
