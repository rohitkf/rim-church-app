import { beforeEach, describe, expect, it, vi } from 'vitest'
import migration from '../../../supabase/migrations/0319_whoever_runs_the_church_can_link_a_family.sql?raw'
import writtenIn from '../../../supabase/migrations/0320_a_family_member_with_no_account_can_be_written_in.sql?raw'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('./supabaseClient', () => ({ supabase: { rpc } }))

import {
  FAMILY_RELATIONS,
  FAMILY_WORDS,
  LIST_OF,
  draftOf,
  fetchFamilyOf,
  familyOfKey,
  linkFamily,
  removeFamilyPerson,
  saveFamilyPerson,
  unlinkFamily,
  unlinkWords,
  writtenDetails,
} from './familyLinks'

const anna = { id: 'a', first_name: 'Anna', last_name: 'Thomas' }
const ben = { id: 'b', first_name: 'Ben', last_name: 'Thomas' }
const cara = { id: 'c', first_name: 'Cara', last_name: 'Thomas' }

beforeEach(() => rpc.mockReset())

describe('reading who is linked to somebody', () => {
  it('asks the database for that one person and reads back the three lists', async () => {
    rpc.mockResolvedValue({
      data: {
        spouse: [ben],
        children: [cara],
        parents: [],
        written: { spouse: 0, children: 1, parents: 0 },
        written_people: { spouse: [], children: [{ id: 'w1', first_name: 'Zak', last_name: null, dob: '2018-01-02', gender: 'male', school: 'Hill Primary', year_group: 'Year 3' }], parents: [] },
      },
      error: null,
    })
    const family = await fetchFamilyOf('a')
    expect(rpc).toHaveBeenCalledWith('family_of', { p_person: 'a' })
    expect(family.spouse).toEqual([ben])
    expect(family.children).toEqual([cara])
    // Somebody written in, with what is written; a last name left out reads as none.
    expect(family.written_people.children).toEqual([{ id: 'w1', first_name: 'Zak', last_name: '', dob: '2018-01-02', gender: 'male', school: 'Hill Primary', year_group: 'Year 3' }])
  })

  it('reads an answer with nothing in it as nobody linked and nobody written in', async () => {
    rpc.mockResolvedValue({ data: {}, error: null })
    expect(await fetchFamilyOf('a')).toEqual({ spouse: [], children: [], parents: [], written_people: { spouse: [], children: [], parents: [] } })
  })

  it('reads a database that only counts the people written in (0319) as none to show', async () => {
    rpc.mockResolvedValue({ data: { spouse: [], children: [], parents: [], written: { spouse: 1, children: 2, parents: 0 } }, error: null })
    expect((await fetchFamilyOf('a')).written_people).toEqual({ spouse: [], children: [], parents: [] })
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

describe('somebody with no account, written in', () => {
  const draft = { first_name: 'zak', last_name: 'THOMAS', dob: '2018-01-02', gender: 'male' as const, school: 'Hill Primary', year_group: 'Year 3' }

  it('is written into one person’s family as what they are to them, the name written like a name', async () => {
    rpc.mockResolvedValue({ error: null })
    await saveFamilyPerson({ personId: 'a', relation: 'child', id: null, draft })
    expect(rpc).toHaveBeenCalledWith('save_family_person', {
      p_person: 'a',
      p_relation: 'child',
      p_id: null,
      p_first: 'Zak',
      p_last: 'Thomas',
      p_dob: '2018-01-02',
      p_gender: 'male',
      p_school: 'Hill Primary',
      p_year: 'Year 3',
    })
  })

  it('sends nothing for a date or a gender left blank', async () => {
    rpc.mockResolvedValue({ error: null })
    await saveFamilyPerson({ personId: 'a', relation: 'spouse', id: 'w9', draft: { ...draft, dob: '', gender: '' } })
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_id: 'w9', p_dob: null, p_gender: null })
  })

  it('refuses something that is not a name before asking the database', async () => {
    await expect(saveFamilyPerson({ personId: 'a', relation: 'child', id: null, draft: { ...draft, first_name: 'y@cht_234' } })).rejects.toThrow()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('is taken off by the person whose family it is and the entry', async () => {
    rpc.mockResolvedValue({ error: null })
    await removeFamilyPerson('a', 'w1')
    expect(rpc).toHaveBeenCalledWith('remove_family_person', { p_person: 'a', p_id: 'w1' })
  })

  it('says what is written about them besides the name', () => {
    const today = new Date('2026-11-22T12:00:00')
    const zak = { id: 'w1', first_name: 'Zak', last_name: '', dob: '2018-01-02', gender: 'male' as const, school: 'Hill Primary', year_group: 'Year 3' }
    expect(writtenDetails(zak, today)).toMatch(/2018 \(8\) · Boy · Year 3 · Hill Primary$/)
    expect(writtenDetails({ id: 'w2', first_name: 'Ravi', last_name: 'Kumar' }, today)).toBe('')
    expect(writtenDetails({ id: 'w3', first_name: 'Lily', last_name: '', gender: 'female' }, today)).toBe('Girl')
  })

  it('hands the form what is written, blanks as blanks', () => {
    expect(draftOf({ id: 'w2', first_name: 'Ravi', last_name: 'Kumar', dob: null, gender: null, school: null, year_group: null })).toEqual({
      first_name: 'Ravi',
      last_name: 'Kumar',
      dob: '',
      gender: '',
      school: '',
      year_group: '',
    })
  })

  it('files each relation under the list the database files it under', () => {
    expect(LIST_OF).toEqual({ spouse: 'spouse', child: 'children', parent: 'parents' })
    for (const key of Object.values(LIST_OF)) expect(writtenIn).toContain(`'${key}', coalesce(jsonb_agg(who order by name)`)
  })
})

describe('writing somebody in, in the database (0320)', () => {
  it('is the same right as linking, asked by every function that reads or writes a family', () => {
    expect(writtenIn.match(/public\.may\((?:auth\.uid\(\)|me), 'people\.family'\)/g)).toHaveLength(3)
    expect(writtenIn).toContain('revoke all on function public.save_family_person(uuid, text, uuid, text, text, date, text, text, text) from public, anon')
    expect(writtenIn).toContain('revoke all on function public.remove_family_person(uuid, uuid) from public, anon')
  })

  it('removes only somebody written in: an account is unlinked', () => {
    expect(writtenIn).toContain('select household_id into hh from public.household_members where id = p_id and user_id is null;')
  })

  it('hands back what is written and never the address', () => {
    expect(writtenIn).toContain("'written_people', written")
    const fn = writtenIn.slice(writtenIn.indexOf('create or replace function public.family_of'), writtenIn.indexOf('The sentence, wide enough'))
    expect(fn).not.toMatch(/address|postcode|town/)
  })

  it('tells the family in a sentence with no name in it', () => {
    expect(writtenIn.match(/'A church Admin has updated[^']*'/)?.[0]).toBe("'A church Admin has updated your family in the app. Open your profile to see.'")
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
