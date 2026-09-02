import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SetListsPage } from './SetListsPage'
import { chooseOption } from '../test/select'

const update = vi.fn()
const insert = vi.fn()
const canEdit = vi.fn()
const setListItems = vi.fn()
const rotaAssignments = vi.fn()

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } }, isAdmin: false }),
}))

vi.mock('../lib/useFinishedServices', () => ({
  useFinishedServices: () => ({ isFinished: () => false }),
}))

vi.mock('../lib/appSettings', () => ({ useAppSettings: () => ({ rota_window_days: 7 }) }))

vi.mock('../lib/monthGrid', () => ({ todayIso: () => '2026-09-01' }))

vi.mock('../lib/queries', () => ({
  fetchServices: () =>
    Promise.resolve([{ id: 's1', date: '2026-09-06', service_type: 'Sunday Morning' }]),
  fetchDepartments: () =>
    Promise.resolve([{ id: 'worship', name: 'Worship', is_worship: true, is_service_flow: false }]),
  fetchCanEditSetList: () => canEdit(),
  fetchSetListItems: () => setListItems(),
  fetchRotaAssignments: () => rotaAssignments(),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      insert: (row: unknown) => {
        insert(row)
        return Promise.resolve({ error: null })
      },
      update: (patch: unknown) => ({
        eq: (_col: string, id: string) => {
          update(patch, id)
          return Promise.resolve({ error: null })
        },
      }),
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}))

const song = {
  id: 'song1',
  service_id: 's1',
  title: 'Goodness of God',
  led_by: null,
  link: null,
  lyrics: null,
  sort_order: 0,
  leader: null,
}

const leaderOnRota = {
  id: 'a1',
  service_id: 's1',
  department_id: 'worship',
  user_id: 'u1',
  role_label: 'Worship Leader 1',
  role_id: null,
  profile: { id: 'u1', first_name: 'Grace', last_name: 'Mensah' },
  department: null,
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <SetListsPage />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('SetListsPage', () => {
  beforeEach(() => {
    update.mockReset()
    insert.mockReset()
    canEdit.mockReset().mockResolvedValue(true)
    setListItems.mockReset().mockResolvedValue([song])
    rotaAssignments.mockReset().mockResolvedValue([leaderOnRota])
  })

  /** The row for the song, which is where the edit form appears. */
  const songRow = async () => (await screen.findByText('Goodness of God')).closest('li')!

  it('offers to fill in who leads a song that has nobody against it', async () => {
    // The commonest reason a song has no leader is that the rota was not
    // filled when it was added — so that gap is the way in, not a shrug.
    const user = show()
    const row = await songRow()
    await user.click(within(row).getByRole('button', { name: 'Add who leads it' }))
    expect(within(row).getByLabelText('Led by')).toBeInTheDocument()
  })

  it('saves a leader onto a song that was added without one', async () => {
    const user = show()
    const row = await songRow()
    await user.click(within(row).getByRole('button', { name: 'Add who leads it' }))
    await chooseOption(user, within(row).getByLabelText('Led by'), /Grace Mensah/)
    await user.click(within(row).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Goodness of God', led_by: 'u1' }),
        'song1',
      ),
    )
  })

  it('edits the title, link and lyrics of a song already listed', async () => {
    const user = show()
    const row = await songRow()
    await user.click(within(row).getByRole('button', { name: 'Edit' }))
    const title = within(row).getByLabelText('Song')
    await user.clear(title)
    await user.type(title, 'What a Beautiful Name')
    await user.click(within(row).getByRole('button', { name: 'Add a link or lyrics' }))
    await user.type(within(row).getByLabelText('Link'), 'youtube.com/watch?v=abc')
    await user.click(within(row).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'What a Beautiful Name',
          link: 'youtube.com/watch?v=abc',
        }),
        'song1',
      ),
    )
  })

  it('opens straight onto the link and lyrics when the song already has them', async () => {
    // Correcting a link should not begin with hunting for where it went.
    setListItems.mockResolvedValue([{ ...song, link: 'https://example.org/song' }])
    const user = show()
    const row = await songRow()
    await user.click(within(row).getByRole('button', { name: 'Edit' }))
    expect(within(row).getByLabelText('Link')).toHaveValue('https://example.org/song')
  })

  it('leaves the song alone when the edit is cancelled', async () => {
    const user = show()
    const row = await songRow()
    await user.click(within(row).getByRole('button', { name: 'Edit' }))
    await user.clear(within(row).getByLabelText('Song'))
    await user.type(within(row).getByLabelText('Song'), 'Something else entirely')
    await user.click(within(row).getByRole('button', { name: 'Cancel' }))
    expect(update).not.toHaveBeenCalled()
    expect(screen.getByText('Goodness of God')).toBeInTheDocument()
  })

  it('will not save a song with its title emptied', async () => {
    const user = show()
    const row = await songRow()
    await user.click(within(row).getByRole('button', { name: 'Edit' }))
    await user.clear(within(row).getByLabelText('Song'))
    expect(within(row).getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(update).not.toHaveBeenCalled()
  })

  describe('somebody who is not on the worship team', () => {
    beforeEach(() => canEdit.mockResolvedValue(false))

    it('can read the set list and change nothing', async () => {
      show()
      expect(await screen.findByText('Goodness of God')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add who leads it' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Add song/ })).not.toBeInTheDocument()
      // And is told, rather than left wondering why there is no leader.
      expect(screen.getByText('Nobody yet')).toBeInTheDocument()
    })
  })
})
