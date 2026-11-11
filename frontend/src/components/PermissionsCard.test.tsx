import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PermissionsCard } from './PermissionsCard'
import { PERMISSIONS, ROLES } from '../lib/permissionMatrix'
import { decide, type Holder, type Overrides } from '../lib/permissions'
import { chooseOption, openOptions } from '../test/select'

/*
 * Who is looking, and what the church has stored. usePermissions is
 * replaced so a test can be an Admin or a Team Head without a session.
 */
let viewer: Holder = { myId: 'me', owner: false, admin: true, ledTeams: [], memberTeams: [] }
let stored: Overrides = {}

vi.mock('../lib/usePermissions', () => ({
  usePermissions: () => ({
    can: (cap: Parameters<typeof decide>[2], where?: Parameters<typeof decide>[3]) =>
      decide(stored, viewer, cap, where),
    overrides: stored,
  }),
}))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: viewer.admin }) }))

const rpc = vi.fn(async (_fn: string, _args: unknown) => ({ error: null as null | { message: string } }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: { rpc: (fn: string, args: unknown) => rpc(fn, args) },
}))

beforeEach(() => {
  viewer = { myId: 'me', owner: false, admin: true, ledTeams: [], memberTeams: [] }
  stored = {}
  rpc.mockClear()
})

const show = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <PermissionsCard />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

/** The row for one action, wherever it sits. */
const rowFor = (action: string | RegExp) =>
  screen.getByRole('rowheader', { name: typeof action === 'string' ? new RegExp(action) : action })
    .closest('tr')!

/** Open the full grid, the way somebody comparing every standing does. */
const compare = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('radio', { name: 'Compare all' }))

/** Unfold, area by area, the rows nobody can change. */
const unfoldFixed = async (user: ReturnType<typeof userEvent.setup>) => {
  for (const button of screen.getAllByRole('button', { name: /the app sets$/ })) await user.click(button)
}

/**
 * The whole grid open is thirteen tables of eighty-odd rows, eight
 * selects each: three seconds here, and past the usual five on a runner
 * sharing its cores. The two tests that open it all get the room.
 */
const WHOLE_GRID = { timeout: 30_000 }

describe('PermissionsCard', () => {
  /*
   * Thirteen six-column tables, open at once, were twenty screens of
   * sideways grid on a phone. The question people bring is about one
   * person, so the page starts there.
   */
  it('starts by asking who, not with thirteen tables', () => {
    show()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByRole('radiogroup', { name: 'Role' })).toBeInTheDocument()
    for (const role of ROLES) expect(screen.getByRole('radio', { name: role.label })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Team Member' })).toBeChecked()
  })

  it('folds each area to one line saying how much of it is theirs', () => {
    show()
    const list = screen.getByRole('list', { name: 'What a Team Member can do' })
    const areas = within(list).getAllByRole('button')
    expect(areas).toHaveLength(PERMISSIONS.length)
    for (const area of areas) expect(area).toHaveAttribute('aria-expanded', 'false')
    const giving = PERMISSIONS.find((a) => a.area === 'Giving')!
    const theirs = giving.capabilities.filter((c) => c.can.member !== 'no').length
    expect(
      within(screen.getByRole('button', { name: /^Giving/ })).getByText(`${theirs} of ${giving.capabilities.length}`),
    ).toBeInTheDocument()
  })

  it('answers for the chosen role when an area is opened', async () => {
    const user = show()
    await user.click(screen.getByRole('radio', { name: 'Church Member' }))
    await user.click(screen.getByRole('button', { name: /^Team rota/ }))
    const row = screen.getByText('See the rota').closest('li')!
    expect(within(row).getByText('No')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Admin' }))
    expect(within(screen.getByText('See the rota').closest('li')!).getByText('Yes')).toBeInTheDocument()
  })

  it('can hide everything the role cannot do', async () => {
    const user = show()
    await user.click(screen.getByRole('radio', { name: 'Church Member' }))
    await user.click(screen.getByRole('button', { name: 'Open all' }))
    expect(screen.getByText('See the rota')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /Only show what a Church Member can do/ }))
    expect(screen.queryByText('See the rota')).toBeNull()
    // Almost every cell is the church's to set since 0269, so the filter
    // goes by the answer: nothing a Church Member may not do is left.
    expect(screen.queryAllByText('No').length).toBe(0)
    expect(screen.queryByText('Ask to join a team')).toBeNull()
    expect(screen.getByText('Open the Service Planner')).toBeInTheDocument()
  })

  it('opens and folds every area at once', async () => {
    const user = show()
    await user.click(screen.getByRole('button', { name: 'Open all' }))
    const list = screen.getByRole('list', { name: 'What a Team Member can do' })
    for (const area of within(list).getAllByRole('button', { expanded: true })) expect(area).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Fold all' }))
    expect(within(list).queryAllByRole('button', { expanded: true })).toHaveLength(0)
  })

  it('says which areas are the church’s to set, and that the database follows them', () => {
    show()
    expect(screen.getByText(/The database reads them on every request/)).toBeVisible()
    expect(screen.getByText(/not a rule of its own/)).toBeVisible()
  })

  it('marks every area editable: none is kept fixed any more (0277)', () => {
    show()
    for (const area of PERMISSIONS) {
      const button = screen.getByRole('button', { name: new RegExp(`^${area.area}`) })
      expect(within(button).getByText('Editable'), area.area).toBeInTheDocument()
    }
    // Feedback and the app itself were fixed here until 0277 made their rows the church's.
    expect(PERMISSIONS.filter((a) => a.fixed).map((a) => a.area)).toEqual([])
    expect(PERMISSIONS.map((a) => a.area)).toEqual(expect.arrayContaining(['Feedback', 'Settings & the keys']))
    expect(screen.queryByText('Fixed')).toBeNull()
    expect(screen.queryByText('Coming soon')).toBeNull()
  })

  it('still offers the whole grid: a table per area, with a column per standing', { ...WHOLE_GRID }, async () => {
    const user = show()
    await compare(user)
    await unfoldFixed(user)
    expect(screen.getAllByRole('table')).toHaveLength(PERMISSIONS.length)
    for (const role of ROLES) {
      expect(screen.getAllByRole('columnheader', { name: role.label }).length).toBe(
        PERMISSIONS.length,
      )
    }
  })

  it('shows the church’s choices first, and folds the rows the app sets', { ...WHOLE_GRID }, async () => {
    const user = show()
    await compare(user)
    // A row with a choice is there, its one fixed cell (the Owner's) said
    // plainly — no padlock, as if a setting were switched off. Every other
    // column is a choice since 0268–0270.
    const assign = rowFor('Assign somebody to a role')
    expect(within(assign).getAllByText('(fixed)')).toHaveLength(1)
    expect(assign.querySelector('svg rect')).toBeNull()
    // A row nobody can change waits a tap away.
    expect(screen.queryByRole('rowheader', { name: /Edit your own profile/ })).toBeNull()
    await unfoldFixed(user)
    expect(rowFor('Edit your own profile')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Hide what the app sets' }).length).toBeGreaterThan(0)
  })

  it('admits the areas still written down can go stale', () => {
    show()
    expect(screen.getByText(/will not update them by itself/)).toBeInTheDocument()
    expect(screen.getByText(/the app is right and this needs correcting/)).toBeInTheDocument()
  })

  describe('changing a permission', () => {
    it('offers each profile only the reaches that make sense for it', async () => {
      const user = show()
      await compare(user)
      const assign = within(rowFor('Assign somebody to a role'))
      const options = async (label: string) => {
        const list = await openOptions(user, assign.getByRole('combobox', { name: `Assign somebody to a role — ${label}` }))
        const shown = within(list).getAllByRole('option').map((o) => o.firstChild?.textContent)
        await user.keyboard('{Escape}')
        return shown
      }
      // Short in the six-column grid; the one-role view says them in full.
      expect(await options('Admin')).toEqual(['No', 'All'])
      expect(await options('Team Head')).toEqual(['No', 'Team', 'All'])
      expect(await options('Team Coordinator')).toEqual(['No', 'Team', 'All'])
      expect(await options('Team Member')).toEqual(['No', 'Team', 'All'])
      // Only the Owner is not offered a choice: it holds everything.
      expect(assign.queryByRole('combobox', { name: /Owner/ })).toBeNull()
      // A Church Member, a Pastor and Overwatch: No, or everywhere (0268–0270).
      expect(await options('Church Member')).toEqual(['No', 'All'])
      expect(await options('Pastor')).toEqual(['No', 'All'])
      expect(await options('Overwatch')).toEqual(['No', 'All'])
      expect(assign.getAllByText('(fixed)')).toHaveLength(1)
    })

    it('gives Overwatch its own cells, and a Pastor a choice everywhere — the prayer rows included (0214, 0268, 0277)', async () => {
      const user = show()
      await compare(user)
      const chat = within(rowFor('Read and post in a team’s chat'))
      const list = await openOptions(user, chat.getByRole('combobox', { name: 'Read and post in a team’s chat — Overwatch' }))
      expect(within(list).getAllByRole('option').map((o) => o.firstChild?.textContent)).toEqual(['No', 'All'])
      await user.keyboard('{Escape}')
      expect(chat.getByRole('combobox', { name: 'Read and post in a team’s chat — Pastor' })).toBeInTheDocument()
      const prayer = within(rowFor('Read private prayer requests'))
      // A Pastor's own three rows are a choice since 0277, starting at Yes.
      expect(prayer.getByRole('combobox', { name: /Pastor/ })).toHaveTextContent('All')
      expect(prayer.getByRole('combobox', { name: /Overwatch/ })).toBeInTheDocument()

      await chooseOption(user, chat.getByRole('combobox', { name: 'Read and post in a team’s chat — Overwatch' }), 'No')
      await user.click(screen.getByRole('button', { name: 'Save permissions' }))
      expect(rpc).toHaveBeenCalledWith('set_permissions', {
        p_changes: [{ role: 'overwatch', capability: 'msg.chat', reach: 'none' }],
      })
    })

    it('starts from a preset as a draft, sending nothing until Save', async () => {
      const user = show()
      await user.click(screen.getByRole('button', { name: 'Open' }))
      expect(rpc).not.toHaveBeenCalled()
      const pending = screen.getByRole('list', { name: 'Changes to save' })
      expect(within(pending).getAllByText(/Assign somebody to a role/).length).toBeGreaterThan(0)
      await user.click(screen.getByRole('button', { name: 'Save permissions' }))
      const sent = rpc.mock.calls[0][1] as { p_changes: { role: string; capability: string; reach: string }[] }
      expect(sent.p_changes).toContainEqual({ role: 'member', capability: 'rota.assign', reach: 'team' })
      expect(sent.p_changes.some((c) => c.role === 'admin' || c.capability.startsWith('page.'))).toBe(false)
    })

    it('saves nothing until Save, then sends exactly the cells that changed', async () => {
      const user = show()
      await compare(user)
      await chooseOption(user, screen.getByRole('combobox', { name: 'Assign somebody to a role — Team Member' }), 'Team')
      expect(rpc).not.toHaveBeenCalled()
      const pending = screen.getByRole('list', { name: 'Changes to save' })
      expect(within(pending).getByText(/Team Member/)).toBeInTheDocument()
      expect(within(pending).getByText('Their team')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Save permissions' }))
      expect(rpc).toHaveBeenCalledWith('set_permissions', {
        p_changes: [{ role: 'member', capability: 'rota.assign', reach: 'team' }],
      })
    })

    it('shows what the church chose, marked as moved from the default', async () => {
      stored = { 'rota.assign': { head: 'all' } }
      const user = show()
      await compare(user)
      const picker = screen.getByRole('combobox', { name: 'Assign somebody to a role — Team Head' })
      expect(picker).toHaveTextContent(/^All$/)
      expect(within(rowFor('Assign somebody to a role')).getByLabelText('Changed from the app’s default')).toBeInTheDocument()
    })

    it('restores the defaults as a draft, and saves them only when asked', async () => {
      stored = { 'rota.assign': { head: 'all', member: 'team' } }
      const user = show()
      await user.click(screen.getByRole('button', { name: 'Restore defaults' }))
      expect(rpc).not.toHaveBeenCalled()
      expect(within(screen.getByRole('list', { name: 'Changes to save' })).getAllByRole('listitem')).toHaveLength(2)
      await user.click(screen.getByRole('button', { name: 'Save permissions' }))
      expect(rpc).toHaveBeenCalledWith('set_permissions', {
        p_changes: expect.arrayContaining([
          { role: 'head', capability: 'rota.assign', reach: 'team' },
          { role: 'member', capability: 'rota.assign', reach: 'none' },
        ]),
      })
    })

    it('says when a right’s page is closed to the role, and opens it in the same save if asked', async () => {
      const user = show()
      await compare(user)
      const assign = within(rowFor('Assign somebody to a role'))
      await chooseOption(user, assign.getByRole('combobox', { name: 'Assign somebody to a role — Pastor' }), 'All')
      const closed = screen.getByRole('list', { name: 'Pages still closed' })
      expect(closed).toHaveTextContent('The Team Rota page is closed to a Pastor')
      await user.click(within(closed).getByRole('button', { name: 'Open the page for them too' }))
      expect(screen.queryByRole('list', { name: 'Pages still closed' })).toBeNull()
      await user.click(screen.getByRole('button', { name: 'Save permissions' }))
      expect(rpc).toHaveBeenCalledWith('set_permissions', {
        p_changes: expect.arrayContaining([
          { role: 'pastor', capability: 'rota.assign', reach: 'all' },
          { role: 'pastor', capability: 'page.rota', reach: 'all' },
        ]),
      })
    })

    it('asks nothing when the page is already open to the role', async () => {
      const user = show()
      await compare(user)
      const assign = within(rowFor('Assign somebody to a role'))
      await chooseOption(user, assign.getByRole('combobox', { name: 'Assign somebody to a role — Team Member' }), 'All')
      expect(screen.getByRole('list', { name: 'Changes to save' })).toBeInTheDocument()
      expect(screen.queryByRole('list', { name: 'Pages still closed' })).toBeNull()
    })

    it('lets the chosen role be edited on a phone, without the grid', async () => {
      const user = show()
      await user.click(screen.getByRole('radio', { name: 'Team Coordinator' }))
      await user.click(screen.getByRole('button', { name: /^Team rota/ }))
      const picker = screen.getByRole('combobox', { name: 'Approve or refuse a release request — Team Coordinator' })
      const list = await openOptions(user, picker)
      expect(within(list).getAllByRole('option').map((o) => o.firstChild?.textContent)).toEqual(['No', 'Their team', 'Everywhere'])
      await user.click(within(list).getByRole('option', { name: 'Their team' }))
      expect(screen.getByRole('list', { name: 'Changes to save' })).toBeInTheDocument()
    })

    it('offers a choice in the areas that were kept fixed (0277)', { ...WHOLE_GRID }, async () => {
      const user = show()
      await compare(user)
      const feedback = screen.getByRole('heading', { name: /^Feedback/ }).closest('section')!
      expect(within(feedback).queryAllByRole('combobox').length).toBeGreaterThan(0)
      expect(within(feedback).getByText(/Your own feedback is always yours/)).toBeInTheDocument()
      // The grid itself: an Admin's cell is a choice, starting at Yes.
      const keys = within(rowFor('Change who can do what — Access & Privileges'))
      expect(keys.getByRole('combobox', { name: /— Admin$/ })).toHaveTextContent('All')
      // And one row is still nobody's to set: handing ownership over.
      await unfoldFixed(user)
      expect(within(rowFor('Hand over ownership')).queryAllByRole('combobox')).toHaveLength(0)
    })

    it('is a description, not a control, for somebody who cannot change it', async () => {
      viewer = { myId: 'me', owner: false, admin: false, ledTeams: ['a'], memberTeams: [] }
      const user = show()
      await compare(user)
      expect(screen.queryAllByRole('combobox')).toHaveLength(0)
      expect(screen.queryByRole('button', { name: 'Save permissions' })).toBeNull()
    })
  })

  describe('the answers it gives', () => {
    it('keeps everybody else’s visa and DBS to the Owner out of the box, and lets the church give it (0277)', async () => {
      // Verified against production (0126 dry run): a Head, and an Admin
      // who is not the Owner, reading profile_sensitive get exactly their
      // own row and zero of anybody else's; the Owner gets every row. Since
      // 0277 that is a row in the grid, every cell starting at No.
      const user = show()
      await compare(user)
      const row = within(rowFor('See and correct everybody’s visa, DBS and safeguarding details'))
      expect(within(row.getAllByRole('cell')[0]).getByLabelText('Yes')).toBeInTheDocument() // Owner
      for (const role of ['Admin', 'Team Head', 'Team Member', 'Pastor']) {
        expect(row.getByRole('combobox', { name: new RegExp(`— ${role}$`) }), role).toHaveTextContent('No')
      }
    })

    it('keeps everybody else’s email addresses and phone numbers to the Owner out of the box, and lets the church give them (0277)', async () => {
      const user = show()
      await compare(user)
      const row = within(rowFor('See everybody’s email address, phone number and household'))
      expect(within(row.getAllByRole('cell')[0]).getByLabelText('Yes')).toBeInTheDocument() // Owner
      for (const role of ['Admin', 'Team Member']) {
        expect(row.getByRole('combobox', { name: new RegExp(`— ${role}$`) }), role).toHaveTextContent('No')
      }
    })

    it('gives the Coordinator, out of the box, the Sunday morning and nothing else', () => {
      // Whoever the rota puts in Team Coordinator holds the team that
      // morning: ticking and verifying its checklist, and its green light.
      // Everything else of theirs is the church's to grant in the grid.
      const theirs = PERMISSIONS.flatMap((area) =>
        area.capabilities.filter((c) => c.can.coordinator === 'team' || c.can.coordinator === 'yes'),
      )
      expect(theirs.filter((c) => c.key).map((c) => c.key).sort()).toEqual(['day.ready', 'day.verify'])
    })

    it('never grants a new account something a Team Member is denied', () => {
      // Being on no team is the narrowest standing there is: it can only
      // ever see less than somebody on a team, never more.
      const rank: Record<string, number> = { no: 0, own: 1, team: 2, yes: 3 }
      for (const area of PERMISSIONS) {
        for (const c of area.capabilities) {
          expect(rank[c.can.newcomer], `${area.area} / ${c.action}`).toBeLessThanOrEqual(
            rank[c.can.member],
          )
        }
      }
    })

    it('gives a new account nothing that belongs to a team', () => {
      // The six pages the app now turns them away from. If one of these
      // ever reads "yes" again, either a policy was widened or this table
      // is lying about it.
      const teamsOwn = [
        'See the rota',
        'See the register and its documents',
        'Read the message board',
        'Read and post in a team’s chat',
        'See what a team has answered',
        'Read a team’s debrief',
        'See the activity feed',
      ]
      const rows = PERMISSIONS.flatMap((a) => a.capabilities)
      for (const action of teamsOwn) {
        const row = rows.find((c) => c.action === action)
        expect(row, action).toBeDefined()
        expect(row!.can.newcomer, action).toBe('no')
      }
    })

    it('never grants a Team Member something a Head is denied', () => {
      // A sanity check on the whole grid rather than one row: standings
      // widen outwards, and an inversion would mean the table is wrong or
      // a policy is.
      // Fixed rows only: a row in the grid is whatever the church chose,
      // and a Head is not always offered what a member is (a debrief's
      // "add to it" is the members' way in; Heads write the whole thing).
      const rank: Record<string, number> = { no: 0, own: 1, team: 2, yes: 3 }
      for (const area of PERMISSIONS) {
        for (const c of area.capabilities.filter((row) => !row.key)) {
          expect(rank[c.can.member], `${area.area} / ${c.action}`).toBeLessThanOrEqual(
            rank[c.can.head],
          )
          expect(rank[c.can.head], `${area.area} / ${c.action}`).toBeLessThanOrEqual(
            rank[c.can.admin] === 0 ? rank[c.can.head] : rank[c.can.admin],
          )
        }
      }
    })

    it('gives the Owner everything an Admin has, plus what only they hold', () => {
      for (const area of PERMISSIONS) {
        for (const c of area.capabilities) {
          const rank: Record<string, number> = { no: 0, own: 1, team: 2, yes: 3 }
          expect(rank[c.can.owner], `${area.area} / ${c.action}`).toBeGreaterThanOrEqual(
            rank[c.can.admin],
          )
        }
      }
      const ownerOnly = PERMISSIONS.flatMap((a) =>
        a.capabilities.filter((c) => !c.key && c.can.owner === 'yes' && c.can.admin === 'no'),
      )
      // Only one is left that is not the church's to give (0277).
      expect(ownerOnly.map((c) => c.action)).toEqual(['Hand over ownership'])
    })
  })
})
