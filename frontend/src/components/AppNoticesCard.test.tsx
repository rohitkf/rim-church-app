import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppNoticesCard } from './AppNoticesCard'
import type { Notice, NoticeDraft } from '../lib/appNotices'

/*
 * Settings › App Notices (0278): writing a line for the top of every
 * page, and, for maintenance, closing the app between two times.
 */

const may = vi.hoisted(() => vi.fn(() => true))
vi.mock('../lib/usePermissions', () => ({ usePermissions: () => ({ can: (cap: string) => cap === 'settings.notices' && may() }) }))

const stored = vi.hoisted(() => vi.fn<() => Notice[]>(() => []))
const saved = vi.hoisted(() => vi.fn<(draft: NoticeDraft, id?: string) => Promise<void>>(() => Promise.resolve()))
const ended = vi.hoisted(() => vi.fn<(notice: Notice) => Promise<void>>(() => Promise.resolve()))
const removed = vi.hoisted(() => vi.fn<(id: string) => Promise<void>>(() => Promise.resolve()))
vi.mock('../lib/appNotices', async (original) => ({
  ...(await original<typeof import('../lib/appNotices')>()),
  fetchNotices: () => Promise.resolve(stored()),
  saveNotice: (draft: NoticeDraft, id?: string) => saved(draft, id),
  endNotice: (notice: Notice) => ended(notice),
  removeNotice: (id: string) => removed(id),
}))
vi.mock('../lib/supabaseClient', () => ({ supabase: {} }))
// useErrorText asks who is reading, to decide how much of a raw error to show.
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isSuperAdmin: true }) }))
// The date-and-time sheets have their own tests; here they are a box to type "YYYY-MM-DDTHH:MM" into.
vi.mock('./DateTimeFields', () => ({
  DateTimeField: ({ value, onChange, label }: { value: string; onChange: (next: string) => void; label: string }) => (
    <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}))

const hour = 3_600_000
const at = (h: number) => new Date(Date.now() + h * hour).toISOString()
const notice = (over: Partial<Notice>): Notice => ({
  id: 'n1',
  kind: 'info',
  title: 'Carol service rehearsal',
  body: '',
  starts_at: at(-1),
  ends_at: null,
  dismissible: true,
  closes_app: false,
  closed_from: null,
  closed_until: null,
  created_at: at(-1),
  updated_at: at(-1),
  ...over,
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <AppNoticesCard />
      </QueryClientProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  may.mockReturnValue(true)
  stored.mockReturnValue([])
  saved.mockClear()
  ended.mockClear()
  removed.mockClear()
})

describe('writing a notice', () => {
  it('tells somebody the room is not theirs, with no form to fail on', () => {
    may.mockReturnValue(false)
    show()
    expect(screen.getByText(/Writing notices for the whole app is not open to you/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('posts a line of information', async () => {
    const user = show()
    await user.type(screen.getByRole('textbox', { name: /Title/ }), 'Carol service rehearsal moved to Friday')
    await user.type(screen.getByRole('textbox', { name: /Message/ }), 'Seven o’clock.')
    await user.click(screen.getByRole('button', { name: 'Post the notice' }))
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1))
    expect(saved.mock.calls[0][0]).toMatchObject({ kind: 'info', title: 'Carol service rehearsal moved to Friday', body: 'Seven o’clock.', closesApp: false, dismissible: true })
    expect(saved.mock.calls[0][1]).toBeUndefined()
  })

  it('will not post one with no title, and says what is missing', async () => {
    const user = show()
    await user.click(screen.getByRole('button', { name: 'Post the notice' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Give it a title.')
    expect(saved).not.toHaveBeenCalled()
  })

  it('offers the door only on maintenance', async () => {
    const user = show()
    expect(screen.queryByRole('checkbox', { name: /Close the app while the work is done/ })).toBeNull()
    await user.click(screen.getByRole('radio', { name: 'Maintenance' }))
    expect(screen.getByRole('checkbox', { name: /Close the app while the work is done/ })).toBeInTheDocument()
    // And a warning cannot be put away, so the box that says it can is not offered.
    expect(screen.queryByRole('checkbox', { name: /People can put it away/ })).toBeNull()
  })

  it('asks once more before closing the app, saying when and who is let in, and closes nothing if the answer is no', async () => {
    const user = show()
    await user.click(screen.getByRole('radio', { name: 'Maintenance' }))
    await user.type(screen.getByRole('textbox', { name: /Title/ }), 'App maintenance')
    await user.click(screen.getByRole('checkbox', { name: /Close the app while the work is done/ }))
    await user.type(screen.getByRole('textbox', { name: 'The app closes' }), '2026-11-15T09:00')
    await user.type(screen.getByRole('textbox', { name: 'The app opens again' }), '2026-11-16T09:00')
    await user.click(screen.getByRole('button', { name: 'Post it and schedule the closure' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Close the app for maintenance?' })
    expect(dialog).toHaveTextContent(/nobody can use the app except you/)
    expect(dialog).toHaveTextContent(/Admins, out of the box/)
    expect(saved).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: /Cancel|Keep|No/ }))
    expect(saved).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Post it and schedule the closure' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Close the app then' }))
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1))
    expect(saved.mock.calls[0][0]).toMatchObject({ kind: 'maintenance', closesApp: true, closedFrom: '2026-11-15T09:00', closedUntil: '2026-11-16T09:00' })
  })

  it('will not schedule a closure with a time missing', async () => {
    const user = show()
    await user.click(screen.getByRole('radio', { name: 'Maintenance' }))
    await user.type(screen.getByRole('textbox', { name: /Title/ }), 'App maintenance')
    await user.click(screen.getByRole('checkbox', { name: /Close the app while the work is done/ }))
    await user.click(screen.getByRole('button', { name: 'Post it and schedule the closure' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/when the app closes and when it opens again/)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})

describe('the notices already written', () => {
  it('sorts them into showing, scheduled and over', async () => {
    stored.mockReturnValue([notice({ id: 'a', title: 'Today' }), notice({ id: 'b', title: 'Next week', starts_at: at(24 * 7) }), notice({ id: 'c', title: 'Last week', ends_at: at(-1) })])
    show()
    expect(within(await screen.findByRole('region', { name: 'Showing now' })).getByText('Today')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Scheduled' })).getByText('Next week')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Over' })).getByText('Last week')).toBeInTheDocument()
  })

  it('opens the app again from the notice that is closing it, after asking', async () => {
    const running = notice({ id: 'm', kind: 'maintenance', title: 'App maintenance', dismissible: false, closes_app: true, closed_from: at(-1), closed_until: at(5) })
    stored.mockReturnValue([running])
    const user = show()
    const row = (await screen.findByText('App maintenance')).closest('li') as HTMLElement
    expect(within(row).getByText('The app is closed')).toBeInTheDocument()
    await user.click(within(row).getByRole('button', { name: 'Open the app now' }))
    await user.click(within(await screen.findByRole('alertdialog', { name: 'Open the app again now?' })).getByRole('button', { name: 'Open the app' }))
    await waitFor(() => expect(ended).toHaveBeenCalledWith(running))
  })

  it('says that ending a notice cancels the closure it had scheduled', async () => {
    stored.mockReturnValue([notice({ id: 'm', kind: 'maintenance', title: 'App maintenance', dismissible: false, closes_app: true, closed_from: at(24), closed_until: at(48) })])
    const user = show()
    const row = (await screen.findByText('App maintenance')).closest('li') as HTMLElement
    expect(within(row).getByText('Closes the app')).toBeInTheDocument()
    await user.click(within(row).getByRole('button', { name: 'End now' }))
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(/the app will not close/)
  })

  it('opens one for changing, and saves it as that notice', async () => {
    stored.mockReturnValue([notice({ id: 'a', title: 'Today' })])
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Change' }))
    const title = screen.getByRole('textbox', { name: /Title/ })
    expect(title).toHaveValue('Today')
    await user.clear(title)
    await user.type(title, 'Today, at four')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1))
    expect(saved.mock.calls[0][0].title).toBe('Today, at four')
    expect(saved.mock.calls[0][1]).toBe('a')
  })

  it('removes one, after asking', async () => {
    stored.mockReturnValue([notice({ id: 'a', title: 'Today' })])
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Remove' }))
    await user.click(within(await screen.findByRole('alertdialog', { name: 'Remove this notice?' })).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(removed).toHaveBeenCalledWith('a'))
  })
})
