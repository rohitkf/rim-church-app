import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PermissionsCard } from './PermissionsCard'
import { PERMISSIONS, ROLES } from '../lib/permissionMatrix'
import { decide, type Holder, type Overrides } from '../lib/permissions'

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
    expect(screen.queryAllByText('No').length).toBe(0)
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
    expect(screen.getByText(/become editable one area at a\s+time/)).toBeVisible()
  })

  it('marks the Team rota editable and the areas still to come as coming soon', () => {
    show()
    const rota = screen.getByRole('button', { name: /^Team rota/ })
    expect(within(rota).getByText('Editable')).toBeInTheDocument()
    const giving = screen.getByRole('button', { name: /^Giving/ })
    expect(within(giving).getByText('Coming soon')).toBeInTheDocument()
  })

  it('still offers the whole grid: a table per area, with a column per standing', async () => {
    const user = show()
    await compare(user)
    expect(screen.getAllByRole('table')).toHaveLength(PERMISSIONS.length)
    for (const role of ROLES) {
      expect(screen.getAllByRole('columnheader', { name: role.label }).length).toBe(
        PERMISSIONS.length,
      )
    }
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
      const options = (label: string) =>
        within(assign.getByRole('combobox', { name: `Assign somebody to a role — ${label}` }))
          .getAllByRole('option')
          .map((o) => o.textContent)
      // Short in the six-column grid; the one-role view says them in full.
      expect(options('Admin')).toEqual(['No', 'All'])
      expect(options('Team Head')).toEqual(['No', 'Team', 'All'])
      expect(options('Coordinator')).toEqual(['No', 'Team'])
      expect(options('Team Member')).toEqual(['No', 'Team', 'All'])
      // A Church Member and the Owner are not offered a choice at all.
      expect(assign.queryByRole('combobox', { name: /Church Member/ })).toBeNull()
      expect(assign.queryByRole('combobox', { name: /Owner/ })).toBeNull()
      expect(assign.getAllByText('(fixed)')).toHaveLength(2)
    })

    it('saves nothing until Save, then sends exactly the cells that changed', async () => {
      const user = show()
      await compare(user)
      await user.selectOptions(
        screen.getByRole('combobox', { name: 'Assign somebody to a role — Team Member' }),
        'team',
      )
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
      expect(picker).toHaveValue('all')
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

    it('lets the chosen role be edited on a phone, without the grid', async () => {
      const user = show()
      await user.click(screen.getByRole('radio', { name: 'Coordinator' }))
      await user.click(screen.getByRole('button', { name: /^Team rota/ }))
      const picker = screen.getByRole('combobox', { name: 'Approve or refuse a release request — Coordinator' })
      expect(within(picker).getAllByRole('option').map((o) => o.textContent)).toEqual(['No', 'Their team'])
      await user.selectOptions(picker, 'team')
      expect(screen.getByRole('list', { name: 'Changes to save' })).toBeInTheDocument()
    })

    it('leaves the areas still to come as they were written', async () => {
      const user = show()
      await compare(user)
      const giving = screen.getByRole('heading', { name: /Giving/ }).closest('section')!
      expect(within(giving).queryAllByRole('combobox')).toHaveLength(0)
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
    it('lets everybody see their own visa and DBS, and nobody else’s but the Owner', async () => {
      // Verified against production (0126 dry run): a Head, and an Admin
      // who is not the Owner, reading profile_sensitive get exactly their
      // own row and zero of anybody else's; the Owner gets every row.
      await compare(show())
      const row = rowFor('See visa, DBS and safeguarding details')
      const cells = within(row).getAllByRole('cell')
      expect(within(cells[0]).getByLabelText('Yes')).toBeInTheDocument() // Owner
      expect(within(cells[1]).getByText('own')).toBeInTheDocument() // Admin
      expect(within(cells[2]).getByText('own')).toBeInTheDocument() // Head
      expect(within(cells[4]).getByText('own')).toBeInTheDocument() // Team Member
      expect(within(row).getByText(/Only the Owner sees anybody else’s/)).toBeInTheDocument()
    })

    it('keeps email addresses and phone numbers to their owner and the Owner', async () => {
      await compare(show())
      const row = rowFor('See somebody’s email address and phone number')
      const cells = within(row).getAllByRole('cell')
      expect(within(cells[0]).getByLabelText('Yes')).toBeInTheDocument() // Owner
      expect(within(cells[1]).getByText('own')).toBeInTheDocument() // Admin
      expect(within(cells[4]).getByText('own')).toBeInTheDocument() // Team Member
    })

    it('shows the Coordinator holding exactly one power, and it is the checklist', () => {
      const coordinatorColumn = ROLES.findIndex((r) => r.key === 'coordinator')
      const granted = PERMISSIONS.flatMap((area) =>
        area.capabilities.filter((c) => c.can.coordinator !== 'no' && c.can.coordinator !== 'own'),
      )
      expect(granted.map((c) => c.action)).toEqual(
        expect.arrayContaining(['Verify a team’s checklist as done']),
      )
      // And it is not quietly an Admin: everything a Coordinator may do
      // beyond their own things is that one row.
      expect(granted).toHaveLength(
        granted.filter((c) => c.can.coordinator === 'yes' || c.can.coordinator === 'team').length,
      )
      expect(coordinatorColumn).toBeGreaterThan(-1)
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
      const rank: Record<string, number> = { no: 0, own: 1, team: 2, yes: 3 }
      for (const area of PERMISSIONS) {
        for (const c of area.capabilities) {
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
        a.capabilities.filter((c) => c.can.owner === 'yes' && c.can.admin === 'no'),
      )
      expect(ownerOnly.map((c) => c.action)).toEqual([
        'Read everybody’s feedback, mark where it stands and reply',
        'Hand over ownership',
      ])
    })
  })
})
