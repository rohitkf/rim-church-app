import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PermissionsCard } from './PermissionsCard'
import { PERMISSIONS, ROLES } from '../lib/permissionMatrix'

const show = () => {
  render(<PermissionsCard />)
  return userEvent.setup()
}

/** The row for one action, wherever it sits. */
const rowFor = (action: string | RegExp) =>
  screen.getByRole('rowheader', { name: typeof action === 'string' ? new RegExp(action) : action })
    .closest('tr')!

describe('PermissionsCard', () => {
  it('starts open, because it is now a page somebody chose to walk into', () => {
    show()
    expect(screen.getAllByRole('table').length).toBe(PERMISSIONS.length)
  })

  it('still folds away, and folding it takes the tables out of the tree', async () => {
    const user = show()
    // Hidden content is out of the accessibility tree entirely, which is
    // the point: a screen reader should not wade through eight tables to
    // reach the rest of the settings either.
    await user.click(screen.getByRole('button', { name: 'Hide' }))
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('says it does not change anything, before anybody opens it', () => {
    show()
    expect(screen.getByText(/enforced by the database on every request, not by this page/)).toBeVisible()
  })

  it('opens to a table per area, with a column per standing', () => {
    show()
    expect(screen.getAllByRole('table')).toHaveLength(PERMISSIONS.length)
    for (const role of ROLES) {
      expect(screen.getAllByRole('columnheader', { name: role.label }).length).toBe(
        PERMISSIONS.length,
      )
    }
  })

  it('admits it can go stale, rather than implying an accuracy it cannot promise', () => {
    show()
    expect(screen.getByText(/will not update this page by itself/)).toBeInTheDocument()
    expect(screen.getByText(/the app is right and this needs correcting/)).toBeInTheDocument()
  })

  describe('the answers it gives', () => {
    it('lets everybody see their own DBS, and nobody else’s but an Admin', () => {
      // Verified against production: a Head reading profile_sensitive gets
      // exactly their own row and zero of anybody else's. The first draft
      // of this table said Heads could not see it at all, which was wrong
      // in a way only the database could settle.
      show()
      const row = rowFor('See DBS and safeguarding details')
      const cells = within(row).getAllByRole('cell')
      expect(within(cells[0]).getByLabelText('Yes')).toBeInTheDocument() // Owner
      expect(within(cells[1]).getByLabelText('Yes')).toBeInTheDocument() // Admin
      expect(within(cells[2]).getByText('own')).toBeInTheDocument() // Head
      expect(within(cells[4]).getByText('own')).toBeInTheDocument() // Team Member
      expect(within(row).getByText(/Only an Admin sees anybody else’s/)).toBeInTheDocument()
    })

    it('shows the Coordinator holding exactly one power, and it is the checklist', () => {
      show()
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
      expect(ownerOnly.map((c) => c.action)).toEqual(['Hand over ownership'])
    })
  })
})
