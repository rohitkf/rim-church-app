import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClosedPage } from './ClosedPage'

/*
 * The page somebody gets in place of the app while it is closed for
 * maintenance (0278): why, until when, and no way in.
 */

const signOut = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ signOut }) }))

const closed = { title: 'App maintenance', body: 'We are moving servers.\nBack tomorrow morning.', from: '2026-11-15T09:00:00Z', until: '2026-11-16T09:00:00Z' }

describe('the closed page', () => {
  it('says what the notice said, and when the app opens again', () => {
    render(<ClosedPage closed={closed} checking={false} onRetry={() => {}} />)
    expect(screen.getByText('Closed for maintenance')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'App maintenance' })).toBeInTheDocument()
    expect(screen.getByText(/We are moving servers\./)).toBeInTheDocument()
    expect(screen.getByText(/The app opens again on/)).toHaveTextContent(/16 Nov|Nov 16/)
  })

  it('asks again when told to, and says it is asking', async () => {
    const retry = vi.fn()
    const { rerender } = render(<ClosedPage closed={closed} checking={false} onRetry={retry} />)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledTimes(1)
    rerender(<ClosedPage closed={closed} checking onRetry={retry} />)
    expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled()
  })

  it('lets a shared phone be signed out of', async () => {
    render(<ClosedPage closed={closed} checking={false} onRetry={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('offers nothing that could be taken for a way in', () => {
    render(<ClosedPage closed={{ ...closed, body: '' }} checking={false} onRetry={() => {}} />)
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Try again', 'Sign out'])
    expect(screen.queryByRole('link')).toBeNull()
  })
})
