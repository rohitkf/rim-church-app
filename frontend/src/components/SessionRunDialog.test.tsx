import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionRunDialog } from './SessionRunDialog'
import type { RunSession } from '../lib/sessionRunPlan'

const session: RunSession = {
  id: 'c',
  session_name: 'Worship 2',
  start_time: '2026-09-06T11:53:00.000Z',
  duration_minutes: 40,
}
const jumped: RunSession[] = [
  { id: 'b', session_name: 'Intercessory', start_time: '2026-09-06T11:45:00.000Z', duration_minutes: 8 },
]

function show(props: Partial<Parameters<typeof SessionRunDialog>[0]> = {}) {
  const onConfirm = vi.fn()
  const onClose = vi.fn()
  render(
    <SessionRunDialog
      action="start"
      session={session}
      jumped={[]}
      at={new Date('2026-09-06T11:47:00.000Z').getTime()}
      busy={false}
      onConfirm={onConfirm}
      onClose={onClose}
      {...props}
    />,
  )
  return { onConfirm, onClose, user: userEvent.setup() }
}

describe('SessionRunDialog', () => {
  it('does nothing until it is confirmed — a stray thumb costs nothing', async () => {
    const { onConfirm, onClose, user } = show()
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('names every session that starting this one would drop', () => {
    show({ jumped })
    expect(screen.getByText(/jumps over one session/i)).toBeInTheDocument()
    expect(screen.getByText('Intercessory')).toBeInTheDocument()
  })

  it('asks nothing when a start drops nothing', () => {
    show()
    expect(screen.queryByPlaceholderText('Ran out of time')).not.toBeInTheDocument()
  })

  it('asks why whenever something is being dropped', async () => {
    const { onConfirm, user } = show({ action: 'skip' })
    await user.type(screen.getByPlaceholderText('Ran out of time'), 'speaker delayed')
    await user.click(screen.getByRole('button', { name: /yes, skip it/i }))
    expect(onConfirm).toHaveBeenCalledWith('speaker delayed')
  })

  it('confirms without a reason rather than blocking mid-service', async () => {
    const { onConfirm, user } = show({ action: 'skip' })
    await user.click(screen.getByRole('button', { name: /yes, skip it/i }))
    expect(onConfirm).toHaveBeenCalledWith('')
  })
})
