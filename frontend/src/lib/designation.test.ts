import { describe, expect, it } from 'vitest'
import {
  DESIGNATION_RANK,
  designationOn,
  orderByDesignation,
  orderByName,
  type Designation,
} from './designation'
import type { UserRole } from '../auth/types'

const grant = (role_type: UserRole['role_type'], department_id: string | null): UserRole => ({
  id: `${role_type}-${department_id}`,
  role_type,
  department_id,
  service_id: null,
})

describe('designationOn', () => {
  it('calls somebody with no grant on this team a member', () => {
    expect(designationOn([], 'd1')).toBe('member')
    expect(designationOn([grant('department_head', 'd2')], 'd1')).toBe('member')
  })

  it('recognises a head and a deputy of this team', () => {
    expect(designationOn([grant('department_head', 'd1')], 'd1')).toBe('head')
    expect(designationOn([grant('assisting_head', 'd1')], 'd1')).toBe('assisting')
  })

  it('gives the higher of the two when somebody holds both', () => {
    expect(
      designationOn([grant('assisting_head', 'd1'), grant('department_head', 'd1')], 'd1'),
    ).toBe('head')
  })

  it('is not fooled by an Admin grant, which belongs to no team', () => {
    expect(designationOn([grant('admin', null)], 'd1')).toBe('member')
  })

  it('sorts heads above deputies above everyone else', () => {
    expect(DESIGNATION_RANK.head).toBeLessThan(DESIGNATION_RANK.assisting)
    expect(DESIGNATION_RANK.assisting).toBeLessThan(DESIGNATION_RANK.member)
  })
})

describe('the order a team reads in', () => {
  const person = (id: string, first: string, last: string) => ({
    user_id: id,
    profiles: { first_name: first, last_name: last },
  })

  const roster = [
    person('zoe', 'Zoe', 'Adams'),
    person('head', 'Bhanu', 'Kanjarla'),
    person('alfin', 'Alfin', 'Ruesvelt'),
    person('deputy', 'Prince', 'Kr'),
    person('rohit-b', 'Rohit', 'Zachariah'),
    person('rohit-a', 'Rohit', 'Abraham'),
  ]

  const designationOf = (id: string): Designation =>
    id === 'head' ? 'head' : id === 'deputy' ? 'assisting' : 'member'

  it('puts the head first, their deputy next, then everybody else A to Z', () => {
    expect(orderByDesignation(roster, designationOf).map((m) => m.user_id)).toEqual([
      'head',
      'deputy',
      'alfin',
      'rohit-a',
      'rohit-b',
      'zoe',
    ])
  })

  it('breaks a tie on the surname, so two Rohits keep a fixed order', () => {
    const rohits = [person('b', 'Rohit', 'Zachariah'), person('a', 'Rohit', 'Abraham')]
    expect(orderByDesignation(rohits, () => 'member').map((m) => m.user_id)).toEqual(['a', 'b'])
  })

  it('leaves the list it was given alone', () => {
    const original = [...roster]
    orderByDesignation(roster, designationOf)
    expect(roster).toEqual(original)
  })

  it('sorts a guest list by name, since a guest has no rank', () => {
    expect(orderByName(roster).map((m) => m.user_id)).toEqual([
      'alfin',
      'head',
      'deputy',
      'rohit-a',
      'rohit-b',
      'zoe',
    ])
  })

  it('does not fall over on a row whose profile did not come back', () => {
    const missing = [{ user_id: 'ghost' }, person('a', 'Ada', 'Grace')]
    expect(orderByName(missing).map((m) => m.user_id)).toEqual(['ghost', 'a'])
  })
})
