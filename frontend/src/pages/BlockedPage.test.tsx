import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BlockedPage } from './BlockedPage'

/*
 * The page somebody meets in place of the app when their account is
 * blocked (0279): what has happened, who to speak to, and no way in.
 */

const signOut = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ signOut }) }))

const blocked = { at: '2026-11-11T15:42:00Z' }

describe('the blocked page', () => {
  it('says the account is blocked by an administrator, and to contact an Admin', () => {
    render(<BlockedPage blocked={blocked} email="joel@example.org" checking={false} onRetry={() => {}} />)
    expect(screen.getByRole('alertdialog', { name: 'Your account has been blocked by an administrator' })).toBeInTheDocument()
    expect(screen.getByText(/Please contact a church Admin to resolve this\./)).toBeInTheDocument()
  })

  it('says which account, and when it was blocked', () => {
    render(<BlockedPage blocked={blocked} email="joel@example.org" checking={false} onRetry={() => {}} />)
    expect(screen.getByText('Signed in as').nextElementSibling).toHaveTextContent('joel@example.org')
    expect(screen.getByText('Blocked on').nextElementSibling).toHaveTextContent(/11 Nov|Nov 11/)
  })

  it('leaves the account line out when the session has no address', () => {
    render(<BlockedPage blocked={blocked} email={null} checking={false} onRetry={() => {}} />)
    expect(screen.queryByText('Signed in as')).toBeNull()
    expect(screen.getByText('Blocked on')).toBeInTheDocument()
  })

  it('says nothing of theirs is gone, and that it will open by itself', () => {
    render(<BlockedPage blocked={blocked} email={null} checking={false} onRetry={() => {}} />)
    expect(screen.getByText(/Nothing of yours has been removed\./)).toHaveTextContent(/as soon as the block is lifted/)
  })

  it('asks again when told to, and says it is asking', async () => {
    const retry = vi.fn()
    const { rerender } = render(<BlockedPage blocked={blocked} email={null} checking={false} onRetry={retry} />)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledTimes(1)
    rerender(<BlockedPage blocked={blocked} email={null} checking onRetry={retry} />)
    expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled()
  })

  it('lets a shared phone be signed out of', async () => {
    render(<BlockedPage blocked={blocked} email={null} checking={false} onRetry={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('offers nothing that could be taken for a way in, and no reason', () => {
    render(<BlockedPage blocked={blocked} email="joel@example.org" checking={false} onRetry={() => {}} />)
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Try again', 'Sign out'])
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByText(/reason/i)).toBeNull()
  })
})
