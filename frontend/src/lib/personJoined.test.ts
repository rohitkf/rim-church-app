import { describe, expect, it } from 'vitest'
import migration from '../../../supabase/migrations/0332_somebody_who_joins_is_linked_once.sql?raw'
import type { Family } from './families'
import type { Guest } from './guests'
import { guestLine, guestMatches, nameLikeness, writtenLine, writtenMatches } from './personJoined'

/*
 * Somebody who joins is linked once (0332): the guest roll and a family
 * they were written into, in one step. What is offered beside the link
 * being made is found by name, and only ever offered.
 */

const account = (id: string, first: string, last: string, kind: 'adult' | 'child' = 'adult') => ({
  id: `row-${id}`,
  user_id: id,
  kind,
  first_name: first,
  last_name: last,
  gender: null,
})
const written = (id: string, first: string, last: string, kind: 'adult' | 'child', gender: 'male' | 'female' | null = null) => ({
  id,
  user_id: null,
  kind,
  first_name: first,
  last_name: last,
  gender,
})
const guest = (id: string, name: string, over: Partial<Guest> = {}): Guest => ({ id, name, title: null, note: null, became_member: null, ...over })

describe('how alike two names are', () => {
  it('is the same whatever the capitals, the accents or the spaces', () => {
    expect(nameLikeness('Sam Thomas', 'sam  thomas')).toBe('same')
    expect(nameLikeness('José Mathew', 'Jose Mathew')).toBe('same')
  })

  it('is near when one has only a first name, or a middle name the other leaves out', () => {
    expect(nameLikeness('Sam', 'Sam Thomas')).toBe('near')
    expect(nameLikeness('Sam K Thomas', 'Sam Thomas')).toBe('near')
  })

  it('is nobody when the first names or the last names differ', () => {
    expect(nameLikeness('Sam Thomas', 'Tom Thomas')).toBeNull()
    expect(nameLikeness('Sam Thomas', 'Sam Jacob')).toBeNull()
    expect(nameLikeness('', 'Sam')).toBeNull()
  })
})

describe('who is written into a family under that name', () => {
  const families: Family[] = [
    { id: 'h1', members: [account('anna', 'Anna', 'Thomas'), written('w-sam', 'Sam', 'Thomas', 'adult', 'male')] },
    { id: 'h2', members: [account('hal', 'Hal', 'Jacob'), written('w-kid', 'Sam', '', 'child', 'male')] },
    { id: 'h3', members: [account('joy', 'Joy', 'Mathew', 'child'), written('w-dad', 'Sam', 'Mathew', 'adult')] },
    { id: 'h4', members: [account('ben', 'Ben', 'Paul', 'child'), written('w-sis', 'Sam', 'Paul', 'child', 'female')] },
    { id: 'h5', members: [account('eve', 'Eve', 'Thomas'), written('w-other', 'Tom', 'Thomas', 'adult')] },
  ]

  it('finds them by the guest’s name or the account’s, the exact one first', () => {
    const got = writtenMatches(families, ['Sam Thomas'], 'sam')
    expect(got.map((m) => m.id)).toEqual(['w-sam', 'w-kid'])
    expect(got[0].exact).toBe(true)
    expect(got[1].exact).toBe(false)
  })

  it('says what each is from where it is written, as the database does', () => {
    const all = writtenMatches(families, ['Sam Thomas', 'Sam Mathew', 'Sam Paul'], 'sam')
    const by = Object.fromEntries(all.map((m) => [m.id, m]))
    expect(writtenLine(by['w-sam'])).toBe('Sam Thomas, written in as Anna’s husband')
    expect(writtenLine(by['w-kid'])).toBe('Sam, written in as Hal’s son')
    // Nobody has said man or woman of a parent written in: the pair is shown.
    expect(by['w-dad'].part).toBe('parent')
    expect(writtenLine(by['w-dad'])).toContain('written in as Joy’s ')
    expect(writtenLine(by['w-sis'])).toBe('Sam Paul, written in as Ben’s sister')
    // The four cases are the ones person_joined() reads.
    for (const word of ["'husband'", "'father'", "'son'", "'brother'"]) expect(migration).toContain(word)
  })

  it('leaves out an entry with nobody on the app beside it but the account itself', () => {
    const alone: Family[] = [{ id: 'h', members: [account('sam', 'Sam', 'Thomas'), written('w', 'Sam', 'Thomas', 'adult')] }]
    expect(writtenMatches(alone, ['Sam Thomas'], 'sam')).toEqual([])
  })

  it('finds nobody under another name', () => {
    expect(writtenMatches(families, ['Maria Jacob'], 'maria')).toEqual([])
  })
})

describe('who is still on the guest list under that name', () => {
  const guests = [guest('g1', 'Sam Thomas', { title: 'Pastor' }), guest('g2', 'Sam'), guest('g3', 'Sam Thomas', { became_member: 'x' }), guest('g4', 'Tom Thomas')]

  it('offers the ones not yet linked, the exact one first', () => {
    const got = guestMatches(guests, 'Sam Thomas')
    expect(got.map((m) => m.guest.id)).toEqual(['g1', 'g2'])
    expect(got[0].exact).toBe(true)
    expect(guestLine(got[0])).toBe('On the guest list as Pastor Sam Thomas')
  })
})

describe('the step itself (0332)', () => {
  it('asks each half for its own right and does both or neither', () => {
    expect(migration).toMatch(/may\(me, 'svc\.guests'\)/)
    expect(migration).toMatch(/may\(me, 'people\.family'\)/)
    // One function, so one transaction: a refusal from the family half undoes the guest half.
    expect(migration).toMatch(/update public\.guests set became_member = p_account[\s\S]+perform public\.link_family_as\(anchor, p_account, word\)/)
  })

  it('is callable by signed-in people only', () => {
    expect(migration).toContain('revoke all on function public.person_joined(uuid, uuid, uuid[]) from public, anon;')
    expect(migration).toContain('grant execute on function public.person_joined(uuid, uuid, uuid[]) to authenticated;')
  })
})
