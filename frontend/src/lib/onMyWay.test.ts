import { describe, expect, it, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
vi.mock('./supabaseClient', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }))

import {
  MINUTE_CHOICES,
  arrivalWords,
  cardShows,
  choicesWith,
  fetchTeamArrivals,
  minutesAway,
  orderPeople,
  sayOnMyWay,
  teamsFor,
  type ArrivalPerson,
  type TeamArrivals,
} from './onMyWay'
import migration from '../../../supabase/migrations/0337_on_my_way.sql?raw'

beforeEach(() => rpc.mockReset())

describe('how long from how far: a rough answer, on the late side', () => {
  it('is never under five minutes, and always a round five', () => {
    for (const m of [0, 40, 150, 599, 600, 1234, 9999, 55_000]) {
      const minutes = minutesAway(m)
      expect(minutes).toBeGreaterThanOrEqual(5)
      expect(minutes % 5).toBe(0)
    }
  })

  it('walks the last few hundred metres, and drives the rest', () => {
    expect(minutesAway(200)).toBe(5)
    expect(minutesAway(500)).toBe(10)
    // Either side of where walking gives way to driving: no jump.
    expect(minutesAway(590)).toBe(10)
    expect(minutesAway(610)).toBe(10)
  })

  it('gives what somebody who drives it would say', () => {
    expect(minutesAway(2_000)).toBe(15)
    expect(minutesAway(5_000)).toBe(20)
    expect(minutesAway(10_000)).toBe(30)
    expect(minutesAway(20_000)).toBe(35)
    expect(minutesAway(40_000)).toBe(60)
  })

  it('never gets shorter as the distance grows', () => {
    let before = 0
    for (let m = 0; m <= 120_000; m += 250) {
      const minutes = minutesAway(m)
      expect(minutes).toBeGreaterThanOrEqual(before)
      before = minutes
    }
  })

  it('stops at the four hours the database takes, and takes nonsense as far away', () => {
    expect(minutesAway(900_000)).toBe(240)
    expect(minutesAway(Number.NaN)).toBe(240)
    expect(minutesAway(-5)).toBe(5)
  })
})

describe('the times to choose from', () => {
  it('are a handful, in order', () => {
    expect(MINUTE_CHOICES).toEqual([5, 10, 15, 20, 30, 45, 60])
  })
  it('take in an estimate that is not one of them, in its place', () => {
    expect(choicesWith(35)).toEqual([5, 10, 15, 20, 30, 35, 45, 60])
    expect(choicesWith(20)).toEqual(MINUTE_CHOICES)
    expect(choicesWith(90)).toEqual([5, 10, 15, 20, 30, 45, 60, 90])
    expect(choicesWith(null)).toEqual(MINUTE_CHOICES)
  })
})

const person = (over: Partial<ArrivalPerson> = {}): ArrivalPerson => ({
  id: 'p1',
  first_name: 'Grace',
  last_name: 'Mensah',
  on_rota: true,
  state: 'none',
  eta_at: null,
  said_at: null,
  ...over,
})
const at = (h: number, m: number) => new Date(2026, 10, 29, h, m).toISOString()
const NOW = new Date(2026, 10, 29, 7, 10).getTime()

describe('what a team reads beside each name', () => {
  const clock = (iso: string) => new Date(iso).toTimeString().slice(0, 5)
  it('says here, with no time: when somebody arrived is the Clock In page’s', () => {
    expect(arrivalWords(person({ state: 'here' }), NOW, at(7, 0), clock)).toEqual({ label: 'Here', tone: 'green', detail: null })
  })
  it('says about when, and how long that is', () => {
    expect(arrivalWords(person({ state: 'coming', eta_at: at(7, 30) }), NOW, at(7, 0), clock)).toEqual({ label: 'About 07:30', tone: 'blue', detail: 'in 20 min' })
    expect(arrivalWords(person({ state: 'coming', eta_at: at(8, 40) }), NOW, at(7, 0), clock).detail).toBe('in 1 hr 30 min')
    expect(arrivalWords(person({ state: 'coming', eta_at: at(7, 11) }), NOW, at(7, 0), clock).detail).toBe('any minute')
  })
  it('says so when the time they gave has gone and they are not in', () => {
    expect(arrivalWords(person({ state: 'coming', eta_at: at(7, 0) }), NOW, at(7, 0), clock)).toEqual({ label: 'Said 07:00', tone: 'orange', detail: 'not in yet' })
  })
  it('says they cannot make it', () => {
    expect(arrivalWords(person({ state: 'not_coming' }), NOW, at(7, 0), clock)).toEqual({ label: 'Can’t make it', tone: 'red', detail: null })
  })
  it('says nothing has been heard only once the call time has come', () => {
    expect(arrivalWords(person(), NOW, at(7, 0), clock)).toEqual({ label: 'No word', tone: 'orange', detail: null })
    expect(arrivalWords(person(), NOW, at(8, 0), clock)).toEqual({ label: 'Not due yet', tone: 'neutral', detail: null })
  })
})

describe('the order of a team', () => {
  it('puts who is still to come first, soonest first, and who is here last', () => {
    const people = [
      person({ id: 'a', first_name: 'Asha', state: 'here' }),
      person({ id: 'b', first_name: 'Ben', state: 'none' }),
      person({ id: 'c', first_name: 'Cara', state: 'coming', eta_at: at(7, 40) }),
      person({ id: 'd', first_name: 'Dan', state: 'coming', eta_at: at(7, 20) }),
      person({ id: 'e', first_name: 'Esi', state: 'not_coming' }),
    ]
    expect(orderPeople(people).map((p) => p.first_name)).toEqual(['Dan', 'Cara', 'Ben', 'Esi', 'Asha'])
  })
})

const arrivals = (over: Partial<TeamArrivals> = {}): TeamArrivals => ({
  on: true,
  on_date: '2026-11-29',
  due: true,
  first_call: at(7, 0),
  closes_at: at(13, 0),
  clocked: false,
  word: null,
  eta_at: null,
  said_at: null,
  sees_all: false,
  teams: [
    { id: 't1', name: 'Media', color: '#a855f7', mine: true, on_duty: true, call_at: at(7, 0), people: [person()] },
    { id: 't2', name: 'Worship', color: null, mine: false, on_duty: false, call_at: at(8, 0), people: [person({ id: 'p2' })] },
  ],
  ...over,
})

describe('which teams somebody is shown', () => {
  it('are their own, and every one only for whoever sees clock-ins', () => {
    expect(teamsFor(arrivals(), { seesAll: false, teamIds: ['t1'], previewing: false }).map((t) => t.name)).toEqual(['Media'])
    expect(teamsFor(arrivals(), { seesAll: true, teamIds: [], previewing: false }).map((t) => t.name)).toEqual(['Media', 'Worship'])
  })
  it('shows a team they were put on for the day though it is not theirs', () => {
    const borrowed = arrivals({ teams: [{ ...arrivals().teams[1], on_duty: true, mine: true }] })
    expect(teamsFor(borrowed, { seesAll: false, teamIds: [], previewing: false }).map((t) => t.name)).toEqual(['Worship'])
  })
  it('in a preview shows only what that standing would be given: the previewer’s own rota is not the preview’s', () => {
    // An Admin on the rota for Media, previewing as a Church Member: nothing.
    expect(teamsFor(arrivals(), { seesAll: false, teamIds: [], previewing: true })).toEqual([])
    // Previewing as a member of Worship: Worship, not their own Media.
    expect(teamsFor(arrivals(), { seesAll: false, teamIds: ['t2'], previewing: true }).map((t) => t.name)).toEqual(['Worship'])
  })
})

describe('when the card is on the Dashboard', () => {
  const two = arrivals().teams
  it('is there from two hours before the first of the teams is called until the day’s services end', () => {
    expect(cardShows(arrivals(), two, new Date(2026, 10, 29, 4, 59).getTime())).toBe(false)
    expect(cardShows(arrivals(), two, new Date(2026, 10, 29, 5, 0).getTime())).toBe(true)
    expect(cardShows(arrivals(), two, new Date(2026, 10, 29, 12, 59).getTime())).toBe(true)
    expect(cardShows(arrivals(), two, new Date(2026, 10, 29, 13, 0).getTime())).toBe(false)
  })
  it('is not there with no team to show, or switched off', () => {
    expect(cardShows(arrivals(), [], NOW)).toBe(false)
    expect(cardShows(arrivals({ on: false }), two, NOW)).toBe(false)
    expect(cardShows(undefined, two, NOW)).toBe(false)
  })
})

describe('asking the database', () => {
  it('reads today’s teams, and takes an answer with nobody in it', async () => {
    rpc.mockResolvedValue({ data: { on: true, on_date: '2026-11-29', due: false, teams: [] }, error: null })
    const got = await fetchTeamArrivals()
    expect(rpc).toHaveBeenCalledWith('team_arrivals')
    expect(got).toMatchObject({ on: true, due: false, teams: [], clocked: false, word: null, sees_all: false })
  })

  it('sends a number of minutes and how it was arrived at, and never a place', async () => {
    rpc.mockResolvedValue({ data: { word: 'coming', eta_at: at(7, 30), how: 'estimate', said_at: at(7, 10) }, error: null })
    await sayOnMyWay({ word: 'coming', minutes: 20, how: 'estimate' })
    expect(rpc).toHaveBeenCalledWith('on_my_way_say', { p_word: 'coming', p_minutes: 20, p_how: 'estimate' })
    rpc.mockResolvedValue({ data: { word: 'not_coming', eta_at: null, how: null, said_at: at(7, 10) }, error: null })
    await sayOnMyWay({ word: 'not_coming' })
    expect(rpc).toHaveBeenLastCalledWith('on_my_way_say', { p_word: 'not_coming', p_minutes: null, p_how: 'chosen' })
  })
})

describe('what the database keeps (0337)', () => {
  const table = migration.slice(migration.indexOf('create table if not exists public.on_my_way'), migration.indexOf('comment on table public.on_my_way'))
  it('is a time and a word, with nowhere to put a place', () => {
    expect(table).not.toMatch(/lat|lng|longitude|distance|accuracy|address/i)
    expect(migration).not.toMatch(/on_my_way_say\([^)]*(lat|lng|double precision)/i)
  })
  it('keeps the table to its own person, and the helpers off the API', () => {
    expect(migration).toContain('alter table public.on_my_way enable row level security;')
    expect(migration).toContain('for select to authenticated using (user_id = (select auth.uid()));')
    for (const helper of ['on_my_way_tell_heads(uuid, date, text)', 'send_on_my_way_asks()', 'delete_old_on_my_way()']) {
      expect(migration).toContain(`revoke all on function public.${helper} from public, anon, authenticated;`)
    }
    expect(migration).toContain('revoke all on function public.team_arrivals() from public, anon;')
    expect(migration).toContain('revoke all on function public.on_my_way_say(text, integer, text) from public, anon;')
  })
  it('gives "here" no time, and goes overnight', () => {
    expect(migration).toContain("'eta_at', case when x.state = 'coming' then x.eta_at end,")
    expect(migration).toContain('delete from public.on_my_way where on_date < public.church_today();')
  })
})
