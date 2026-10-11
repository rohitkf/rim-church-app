import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabaseClient', () => ({ supabase: {} }))

import { dobWithAge, myFamily, nameOf, type HouseholdMember } from './family'

const m = (over: Partial<HouseholdMember>): HouseholdMember => ({
  id: 'x',
  household_id: 'home',
  kind: 'child',
  user_id: null,
  first_name: null,
  last_name: null,
  dob: null,
  gender: null,
  school: null,
  year_group: null,
  person: null,
  ...over,
})

describe('my family, from what the database returns', () => {
  const data = {
    households: [
      { id: 'home', address_line1: '1 High St', address_line2: null, town: 'Leeds', postcode: 'LS1 1AA' },
      { id: 'parents', address_line1: null, address_line2: null, town: null, postcode: null },
    ],
    members: [
      m({ id: 'me', kind: 'adult', user_id: 'u1' }),
      m({ id: 'sp', kind: 'adult', user_id: 'u2', person: { id: 'u2', first_name: 'Grace', last_name: 'M', dob: '1990-04-02' } }),
      m({ id: 'k1', first_name: 'Ann', last_name: 'M' }),
      m({ id: 'me2', household_id: 'parents', kind: 'child', user_id: 'u1' }),
      m({ id: 'dad', household_id: 'parents', kind: 'adult', first_name: 'Dad', last_name: 'M' }),
    ],
  }

  it('finds my home, my spouse, my children and my parents', () => {
    const f = myFamily(data, 'u1')
    expect(f.home?.town).toBe('Leeds')
    expect(f.spouse?.id).toBe('sp')
    expect(f.children.map((c) => c.id)).toEqual(['k1'])
    expect(f.parents.map((p) => p.id)).toEqual(['dad'])
  })

  it('names a linked person from their profile, and a written one from the entry', () => {
    expect(nameOf(data.members[1])).toBe('Grace M')
    expect(nameOf(data.members[2])).toBe('Ann M')
  })

  it('has nothing to show for somebody with no household', () => {
    const f = myFamily(data, 'nobody')
    expect([f.home, f.spouse, f.children.length, f.parents.length]).toEqual([null, null, 0, 0])
  })

  it('says a date of birth with the age', () => {
    expect(dobWithAge('2015-03-12', new Date('2026-10-11T12:00:00'))).toMatch(/2015 \(11\)$/)
    expect(dobWithAge(null)).toBe('')
  })
})
