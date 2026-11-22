import { beforeEach, describe, expect, it, vi } from 'vitest'
import migration from '../../../supabase/migrations/0319_whoever_runs_the_church_can_link_a_family.sql?raw'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('./supabaseClient', () => ({ supabase: { rpc } }))

import { FAMILY_RELATIONS, FAMILY_WORDS, fetchFamilyOf, familyOfKey, linkFamily, unlinkFamily, unlinkWords, writtenWords } from './familyLinks'

const anna = { id: 'a', first_name: 'Anna', last_name: 'Thomas' }
const ben = { id: 'b', first_name: 'Ben', last_name: 'Thomas' }
const cara = { id: 'c', first_name: 'Cara', last_name: 'Thomas' }

beforeEach(() => rpc.mockReset())

describe('reading who is linked to somebody', () => {
  it('asks the database for that one person and reads back the three lists', async () => {
    rpc.mockResolvedValue({ data: { spouse: [ben], children: [cara], parents: [], written: { spouse: 0, children: 2, parents: 0 } }, error: null })
    const family = await fetchFamilyOf('a')
    expect(rpc).toHaveBeenCalledWith('family_of', { p_person: 'a' })
    expect(family.spouse).toEqual([ben])
    expect(family.children).toEqual([cara])
    expect(family.written.children).toBe(2)
  })

  it('reads an answer with nothing in it as nobody linked', async () => {
    rpc.mockResolvedValue({ data: {}, error: null })
    expect(await fetchFamilyOf('a')).toEqual({ spouse: [], children: [], parents: [], written: { spouse: 0, children: 0, parents: 0 } })
  })

  it('passes a refusal on', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'You do not have permission to link families.' } })
    await expect(fetchFamilyOf('a')).rejects.toMatchObject({ message: 'You do not have permission to link families.' })
  })

  it('is kept under the family’s key, so a household changing reads it again', () => {
    expect(familyOfKey('a')[0]).toBe('family')
  })
})

describe('linking and unlinking', () => {
  it('names the two people and what the second is to the first', async () => {
    rpc.mockResolvedValue({ error: null })
    await linkFamily('a', 'b', 'spouse')
    expect(rpc).toHaveBeenCalledWith('link_family', { p_person: 'a', p_relative: 'b', p_relation: 'spouse' })
  })

  it('unlinks by the two people alone', async () => {
    rpc.mockResolvedValue({ error: null })
    await unlinkFamily('a', 'b')
    expect(rpc).toHaveBeenCalledWith('unlink_family', { p_person: 'a', p_relative: 'b' })
  })

  it('passes on what the database says when it refuses', async () => {
    rpc.mockResolvedValue({ error: { code: 'P0001', message: 'Anna already has a husband or wife linked. Unlink them first.' } })
    await expect(linkFamily('a', 'c', 'spouse')).rejects.toMatchObject({ message: /already has a husband or wife/ })
  })
})

describe('the words', () => {
  it('offers the three relations the database takes, and no others', () => {
    for (const relation of FAMILY_RELATIONS) expect(migration).toContain(`'${relation}'`)
    expect(migration).toContain("p_relation not in ('spouse', 'child', 'parent')")
    expect(Object.keys(FAMILY_WORDS).sort()).toEqual([...FAMILY_RELATIONS].sort())
  })

  it('says how many are written in by hand, and nothing when none are', () => {
    expect(writtenWords('child', 0)).toBeNull()
    expect(writtenWords('child', 1)).toBe('1 child is written in by hand on their profile, with no account.')
    expect(writtenWords('child', 2)).toBe('2 children are written in by hand on their profile, with no account.')
    expect(writtenWords('parent', 2)).toBe('2 parents are written in by hand on their profile, with no account.')
    expect(writtenWords('spouse', 1)).toMatch(/takes its place/)
  })

  it('says what unlinking a husband or wife leaves where', () => {
    expect(unlinkWords(anna, ben, 'spouse', { spouse: [ben], parents: [] })).toBe('Ben leaves Anna’s household. The address and any children on it stay with Anna.')
  })

  it('says a child is unlinked from both of a couple', () => {
    expect(unlinkWords(anna, cara, 'child', { spouse: [ben], parents: [] })).toBe('Cara stops being linked as the child of Anna and of Ben: the two share one household.')
    expect(unlinkWords(anna, cara, 'child', { spouse: [], parents: [] })).toBe('Cara stops being linked as Anna’s child.')
  })

  it('says the same from the child’s side', () => {
    expect(unlinkWords(cara, anna, 'parent', { spouse: [], parents: [anna, ben] })).toBe('Cara stops being linked as the child of Anna and of Ben: parents share one household.')
    expect(unlinkWords(cara, anna, 'parent', { spouse: [], parents: [anna] })).toBe('Cara stops being linked as Anna’s child.')
  })
})

describe('the right, in the database', () => {
  it('is Admins’ out of the box and a choice in every cell', () => {
    for (const role of ['head', 'assistant', 'coordinator', 'member', 'newcomer', 'overwatch', 'pastor']) {
      expect(migration).toContain(`('people.family', '${role}', '{none,all}', 'none')`)
    }
    expect(migration).toContain("('people.family', 'admin', '{none,all}', 'all')")
  })

  it('is asked by all three functions, and the telling is nobody’s to call', () => {
    expect(migration.match(/public\.may\((?:auth\.uid\(\)|me), 'people\.family'\)/g)).toHaveLength(3)
    expect(migration).toContain('revoke all on function public.family_changed_tell(uuid[], uuid) from public, anon, authenticated')
  })

  it('will not let somebody link themselves into a household they could not otherwise read', () => {
    expect(migration).toContain("if (p_person = me or p_relative = me) and not public.may(me, 'people.contacts') then")
  })

  it('puts no name on anybody’s phone', () => {
    const body = migration.match(/'A church Admin has updated[^']*'/)?.[0] ?? ''
    expect(body).toBe("'A church Admin has updated who you are linked with as family. Open your profile to see.'")
  })
})
