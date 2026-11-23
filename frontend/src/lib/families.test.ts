import { describe, expect, it, vi } from 'vitest'
import migration from '../../../supabase/migrations/0326_every_family_on_one_page.sql?raw'

vi.mock('./supabaseClient', () => ({ supabase: {} }))

import { anchorOf, familyCount, familyMatches, familyTitle, nameMatches, onTheirOwn, type Family, type FamilyMember } from './families'

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
