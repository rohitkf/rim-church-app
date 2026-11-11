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

  it('opens Clock In by its cell, an Admin’s included (0275)', () => {
    // opens() here is decide() on the page's own capability; Clock In asks clockin.view.
    const ask = (p: (typeof everyone)[number], overrides: Overrides) =>
      pageOpening(
        '/clock-in',
        {
          myId: 'me',
          standing: people[p].admin ? 'admin' : 'church',
          isAdmin: people[p].admin,
          isOwner: people[p].owner,
          isOverwatch: false,
          isPastor: false,
          teamIds: [],
          clockInViewer: decide(overrides, people[p], 'clockin.view'),
          prayerCarer: false,
        },
        DEFAULT_SETTINGS,
        {},
      ).open
    expect(everyone.filter((p) => ask(p, {}))).toEqual(['owner', 'admin'])
    expect(everyone.filter((p) => ask(p, { 'clockin.view': { admin: 'none' } }))).toEqual(['owner'])
    expect(everyone.filter((p) => ask(p, { 'clockin.view': { admin: 'none', head: 'all' } }))).toEqual(['owner', 'head'])
  })

  it('opens the Dashboard to everybody: it has no cells, and no level to change', () => {
    expect(who('/', {})).toEqual(['owner', 'admin', 'head', 'member', 'church'])
  })
})

describe('the pages that had one level and no choice (0277)', () => {
  it('open as they always did while nothing is changed', () => {
    // Volunteers starts as the Admins' alone; the three team pages as anybody's on a team; Songs as everybody's.
    expect(who('/volunteers', {})).toEqual(['owner', 'admin'])
    for (const path of ['/availability', '/checklists', '/team-chat']) expect(who(path, {}), path).toEqual(['owner', 'admin', 'head', 'member'])
    expect(who('/songs', {})).toEqual(['owner', 'admin', 'head', 'member', 'church'])
  })

  it('open Volunteers to Heads, or to one team’s members, as the church says', () => {
    expect(who('/volunteers', { 'page.volunteers': { head: 'all', assistant: 'all' } })).toEqual(['owner', 'admin', 'head'])
    expect(who('/volunteers', { 'page.volunteers': { admin: 'none' } })).toEqual(['owner'])
  })

  it('keep a team page to its Heads, and Songs to teams', () => {
    expect(who('/availability', { 'page.availability': { member: 'none' } })).toEqual(['owner', 'admin', 'head'])
    expect(who('/songs', { 'page.songs': { newcomer: 'none' } })).toEqual(['owner', 'admin', 'head', 'member'])
  })

  it('let the four pages a Team Member always opened be kept from them too', () => {
    for (const [path, cap] of [['/rota', 'page.rota'], ['/polls', 'page.polls'], ['/departments', 'page.departments']] as const) {
      expect(who(path, { [cap]: { member: 'none', newcomer: 'none' } }), path).toEqual(['owner', 'admin', 'head'])
      expect(who(path, { [cap]: { member: 'none', newcomer: 'none', head: 'none', assistant: 'none', admin: 'none' } }), path).toEqual(['owner'])
    }
  })

  it('opens Feedback by its own rows: whoever may send it, and whoever reads everybody’s', () => {
    // Anybody on a team out of the box; a Church Member is not.
    expect(who('/feedback', {})).toEqual(['owner', 'admin', 'head', 'member'])
    expect(who('/feedback', { 'feedback.send': { newcomer: 'all' } })).toEqual(['owner', 'admin', 'head', 'member', 'church'])
    expect(who('/feedback', { 'feedback.send': { member: 'none', head: 'none', assistant: 'none' } })).toEqual(['owner', 'admin'])
    // Closed to send, but given the reading of it: still opens.
    expect(who('/feedback', { 'feedback.send': { admin: 'none' }, 'feedback.manage': { admin: 'all' } })).toContain('admin')
  })
})
