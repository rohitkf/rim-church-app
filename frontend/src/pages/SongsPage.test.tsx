import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SongsPage } from './SongsPage'

/*
 * Songs (0243): the library, kept by hand as well as by the set lists.
 * Everybody reads it; whoever may (songs.edit) adds, changes and removes.
 */

const state = vi.hoisted(() => ({
  mayEdit: true,
  library: [] as Record<string, unknown>[],
  calls: [] as unknown[][],
}))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ ledDepartmentIds: [] }) }))
vi.mock('../lib/useMyTeams', () => ({ useMyTeams: () => ({ teamIds: ['w'], onATeam: true, settled: true }) }))
vi.mock('../lib/usePermissions', () => ({
  usePermissions: () => ({
    can: (cap: string, at?: { departmentId?: string }) => cap === 'songs.edit' && state.mayEdit && at?.departmentId === 'w',
  }),
}))
vi.mock('../lib/songLibrary', async () => {
  const actual = await vi.importActual<typeof import('../lib/songLibrary')>('../lib/songLibrary')
  return {
    ...actual,
    fetchSongLibrary: () => Promise.resolve(state.library),
    addLibrarySong: (f: unknown) => {
      state.calls.push(['add', f])
      return Promise.resolve()
    },
    updateLibrarySong: (id: string, f: unknown) => {
      state.calls.push(['update', id, f])
      return Promise.resolve()
    },
    removeLibrarySong: (id: string) => {
      state.calls.push(['remove', id])
      return Promise.resolve()
    },
  }
})

const song = (over: Record<string, unknown>) => ({
  id: 's1',
  title: 'Goodness of God',
  song_key: 'A major',
  link: 'https://youtube.com/watch?v=g',
  lyrics: 'I love You, Lord',
  last_sung_on: '2026-11-01',
  times_sung: 3,
  ...over,
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <SongsPage />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  state.mayEdit = true
  state.library = [song({}), song({ id: 's2', title: 'Raise a Hallelujah', song_key: null, link: null, lyrics: null, times_sung: 0, last_sung_on: null })]
  state.calls = []
})

describe('the Songs page', () => {
  it('lists every song with its key, how often it was sung, a link and its words', async () => {
    const user = show()
    const row = await screen.findByRole('listitem', { name: 'Goodness of God' })
    expect(within(row).getByText('A major')).toBeInTheDocument()
    expect(within(row).getByText(/Sung 3 times/)).toBeInTheDocument()
    expect(within(row).getByRole('link', { name: /Listen/ })).toHaveAttribute('href', 'https://youtube.com/watch?v=g')
    await user.click(within(row).getByRole('button', { name: 'Lyrics' }))
    expect(within(row).getByText('I love You, Lord')).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: 'Raise a Hallelujah' })).getByText('Not sung yet')).toBeInTheDocument()
  })

  it('finds a song by its title or a line of it', async () => {
    const user = show()
    await screen.findByRole('listitem', { name: 'Goodness of God' })
    await user.type(screen.getByLabelText('Find a song'), 'love you')
    expect(screen.getByRole('listitem', { name: 'Goodness of God' })).toBeInTheDocument()
    expect(screen.queryByRole('listitem', { name: 'Raise a Hallelujah' })).toBeNull()
  })

  it('adds a song, with its key, link and words', async () => {
    const user = show()
    await screen.findByRole('listitem', { name: 'Goodness of God' })
    await user.click(screen.getByRole('button', { name: /Add a song/ }))
    await user.type(screen.getByLabelText('Song'), '  Way Maker ')
    await user.type(screen.getByLabelText('Link (optional)'), 'youtube.com/watch?v=w')
    await user.type(screen.getByLabelText('Lyrics (optional)'), 'You are here')
    await user.click(screen.getByRole('button', { name: 'Add song' }))
    await waitFor(() => expect(state.calls[0]?.[0]).toBe('add'))
    expect(state.calls[0][1]).toMatchObject({ title: '  Way Maker ', link: 'youtube.com/watch?v=w', lyrics: 'You are here' })
  })

  it('changes and removes a song', async () => {
    const user = show()
    const row = await screen.findByRole('listitem', { name: 'Goodness of God' })
    await user.click(within(row).getByRole('button', { name: 'Edit' }))
    const title = screen.getByDisplayValue('Goodness of God')
    await user.clear(title)
    await user.type(title, 'Goodness of God (live)')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(state.calls[0]).toEqual(['update', 's1', expect.objectContaining({ title: 'Goodness of God (live)' })]))

    await user.click(within(await screen.findByRole('listitem', { name: 'Raise a Hallelujah' })).getByRole('button', { name: 'Remove' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(state.calls).toContainEqual(['remove', 's2']))
  })

  it('is read-only for somebody whose team may not keep it', async () => {
    state.mayEdit = false
    show()
    const row = await screen.findByRole('listitem', { name: 'Goodness of God' })
    expect(screen.queryByRole('button', { name: /Add a song/ })).toBeNull()
    expect(within(row).queryByRole('button', { name: 'Edit' })).toBeNull()
  })
})
