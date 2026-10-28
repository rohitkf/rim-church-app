import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type AppSettings } from './appSettings'
import { explainCapability, explainFixed, grantsFor, openingFor, profilesOf, type PersonFacts } from './personAccess'
import type { PermissionGrant } from './permissions'
import type { Capability } from './permissionMatrix'

const WORSHIP = 'worship'
const MEDIA = 'media'
const TEAMS = [WORSHIP, MEDIA]

const person = (over: Partial<PersonFacts> = {}): PersonFacts => ({
  id: 'p1',
  owner: false,
  admin: false,
  overwatch: false,
  pastor: false,
  headTeams: [],
  assistTeams: [],
  memberTeams: [],
  coordinatorTeams: [],
  ...over,
})

const settings = (over: Partial<AppSettings> = {}): AppSettings => ({ ...DEFAULT_SETTINGS, ...over })

describe('what one person may do, and why', () => {
  it('is everything, everywhere, for the Owner', () => {
    expect(explainCapability(person({ owner: true }), 'rota.assign', {}, {}, TEAMS, settings())).toEqual({
      kind: 'everywhere',
      via: 'owner',
    })
  })

  it('is everywhere for an Admin, as an Admin', () => {
    expect(explainCapability(person({ admin: true }), 'rota.assign', {}, {}, TEAMS, settings())).toEqual({
      kind: 'everywhere',
      via: 'admin',
    })
  })

  it('is their own team for a Head, as its Head', () => {
    const head = person({ headTeams: [WORSHIP], memberTeams: [WORSHIP] })
    expect(explainCapability(head, 'rota.assign', {}, {}, TEAMS, settings())).toEqual({
      kind: 'teams',
      teams: [{ id: WORSHIP, via: 'head' }],
      church: null,
    })
  })

  it('says where a team’s own rule narrows a church-wide yes', () => {
    // The church lets Heads assign anybody's rota; Worship keeps its own
    // to its own Head.
    const head = person({ headTeams: [MEDIA], memberTeams: [MEDIA] })
    const answer = explainCapability(
      head,
      'rota.assign',
      { 'rota.assign': { head: 'all' } },
      { [WORSHIP]: { 'rota.assign': { head: 'team' } } },
      TEAMS,
      settings(),
    )
    expect(answer).toEqual({ kind: 'teams', teams: [{ id: MEDIA, via: 'head' }], church: 'head' })
  })

  it('is only their own where that is all the grid gives', () => {
    const member = person({ memberTeams: [WORSHIP] })
    expect(
      explainCapability(member, 'avail.history', { 'avail.history': { member: 'own' } }, {}, TEAMS, settings()),
    ).toEqual({ kind: 'own', via: 'member' })
  })

  it('is nothing for a Church Member the grid gives nothing', () => {
    expect(explainCapability(person(), 'rota.assign', {}, {}, TEAMS, settings())).toEqual({ kind: 'none' })
  })

  it('counts Overwatch’s own cells, as Overwatch (0214)', () => {
    const watcher = person({ overwatch: true })
    expect(explainCapability(watcher, 'msg.chat', {}, {}, TEAMS, settings())).toEqual({
      kind: 'everywhere',
      via: 'overwatch',
    })
    expect(explainCapability(watcher, 'msg.chat', { 'msg.chat': { overwatch: 'none' } }, {}, TEAMS, settings())).toEqual({
      kind: 'none',
    })
    // A page closed to Overwatch closes its cell with it.
    expect(
      explainCapability(watcher, 'msg.chat', {}, {}, TEAMS, settings({ overwatch_pages: { 'team-chat': false } })),
    ).toEqual({ kind: 'none' })
  })

  it('gives a thing done as Overwatch to Overwatch alone, not even the Owner', () => {
    expect(explainCapability(person({ overwatch: true }), 'issue.as_overwatch', {}, {}, TEAMS, settings())).toEqual({
      kind: 'everywhere',
      via: 'overwatch',
    })
    expect(explainCapability(person({ owner: true }), 'issue.as_overwatch', {}, {}, TEAMS, settings())).toEqual({
      kind: 'none',
    })
  })

  it('says what Overwatch reads through its pages, without a cell of its own', () => {
    const watcher = person({ overwatch: true })
    expect(explainCapability(watcher, 'clockin.view', {}, {}, TEAMS, settings())).toEqual({ kind: 'everywhere', via: 'overwatch' })
    expect(
      explainCapability(watcher, 'clockin.view', {}, {}, TEAMS, settings({ overwatch_pages: { 'clock-in': false } })),
    ).toEqual({ kind: 'none' })
  })

  it('counts a Pastor’s column, as Pastor (0214)', () => {
    expect(explainCapability(person({ pastor: true }), 'prayer.pastoral', {}, {}, TEAMS, settings())).toEqual({
      kind: 'everywhere',
      via: 'pastor',
    })
    expect(explainCapability(person({ pastor: true }), 'rota.assign', {}, {}, TEAMS, settings())).toEqual({ kind: 'none' })
  })
})

describe('a row the grid does not set', () => {
  const row: Capability = {
    action: 'See their team’s register',
    can: {
      owner: 'yes',
      admin: 'yes',
      overwatch: 'no',
      pastor: 'no',
      head: 'team',
      assistant: 'team',
      coordinator: 'no',
      member: 'own',
      newcomer: 'no',
    },
  }

  it('takes the widest answer of the profiles they hold, and names it', () => {
    expect(explainFixed(person({ memberTeams: [WORSHIP] }), row)).toEqual({ allowed: 'own', via: 'member' })
    expect(explainFixed(person({ headTeams: [WORSHIP], memberTeams: [WORSHIP] }), row)).toEqual({
      allowed: 'team',
      via: 'head',
    })
    expect(explainFixed(person(), row)).toEqual({ allowed: 'no', via: null })
  })

  it('follows the page, where the row is a page', () => {
    const rota: Capability = {
      action: 'See the rota',
      page: '/rota',
      can: {
        owner: 'yes',
        admin: 'yes',
        overwatch: 'yes',
        pastor: 'no',
        head: 'yes',
        assistant: 'yes',
        coordinator: 'yes',
        member: 'yes',
        newcomer: 'no',
      },
    }
    expect(explainFixed(person(), rota, settings())).toEqual({ allowed: 'no', via: null })
    expect(explainFixed(person({ memberTeams: [WORSHIP] }), rota, settings())).toEqual({ allowed: 'yes', via: 'member' })
    expect(explainFixed(person({ overwatch: true }), rota, settings())).toEqual({ allowed: 'yes', via: 'overwatch' })
    expect(explainFixed(person({ overwatch: true }), rota, settings({ overwatch_pages: { rota: false } }))).toEqual({
      allowed: 'no',
      via: null,
    })
  })

  it('lists a person’s profiles widest first, a Church Member always last', () => {
    expect(profilesOf(person({ admin: true, memberTeams: [WORSHIP] }))).toEqual(['admin', 'member', 'newcomer'])
    expect(profilesOf(person({ overwatch: true, pastor: true }))).toEqual(['overwatch', 'pastor', 'newcomer'])
  })
})

describe('the pages they can open', () => {
  it('follows the page’s level', () => {
    expect(openingFor(person(), '/rota', settings())).toEqual({ open: false, level: 'team' })
    expect(openingFor(person({ memberTeams: [WORSHIP] }), '/rota', settings())).toEqual({
      open: true,
      via: 'level',
      level: 'team',
    })
  })

  it('opens Clock In to whoever the grid gives clockin.view (0209), and not otherwise', () => {
    expect(openingFor(person({ memberTeams: [WORSHIP] }), '/clock-in', settings(), { clockInViewer: true })).toMatchObject({
      open: true,
      via: 'clock-in',
    })
    expect(openingFor(person({ memberTeams: [WORSHIP] }), '/clock-in', settings())).toMatchObject({ open: false })
  })

  it('opens Prayer Requests to a Pastor, whatever its level', () => {
    const closed = settings({ page_access: { prayer: 'team' } })
    expect(openingFor(person({ pastor: true }), '/prayer', closed)).toMatchObject({ open: true, via: 'pastoral' })
  })

  it('opens Prayer Requests to whoever the grid gives prayer.pastoral (0210)', () => {
    const closed = settings({ page_access: { prayer: 'team' } })
    expect(openingFor(person(), '/prayer', closed, { prayerCarer: true })).toMatchObject({ open: true, via: 'pastoral' })
    expect(openingFor(person(), '/prayer', closed)).toMatchObject({ open: false })
  })

  it('opens to Overwatch what the church left open to it', () => {
    expect(openingFor(person({ overwatch: true }), '/rota', settings())).toMatchObject({ open: true, via: 'overwatch' })
  })
})

describe('the grants that reach somebody', () => {
  const g = (over: Partial<PermissionGrant>): PermissionGrant => ({ capability: 'clockin.approve', userId: null, departmentId: WORSHIP, reach: 'all', ...over })
  it('carries a team’s grant to everybody on it, and a Heads-only one to its Heads alone (0213)', () => {
    const member = person({ memberTeams: [WORSHIP] })
    const head = person({ headTeams: [WORSHIP], memberTeams: [WORSHIP] })
    expect(grantsFor(member, [g({})])).toHaveLength(1)
    expect(grantsFor(member, [g({ leadsOnly: true })])).toEqual([])
    expect(grantsFor(head, [g({ leadsOnly: true })])).toHaveLength(1)
    expect(grantsFor(person({ assistTeams: [WORSHIP] }), [g({ leadsOnly: true })])).toHaveLength(1)
  })
  it('says a grant by name before a team’s', () => {
    const asha = person({ memberTeams: [WORSHIP] })
    expect(grantsFor(asha, [g({}), g({ userId: 'p1', departmentId: null })]).map((h) => h.teamId)).toEqual([null, WORSHIP])
  })
})
