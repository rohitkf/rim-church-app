import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type AppSettings } from './appSettings'
import { explainCapability, explainFixed, namedFor, openingFor, profilesOf, type PersonFacts } from './personAccess'
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
const name = (id: string) => (id === WORSHIP ? 'Worship' : 'Media')

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

  it('counts Overwatch’s own switches, as Overwatch', () => {
    const watcher = person({ overwatch: true })
    expect(explainCapability(watcher, 'msg.chat', {}, {}, TEAMS, settings())).toEqual({
      kind: 'everywhere',
      via: 'overwatch',
    })
    expect(explainCapability(watcher, 'msg.chat', {}, {}, TEAMS, settings({ overwatch_chat_posts: false }))).toEqual({
      kind: 'none',
    })
  })
})

describe('a row the grid does not set', () => {
  const row: Capability = {
    action: 'See their team’s register',
    can: { owner: 'yes', admin: 'yes', head: 'team', assistant: 'team', coordinator: 'no', member: 'own', newcomer: 'no' },
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
      can: { owner: 'yes', admin: 'yes', head: 'yes', assistant: 'yes', coordinator: 'yes', member: 'yes', newcomer: 'no' },
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

describe('the lists outside the grid', () => {
  it('names each list that carries them, and how', () => {
    const s = settings({
      // The grid's since 0209 and 0210, so no longer lists said here.
      clock_in_viewers: { teams: [WORSHIP], people: [] },
      prayer_assigners: { teams: [], people: ['p1'] },
      clock_in_approver_teams: [WORSHIP],
      clock_in_approvers: 'members',
      planner_controls: { teams: { [WORSHIP]: ['start'] }, people: {} },
    })
    const named = namedFor(
      person({ memberTeams: [WORSHIP] }),
      s,
      [
        {
          department_id: WORSHIP,
          can_add: true,
          can_edit: false,
          can_delete: false,
          can_comment: true,
          can_templates: false,
        },
      ],
      name,
    )
    expect(named.map((n) => `${n.what} — ${n.because}`)).toEqual([
      'Approves requests to be clocked in — Through Worship',
      'May add to the stage — Through Worship',
      'May comment on it — Through Worship',
    ])
  })

  it('is empty for somebody no list names', () => {
    expect(namedFor(person(), settings(), [], name)).toEqual([])
  })
})
