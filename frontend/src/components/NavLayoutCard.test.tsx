import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NavLayoutCard } from './NavLayoutCard'
import type { NavLayout } from '../lib/navLayout'

// Whether this person holds the Menu room (settings.menu, 0277): Admins out of the box.
const auth = vi.hoisted(() => ({ isAdmin: true }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../lib/usePermissions', () => ({
  PERMISSIONS_KEY: ['role-permissions'],
  usePermissions: () => ({ can: (cap: string) => cap === 'settings.menu' && auth.isAdmin, overrides: {}, teams: {}, grants: [], settled: true }),
}))

const db = vi.hoisted(() => ({ saved: null as unknown, writes: [] as unknown[], refused: false }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: { nav_layout: db.saved }, error: null }) }),
      }),
      update: (row: { nav_layout: unknown }) => ({
        eq: () => ({
          // The row comes back when the write landed, and nothing when the
          // database's rules turned it away.
          select: () => {
            if (db.refused) return Promise.resolve({ data: [], error: null })
            db.writes.push(row.nav_layout)
            db.saved = row.nav_layout
            return Promise.resolve({ data: [{ nav_layout: row.nav_layout }], error: null })
          },
        }),
      }),
    }),
  },
}))

beforeEach(() => {
  auth.isAdmin = true
  db.saved = null
  db.writes = []
  db.refused = false
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <NavLayoutCard />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const lastWrite = () => db.writes[db.writes.length - 1] as NavLayout

describe('arranging the menu', () => {
  it('starts from the app’s own groups, with Dashboard at the top', async () => {
    show()
    const list = await screen.findByRole('list', { name: 'Menu arrangement' })
    const groups = within(list).getAllByRole('textbox', { name: 'Group name' }).map((i) => (i as HTMLInputElement).value)
    expect(groups).toEqual(['Serving', 'Services', 'Communications', 'Church Life', 'People & Teams'])
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Dashboard')
  })

  it('renames a group and saves the arrangement', async () => {
    const user = show()
    const [sunday] = await screen.findAllByRole('textbox', { name: 'Group name' })
    await user.clear(sunday)
    await user.type(sunday, 'On the day')
    await user.click(screen.getByRole('button', { name: 'Save menu' }))
    await waitFor(() => expect(db.writes).toHaveLength(1))
    // The Calendar is second, above the groups, since the services are planned from it.
    expect(lastWrite().top).toEqual(['/', '/events'])
    expect(lastWrite().groups[0].name).toBe('On the day')
    expect(lastWrite().groups[0].items).toEqual(expect.arrayContaining(['/availability', '/rota', '/checklists']))
    expect(lastWrite().groups[0].items).not.toContain('/serving')
  })

  it('says the Service Planner opens from the Calendar, so nobody wonders why it is not in their menu', async () => {
    show()
    const list = await screen.findByRole('list', { name: 'Menu arrangement' })
    expect(within(list).getByText('Opens from Calendar. In the menu only for somebody Calendar is closed to.')).toBeInTheDocument()
    // And a page that is a tab says whose tab it is.
    expect(within(list).getByText('A tab of Debriefs. In the menu on its own only for somebody Debriefs is closed to.')).toBeInTheDocument()
    expect(within(list).getAllByText(/^A tab of Volunteers\./)).toHaveLength(2)
  })

  it('moves a whole group, pages and all', async () => {
    const user = show()
    await screen.findByRole('list', { name: 'Menu arrangement' })
    await user.click(screen.getByRole('button', { name: 'Move Communications up' }))
    await user.click(screen.getByRole('button', { name: 'Save menu' }))
    await waitFor(() => expect(db.writes).toHaveLength(1))
    expect(lastWrite().groups.map((g) => g.name)).toEqual([
      'Serving',
      'Communications',
      'Services',
      'Church Life',
      'People & Teams',
    ])
    expect(lastWrite().groups[1].items).toEqual(['/updates', '/messages', '/team-chat', '/polls', '/feedback'])
  })

  it('moves a page into another group past its heading', async () => {
    const user = show()
    await screen.findByRole('list', { name: 'Menu arrangement' })
    // Issues is last in Services; one place down is past the next heading.
    screen.getByRole('button', { name: /Reorder Issues/ }).focus()
    await user.keyboard('{ArrowDown}')
    await user.click(screen.getByRole('button', { name: 'Save menu' }))
    await waitFor(() => expect(db.writes).toHaveLength(1))
    expect(lastWrite().groups[1].items).not.toContain('/issues')
    expect(lastWrite().groups[2].items[0]).toBe('/issues')
  })

  it('adds a group and removes it again only while it is empty', async () => {
    const user = show()
    await screen.findByRole('list', { name: 'Menu arrangement' })
    expect(screen.getByRole('button', { name: 'Remove group Serving' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /Add group/ }))
    const remove = screen.getByRole('button', { name: 'Remove group New group' })
    expect(remove).toBeEnabled()
    await user.click(remove)
    expect(screen.queryByRole('button', { name: 'Remove group New group' })).toBeNull()
  })

  it('puts the app’s own menu back', async () => {
    db.saved = { top: ['/'], groups: [{ name: 'Everything', items: ['/rota'] }] }
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Use the app’s own menu' }))
    await waitFor(() => expect(db.writes).toEqual([null]))
  })

  it('renames a page, keeps only names that differ, and puts a name back', async () => {
    const user = show()
    await screen.findByRole('list', { name: 'Menu arrangement' })
    await user.click(screen.getByRole('button', { name: 'Rename Polls' }))
    const field = screen.getByRole('textbox', { name: 'Name for Polls' })
    await user.clear(field)
    await user.type(field, '  Votes  {Enter}')
    expect(screen.getByText('was Polls')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save menu' }))
    await waitFor(() => expect(db.writes).toHaveLength(1))
    expect(lastWrite().labels).toEqual({ '/polls': 'Votes' })
  })

  it('reads a saved name, and the reset saves the page under its own name again', async () => {
    db.saved = { top: ['/'], groups: [{ name: 'Talk', items: ['/polls'] }], labels: { '/polls': 'Votes' } }
    const user = show()
    expect(await screen.findByText('Votes')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Call it Polls again' }))
    await user.click(screen.getByRole('button', { name: 'Save menu' }))
    await waitFor(() => expect(db.writes).toHaveLength(1))
    expect(lastWrite().labels).toBeUndefined()
  })

  /*
   * A page that holds others as tabs has a second name: what the menu
   * calls the entry for all of them. People, Chat and After the Service
   * were the app's words until the Owner asked for them to be the church's.
   */
  describe('the name of an entry that holds tabs', () => {
    it('says what the menu calls it, on the row of the page that holds the tabs', async () => {
      show()
      const list = await screen.findByRole('list', { name: 'Menu arrangement' })
      expect(within(list).getByText('In the menu as People, with its tabs.')).toBeInTheDocument()
      expect(within(list).getByText('In the menu as Chat, with its tabs.')).toBeInTheDocument()
      expect(within(list).getByText('In the menu as After the Service, with its tabs.')).toBeInTheDocument()
      // Where the app gave the entry no name of its own, it goes by the page's.
      expect(within(list).getByText('In the menu as Set Lists, with its tabs.')).toBeInTheDocument()
      // A page with no tabs has no second name to change.
      expect(screen.queryByRole('button', { name: /Rename the menu entry Polls/ })).toBeNull()
    })

    it('renames the entry and leaves the page’s own name alone', async () => {
      const user = show()
      await screen.findByRole('list', { name: 'Menu arrangement' })
      await user.click(screen.getByRole('button', { name: 'Rename the menu entry People' }))
      const field = screen.getByRole('textbox', { name: 'Menu name for Volunteers and its tabs' })
      await user.clear(field)
      await user.type(field, '  Members  {Enter}')
      expect(screen.getByText('In the menu as Members, with its tabs. Was People.')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Save menu' }))
      await waitFor(() => expect(db.writes).toHaveLength(1))
      expect(lastWrite().labels).toEqual({ 'family:/volunteers': 'Members' })
    })

    it('names an entry the app left under its page’s name, and follows the page’s name until then', async () => {
      const user = show()
      await screen.findByRole('list', { name: 'Menu arrangement' })
      await user.click(screen.getByRole('button', { name: 'Rename Set Lists' }))
      await user.type(screen.getByRole('textbox', { name: 'Name for Set Lists' }), '{Control>}a{/Control}Worship Sets{Enter}')
      expect(screen.getByText('In the menu as Worship Sets, with its tabs.')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Rename the menu entry Worship Sets' }))
      await user.type(screen.getByRole('textbox', { name: 'Menu name for Worship Sets and its tabs' }), '{Control>}a{/Control}Music{Enter}')
      await user.click(screen.getByRole('button', { name: 'Save menu' }))
      await waitFor(() => expect(db.writes).toHaveLength(1))
      expect(lastWrite().labels).toEqual({ '/set-lists': 'Worship Sets', 'family:/set-lists': 'Music' })
    })

    it('reads a saved name, and the reset puts the app’s back', async () => {
      db.saved = { top: ['/'], groups: [], labels: { 'family:/messages': 'Talk' } }
      const user = show()
      await screen.findByRole('list', { name: 'Menu arrangement' })
      expect(screen.getByText('In the menu as Talk, with its tabs. Was Chat.')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Call the entry Chat again' }))
      expect(screen.getByText('In the menu as Chat, with its tabs.')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Save menu' }))
      await waitFor(() => expect(db.writes).toHaveLength(1))
      expect(lastWrite().labels).toBeUndefined()
    })

    it('keeps nothing when the name typed is the one the menu had anyway', async () => {
      const user = show()
      await screen.findByRole('list', { name: 'Menu arrangement' })
      await user.click(screen.getByRole('button', { name: 'Rename the menu entry People' }))
      await user.type(screen.getByRole('textbox', { name: 'Menu name for Volunteers and its tabs' }), '{Control>}a{/Control}People{Enter}')
      // Something else has to change for there to be anything to save.
      await user.click(screen.getByRole('button', { name: 'Rename Polls' }))
      await user.type(screen.getByRole('textbox', { name: 'Name for Polls' }), '{Control>}a{/Control}Votes{Enter}')
      await user.click(screen.getByRole('button', { name: 'Save menu' }))
      await waitFor(() => expect(db.writes).toHaveLength(1))
      expect(lastWrite().labels).toEqual({ '/polls': 'Votes' })
    })

    it('will not save an entry under the name of another entry', async () => {
      const user = show()
      await screen.findByRole('list', { name: 'Menu arrangement' })
      await user.click(screen.getByRole('button', { name: 'Rename the menu entry People' }))
      await user.type(screen.getByRole('textbox', { name: 'Menu name for Volunteers and its tabs' }), '{Control>}a{/Control}polls{Enter}')
      expect(screen.getByText(/Two entries in the menu have the same name/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save menu' })).toBeDisabled()
    })

    it('lets an entry share a name with one of its own tabs, which is never beside it in the menu', async () => {
      const user = show()
      await screen.findByRole('list', { name: 'Menu arrangement' })
      await user.click(screen.getByRole('button', { name: 'Rename the menu entry People' }))
      await user.type(screen.getByRole('textbox', { name: 'Menu name for Volunteers and its tabs' }), '{Control>}a{/Control}Families{Enter}')
      expect(screen.queryByText(/have the same name/)).toBeNull()
      expect(screen.getByRole('button', { name: 'Save menu' })).toBeEnabled()
    })
  })

  it('will not save two pages under one name', async () => {
    const user = show()
    await screen.findByRole('list', { name: 'Menu arrangement' })
    await user.click(screen.getByRole('button', { name: 'Rename Polls' }))
    const field = screen.getByRole('textbox', { name: 'Name for Polls' })
    await user.clear(field)
    await user.type(field, 'messages{Enter}')
    expect(screen.getByText(/Two pages have the same name/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save menu' })).toBeDisabled()
  })

  it('says Saved only when the menu was written, and keeps the changes when it was not', async () => {
    db.refused = true
    const user = show()
    await screen.findByRole('list', { name: 'Menu arrangement' })
    await user.click(screen.getByRole('button', { name: 'Rename Polls' }))
    await user.type(screen.getByRole('textbox', { name: 'Name for Polls' }), 'X{Enter}')
    await user.click(screen.getByRole('button', { name: 'Save menu' }))
    expect(await screen.findByText(/The menu was not saved/)).toBeInTheDocument()
    expect(screen.queryByText(/Saved — everybody/)).not.toBeInTheDocument()
    // The draft is still there to save again.
    expect(screen.getByRole('button', { name: 'Save menu' })).toBeEnabled()

    db.refused = false
    await user.click(screen.getByRole('button', { name: 'Save menu' }))
    expect(await screen.findByText(/Saved — everybody/)).toBeInTheDocument()
    expect(lastWrite().labels).toEqual({ '/polls': 'PollsX' })
  })

  it('shows the saved menu, names and all, when the page is opened again', async () => {
    db.saved = {
      top: ['/'],
      groups: [{ name: 'Talk', items: ['/polls', '/messages'] }],
      labels: { '/polls': 'Votes' },
    }
    show()
    const list = await screen.findByRole('list', { name: 'Menu arrangement' })
    expect(within(list).getByText('Votes')).toBeInTheDocument()
    expect(within(list).getByText('was Polls')).toBeInTheDocument()
    expect((within(list).getAllByRole('textbox', { name: 'Group name' })[0] as HTMLInputElement).value).toBe('Talk')
  })

  it('is not there for anybody but an Admin', () => {
    auth.isAdmin = false
    show()
    expect(screen.queryByRole('list', { name: 'Menu arrangement' })).toBeNull()
  })
})
