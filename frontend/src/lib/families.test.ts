import { describe, expect, it, vi } from 'vitest'
import migration from '../../../supabase/migrations/0326_every_family_on_one_page.sql?raw'

vi.mock('./supabaseClient', () => ({ supabase: {} }))

import {
  anchorOf,
  combineFamilies,
  familyCount,
  familyMatches,
  familyTitle,
  groupAnchor,
  groupCount,
  groupMatches,
  groupTitle,
  nameMatches,
  onTheirOwn,
  type Family,
  type FamilyMember,
} from './families'

const m = (id: string, kind: 'adult' | 'child', first: string, last: string, account = true): FamilyMember => ({
  id: `row-${id}`,
  user_id: account ? id : null,
  kind,
  first_name: first,
  last_name: last,
})
const family = (id: string, members: FamilyMember[]): Family => ({ id, members })

const jacobs = family('h1', [m('anna', 'adult', 'Anna', 'Jacob'), m('tom', 'adult', 'Tom', 'Jacob'), m('kid', 'child', 'Kid', 'Jacob'), m('zak', 'child', 'Zak', 'Jacob', false)])

describe('what a family is called', () => {
  it('is its adults, sharing a last name where they do', () => {
    expect(familyTitle(jacobs)).toBe('Anna & Tom Jacob')
  })

  it('names each in full where they do not share one', () => {
    expect(familyTitle(family('h', [m('a', 'adult', 'Anna', 'Jacob'), m('b', 'adult', 'Tom', 'Mathew')]))).toBe('Anna Jacob & Tom Mathew')
  })

  it('is one name for a parent alone with children', () => {
    expect(familyTitle(family('h', [m('g', 'adult', 'Gran', 'Thomas'), m('a', 'child', 'Anna', 'Jacob')]))).toBe('Gran Thomas')
  })

  it('does not make a shared last name out of two people with none', () => {
    expect(familyTitle(family('h', [m('a', 'adult', 'Madonna', ''), m('b', 'adult', 'Cher', '')]))).toBe('Madonna & Cher')
  })

  it('counts its adults and its children in words', () => {
    expect(familyCount(jacobs)).toBe('2 adults, 2 children')
    expect(familyCount(family('h', [m('g', 'adult', 'Gran', 'T'), m('a', 'child', 'Anna', 'J')]))).toBe('1 adult, 1 child')
    expect(familyCount(family('h', [m('a', 'adult', 'A', 'J'), m('b', 'adult', 'B', 'J')]))).toBe('2 adults')
  })

  it('calls brothers and sisters with no parent listed by all of them (0328)', () => {
    const two = family('h', [m('s', 'child', 'Sue', 'Thomas'), m('t', 'child', 'Tom', 'Thomas')])
    expect(familyTitle(two)).toBe('Sue & Tom Thomas')
    expect(familyCount(two)).toBe('2 brothers and sisters')
    // One child left behind in a household is not brothers and sisters.
    expect(familyCount(family('h', [m('s', 'child', 'Sue', 'Thomas')]))).toBe('1 child')
  })
})

describe('finding somebody', () => {
  it('matches every word typed, in any order and any case', () => {
    expect(nameMatches('Anna Jacob', 'jacob an')).toBe(true)
    expect(nameMatches('Anna Jacob', 'ANNA')).toBe(true)
    expect(nameMatches('Anna Jacob', 'anna thomas')).toBe(false)
    expect(nameMatches('Anna Jacob', '   ')).toBe(true)
  })

  it('finds a name with an accent typed without one', () => {
    expect(nameMatches('José Núñez', 'jose nunez')).toBe(true)
  })

  it('finds a family by anybody in it, the written-in included', () => {
    expect(familyMatches(jacobs, 'tom')).toBe(true)
    expect(familyMatches(jacobs, 'zak')).toBe(true)
    expect(familyMatches(jacobs, 'thomas')).toBe(false)
  })
})

describe('who is not linked to anybody', () => {
  const people = ['anna', 'tom', 'kid', 'alone'].map((id) => ({ id, first_name: id, last_name: 'T' }))

  it('is everybody with an account who is in no family', () => {
    expect(onTheirOwn(people, [jacobs]).map((p) => p.id)).toEqual(['alone'])
    expect(onTheirOwn(people, []).map((p) => p.id)).toEqual(['anna', 'tom', 'kid', 'alone'])
  })

  it('does not count somebody written in by hand as an account', () => {
    // "zak" is written in: an account called zak is still on its own.
    expect(onTheirOwn([{ id: 'zak', first_name: 'Zak', last_name: 'Jacob' }], [jacobs]).map((p) => p.id)).toEqual(['zak'])
  })
})

describe('where a family is opened from', () => {
  it('is its first adult with an account', () => {
    expect(anchorOf(jacobs)?.user_id).toBe('anna')
    expect(anchorOf(family('h', [m('w', 'adult', 'Written', 'In', false), m('tom', 'adult', 'Tom', 'Jacob')]))?.user_id).toBe('tom')
  })

  it('is a child with an account where no adult has one, and nobody where nobody has', () => {
    expect(anchorOf(family('h', [m('w', 'adult', 'Written', 'In', false), m('kid', 'child', 'Kid', 'Jacob')]))?.user_id).toBe('kid')
    expect(anchorOf(family('h', [m('w', 'adult', 'W', 'I', false), m('x', 'child', 'X', 'I', false)]))).toBeNull()
  })
})

/*
 * What the page is sent is names and nothing else: a family's address and
 * a child's date of birth stay with the family and `people.contacts`.
 */
describe('what families() hands over', () => {
  const body = migration.slice(migration.indexOf('create or replace function public.families()'))

  it('is for whoever may link families, and nobody signed out', () => {
    expect(body).toContain("not public.may(auth.uid(), 'people.family')")
    expect(body).toContain('revoke all on function public.families() from public, anon;')
  })

  it('is names: no address, date of birth, school or year', () => {
    const built = [...body.matchAll(/'([a-z_]+)',/g)].map((x) => x[1])
    expect(built).toEqual(['id', 'members', 'id', 'user_id', 'kind', 'first_name', 'last_name'])
    for (const kept of ['address', 'postcode', 'town', 'dob', 'school', 'year_group', 'gender', 'phone', 'email']) expect(body).not.toContain(kept)
  })

  it('leaves out a household of one, which is somebody not linked to anybody', () => {
    expect(body).toContain('having count(*) >= 2')
  })
})

describe('households that are one family', () => {
  // A row is a person in one household: somebody in two has two rows and one account.
  const row = (id: string, account: string | null, kind: 'adult' | 'child', first: string, last: string): FamilyMember => ({
    id,
    user_id: account,
    kind,
    first_name: first,
    last_name: last,
  })
  // Rohit wrote his parents in; Jolsna is his wife.
  const parents = family('p1', [row('f', null, 'adult', 'Father', 'Test'), row('mo', null, 'adult', 'Mother', 'Test'), row('r1', 'rohit', 'child', 'Rohit', 'Test')])
  const own = family('h1', [row('r2', 'rohit', 'adult', 'Rohit', 'Test'), row('j', 'jolsna', 'adult', 'Jolsna', 'Test'), row('k', null, 'child', 'Kid', 'Test')])
  const names = (members: FamilyMember[]) => members.map((x) => `${x.first_name}${x.user_id ? '' : '*'}`)

  it('are listed once: a man’s parents and his own household are one family, called by the people on the app', () => {
    const joined = combineFamilies([parents, own])
    expect(joined).toHaveLength(1)
    expect(groupTitle(joined[0])).toBe('Rohit & Jolsna Test')
    expect(joined[0].id).toBe('h1')
    // The older generation first, and Rohit once, beside his wife and not among his parents’ children.
    expect(names(joined[0].members)).toEqual(['Father*', 'Mother*', 'Rohit', 'Jolsna', 'Kid*'])
    expect(groupCount(joined[0])).toBe('5 people, 2 generations')
    expect(groupAnchor(joined[0])?.user_id).toBe('rohit')
  })

  it('does not matter which way round the database hands them over', () => {
    const joined = combineFamilies([own, parents])
    expect(joined).toHaveLength(1)
    expect(names(joined[0].members)).toEqual(['Father*', 'Mother*', 'Rohit', 'Jolsna', 'Kid*'])
  })

  it('joins by any chain: his parents, their own household, and her parents', () => {
    const hers = family('p2', [row('jf', 'jdad', 'adult', 'Jacob', 'Mathew'), row('j1', 'jolsna', 'child', 'Jolsna', 'Test')])
    const joined = combineFamilies([parents, own, hers])
    expect(joined).toHaveLength(1)
    expect(names(joined[0].members)).toEqual(['Father*', 'Mother*', 'Jacob', 'Rohit', 'Jolsna', 'Kid*'])
    // Two of its adults are on the app, against one of her parents’ and none of his.
    expect(groupTitle(joined[0])).toBe('Rohit & Jolsna Test')
  })

  it('is called by the older generation when both are as much on the app', () => {
    const gran = family('g', [row('g1', 'gran', 'adult', 'Gran', 'Thomas'), row('g2', 'grandad', 'adult', 'Grandad', 'Thomas'), row('a1', 'anna', 'child', 'Anna', 'Jacob')])
    const annas = family('a', [row('a2', 'anna', 'adult', 'Anna', 'Jacob'), row('t', 'tom', 'adult', 'Tom', 'Jacob')])
    expect(groupTitle(combineFamilies([annas, gran])[0])).toBe('Gran & Grandad Thomas')
  })

  it('leaves families that share nobody apart, in the order they came', () => {
    const others = family('o', [row('x', 'xavier', 'adult', 'Xavier', 'Paul'), row('y', 'yara', 'adult', 'Yara', 'Paul')])
    const joined = combineFamilies([others, parents, own])
    expect(joined.map(groupTitle)).toEqual(['Xavier & Yara Paul', 'Rohit & Jolsna Test'])
    // One household alone is counted the way it always was.
    expect(groupCount(joined[0])).toBe('2 adults')
  })

  it('keeps a child with an account who has no household of their own among the children', () => {
    const withTeen = family('h2', [row('r2', 'rohit', 'adult', 'Rohit', 'Test'), row('teen', 'teen', 'child', 'Teen', 'Test')])
    expect(names(combineFamilies([parents, withTeen])[0].members)).toEqual(['Father*', 'Mother*', 'Rohit', 'Teen'])
  })

  it('counts brothers and sisters with their own households as people, not as a generation', () => {
    const siblings = family('s', [row('b1', 'bill', 'child', 'Bill', 'Jacob'), row('m1', 'mary', 'child', 'Mary', 'Jacob')])
    const bills = family('hb', [row('b2', 'bill', 'adult', 'Bill', 'Jacob'), row('w', null, 'adult', 'Wendy', 'Jacob')])
    const joined = combineFamilies([siblings, bills])
    expect(joined).toHaveLength(1)
    expect(names(joined[0].members)).toEqual(['Bill', 'Wendy*', 'Mary'])
    expect(groupCount(joined[0])).toBe('3 people')
  })

  it('is found by anybody in any of its households', () => {
    const [joined] = combineFamilies([parents, own])
    expect(groupMatches(joined, 'mother')).toBe(true)
    expect(groupMatches(joined, 'jolsna')).toBe(true)
    expect(groupMatches(joined, 'nobody')).toBe(false)
  })

  it('does not go round for ever on households that name each other as parents', () => {
    const a = family('a', [row('a1', 'ann', 'adult', 'Ann', 'A'), row('b1', 'bob', 'child', 'Bob', 'B')])
    const b = family('b', [row('b2', 'bob', 'adult', 'Bob', 'B'), row('a2', 'ann', 'child', 'Ann', 'A')])
    expect(combineFamilies([a, b])).toHaveLength(1)
  })

  it('makes nothing of nothing', () => {
    expect(combineFamilies([])).toEqual([])
  })
})

