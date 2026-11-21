import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderEmailDialog } from './OrderEmailDialog'
import type { OrderRow } from '../lib/registrations'

/*
 * The office putting a registration's address right. An address that
 * cannot be one is not sent to again, and not saved: it is mended first,
 * and the one that was meant is a press away.
 */
const order = (email: string) =>
  ({
    id: 'o1',
    code: 'CODE0001',
    name: 'Ama Owusu',
    email,
    status: 'confirmed',
    email_sent_at: '2026-11-20T10:00:00Z',
    email_status: 'failed',
    email_status_at: '2026-11-20T10:00:05Z',
    email_status_detail: 'Invalid `to` field.',
    email_changed_at: null,
    changer: null,
    email_before: null,
  }) as unknown as OrderRow

const show = (email: string) => {
  const onSave = vi.fn()
  render(<OrderEmailDialog order={order(email)} busy={false} error={null} onSave={onSave} onClose={vi.fn()} />)
  return { onSave, user: userEvent.setup() }
}

describe('a registration’s email address, put right by the office', () => {
  it('will not send again to an address that cannot be one, and says why', () => {
    show('ama@gmail.con')
    expect(screen.getByRole('alert')).toHaveTextContent('Email addresses do not end in “.con”. Check the end of yours.')
    expect(screen.getByRole('button', { name: 'Send it again' })).toBeDisabled()
  })

  it('offers the address that was meant, and saves that', async () => {
    const { onSave, user } = show('ama@gmail.con')
    await user.click(screen.getByRole('button', { name: 'ama@gmail.com' }))
    expect(screen.getByRole('textbox')).toHaveValue('ama@gmail.com')
    expect(screen.queryByRole('alert')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save and send' }))
    expect(onSave).toHaveBeenCalledWith('ama@gmail.com')
  })

  it('does not save a new address that cannot be one either', async () => {
    const { onSave, user } = show('ama@gmail.com')
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'ama@hotmail.cmo{Enter}')
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('do not end in “.cmo”')
    expect(screen.getByRole('button', { name: 'ama@hotmail.com' })).toBeInTheDocument()
  })

  it('still questions, without refusing, a slip that could be a real address', async () => {
    const { onSave, user } = show('ama@gmail.com')
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'ama@gmial.com')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'ama@gmail.com' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save and send' }))
    expect(onSave).toHaveBeenCalledWith('ama@gmial.com')
  })
})
