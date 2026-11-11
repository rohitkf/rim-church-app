import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from './appSettings'
import { levelsFrom } from './pageCells'
import { pageOpening, type PageWho } from './pageOpening'
import { decide, type CapabilityKey, type Holder, type Overrides } from './permissions'

/*
 * A page in the grid opens by the grid's own answer (0274) — decide(), the
 * same may() can_open_page() asks — so a page kept to the Admins, or to
 * the Owner, is closed to whoever that leaves out. Each answer here is the
 * one the local database gave for the same cells.
 */

const base: Holder = { myId: 'me', owner: false, admin: false, ledTeams: [], memberTeams: [] }
const people = {
  owner: { ...base, owner: true, admin: true },
  admin: { ...base, admin: true },
  head: { ...base, ledTeams: ['t'], headTeams: ['t'], assistTeams: [], memberTeams: ['t'] },
  member: { ...base, memberTeams: ['t'] },
  church: base,
} satisfies Record<string, Holder>

function opens(who: keyof typeof people, path: string, overrides: Overrides) {
  const holder = people[who]
  const asked: PageWho = {
    myId: 'me',
    standing: holder.admin ? 'admin' : holder.ledTeams.length ? 'lead' : holder.memberTeams.length ? 'member' : 'church',
    isAdmin: holder.admin,
    isOwner: holder.owner,
    isOverwatch: false,
    isPastor: false,
    teamIds: holder.memberTeams,
    clockInViewer: false,
    prayerCarer: false,
    opens: (cap: CapabilityKey) => decide(overrides, holder, cap),
  }
  return pageOpening(path, asked, DEFAULT_SETTINGS, levelsFrom(overrides)).open
}

const everyone = ['owner', 'admin', 'head', 'member', 'church'] as const
const who = (path: string, overrides: Overrides) => everyone.filter((p) => opens(p, path, overrides))

describe('a page kept to the Admins, or to the Owner (0274)', () => {
  it('opens as it always did while nothing is changed', () => {
    expect(who('/inventory', {})).toEqual(['owner', 'admin', 'head', 'member'])
    expect(who('/giving', {})).toEqual(['owner', 'admin', 'head', 'member', 'church'])
  })

  it('kept to the Admins, closes to Heads and their teams', () => {
    const admins: Overrides = { 'page.inventory': { member: 'none', head: 'none', assistant: 'none' } }
    expect(who('/inventory', admins)).toEqual(['owner', 'admin'])
  })

  it('kept to the Owner, closes to the Admins too — and to nobody else’s other pages', () => {
    const owner: Overrides = { 'page.inventory': { member: 'none', head: 'none', assistant: 'none', admin: 'none' } }
    expect(who('/inventory', owner)).toEqual(['owner'])
    expect(who('/giving', owner)).toEqual(['owner', 'admin', 'head', 'member', 'church'])
  })

  it('closed to the Admins alone, still opens to the teams it is open to', () => {
    expect(who('/inventory', { 'page.inventory': { admin: 'none' } })).toEqual(['owner', 'head', 'member'])
  })

  it('still opens to somebody given the page by name', () => {
    const owner: Overrides = { 'page.inventory': { member: 'none', head: 'none', assistant: 'none', admin: 'none' } }
    const given: Holder = { ...base, grants: [{ capability: 'page.inventory', userId: 'me', departmentId: null, reach: 'all' }] }
    expect(decide(owner, given, 'page.inventory')).toBe(true)
  })

  it('leaves a page with no cells to standing, as before', () => {
    // Volunteers is not in the grid: Admins by standing.
    expect(who('/volunteers', {})).toEqual(['owner', 'admin'])
  })
})
