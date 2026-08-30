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
const AT = new Date('2026-09-06T11:47:00.000Z').getTime()

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
      jumpedAt={() => []}
      earliest={null}
      at={AT}
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
    show({ jumpedAt: () => jumped })
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
    expect(onConfirm).toHaveBeenCalledWith('speaker delayed', AT)
  })

  it('confirms without a reason rather than blocking mid-service', async () => {
    const { onConfirm, user } = show({ action: 'skip' })
    await user.click(screen.getByRole('button', { name: /yes, skip it/i }))
    expect(onConfirm).toHaveBeenCalledWith('', AT)
  })
})

describe('correcting when a session actually started', () => {
  it('offers the current minute, and confirms with it untouched', async () => {
    const { onConfirm, user } = show()
    const field = screen.getByLabelText('Time Worship 2 started')
    expect((field as HTMLInputElement).value).toBe(
      `${String(new Date(AT).getHours()).padStart(2, '0')}:${String(new Date(AT).getMinutes()).padStart(2, '0')}`,
    )
    await user.click(screen.getByRole('button', { name: /yes, start it now/i }))
    expect(onConfirm).toHaveBeenCalledWith('', AT)
  })

  it('confirms with a back-dated time when one is typed in', async () => {
    const { onConfirm, user } = show()
    const field = screen.getByLabelText('Time Worship 2 started')
    await user.clear(field)
    await user.type(field, '11:40')
    await user.click(screen.getByRole('button', { name: /yes, start it now/i }))
    const [, at] = onConfirm.mock.calls[0]
    expect(new Date(at).getHours()).toBe(11)
    expect(new Date(at).getMinutes()).toBe(40)
    expect(new Date(at).getDate()).toBe(new Date(AT).getDate())
  })

  it('re-asks which sessions get dropped when the time changes', async () => {
    // At 11:47 nothing is jumped; back-dated to 11:20 an earlier session is.
    const earlier: RunSession[] = [
      { id: 'b', session_name: 'Intercessory', start_time: '2026-09-06T11:45:00.000Z', duration_minutes: 8 },
    ]
    const minutesOfDay = (t: number) => new Date(t).getHours() * 60 + new Date(t).getMinutes()
    const cutoff = minutesOfDay(AT)
    const { user } = show({
      jumpedAt: (at: number) => (minutesOfDay(at) < cutoff ? earlier : []),
    })
    expect(screen.queryByText('Intercessory')).not.toBeInTheDocument()
    await user.clear(screen.getByLabelText('Time Worship 2 started'))
    await user.type(screen.getByLabelText('Time Worship 2 started'), '11:20')
    // The sentence follows the box, not the clock...
    expect(screen.getByText(/11:20/)).toBeInTheDocument()
    // ...and so does the list of what the change would drop.
    expect(screen.getByText('Intercessory')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Ran out of time')).toBeInTheDocument()
  })

  it('has no time picker on a skip', () => {
    show({ action: 'skip' })
    expect(screen.queryByLabelText(/Time .* started/)).not.toBeInTheDocument()
  })
})

describe('a start that could not have happened', () => {
  const PREV = new Date('2026-09-06T11:45:00.000Z').getTime()

  it('refuses a time before the session in front of it began', async () => {
    const { onConfirm, user } = show({ earliest: PREV })
    await user.clear(screen.getByLabelText('Time Worship 2 started'))
    await user.type(screen.getByLabelText('Time Worship 2 started'), '11:30')
    expect(screen.getByText(/cannot have started before/i)).toBeInTheDocument()
    const confirm = screen.getByRole('button', { name: /yes, start it now/i })
    expect(confirm).toBeDisabled()
    await user.click(confirm)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('names nothing as dropped while the time is impossible', async () => {
    // The old behaviour was worse than a wrong number: a time before the
    // previous session's start marked that session as never having happened.
    const prev: RunSession[] = [
      { id: 'b', session_name: 'Intercessory', start_time: '2026-09-06T11:45:00.000Z', duration_minutes: 8 },
    ]
    const { user } = show({ earliest: PREV, jumpedAt: () => prev })
    await user.clear(screen.getByLabelText('Time Worship 2 started'))
    await user.type(screen.getByLabelText('Time Worship 2 started'), '11:30')
    expect(screen.queryByText('Intercessory')).not.toBeInTheDocument()
  })

  it('accepts the moment the previous session started', async () => {
    const { onConfirm, user } = show({ earliest: PREV })
    await user.clear(screen.getByLabelText('Time Worship 2 started'))
    await user.type(screen.getByLabelText('Time Worship 2 started'), '11:45')
    expect(screen.queryByText(/cannot have started before/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /yes, start it now/i }))
    expect(onConfirm).toHaveBeenCalled()
  })
})
