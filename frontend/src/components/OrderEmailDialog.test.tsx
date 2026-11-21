import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderEmailDialog } from './OrderEmailDialog'
import type { OrderRow } from '../lib/registrations'

/*
 * The office putting a registration's address right. It takes whatever is
 * shaped like an address: for an hour it refused an ending that does not
 * exist (".con"), and the Owner then had registration and Reception left
 * alone for email issues (21 November 2026). A slip that looks like a
 * well-known domain is still asked about, as it always was.
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
  it('refuses no address for its ending, and can send again to the one that is there', () => {
    show('ama@gmail.con')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'Send it again' })).toBeEnabled()
  })

  it('saves a new address as it was typed', async () => {
    const { onSave, user } = show('ama@gmail.com')
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'ama@hotmail.cmo')
    expect(screen.queryByRole('alert')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save and send' }))
    expect(onSave).toHaveBeenCalledWith('ama@hotmail.cmo')
  })

  it('will not save what is not shaped like an address at all', async () => {
    const { onSave, user } = show('ama@gmail.com')
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'ama-at-gmail{Enter}')
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Save and send' })).toBeDisabled()
  })

  it('still questions, without refusing, a slip that looks like a well-known domain', async () => {
    const { onSave, user } = show('ama@gmail.com')
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'ama@gmial.com')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'ama@gmail.com' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save and send' }))
    expect(onSave).toHaveBeenCalledWith('ama@gmial.com')
  })
})
