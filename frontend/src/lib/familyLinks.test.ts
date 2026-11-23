import { beforeEach, describe, expect, it, vi } from 'vitest'
import migration from '../../../supabase/migrations/0319_whoever_runs_the_church_can_link_a_family.sql?raw'
import writtenIn from '../../../supabase/migrations/0320_a_family_member_with_no_account_can_be_written_in.sql?raw'
import words from '../../../supabase/migrations/0328_a_link_says_husband_wife_son_or_sister.sql?raw'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('./supabaseClient', () => ({ supabase: { rpc } }))

import {
  FAMILY_RELATIONS,
  FAMILY_WORDS,
  FAMILY_WORD_LIST,
  LIST_OF,
  WORDS_OF,
  WORD_MEANS,
  draftOf,
  fetchFamilyOf,
  familyOfKey,
  linkAlso,
  linkFamily,
  linkedWords,
  namesList,
  removeFamilyPerson,
  saveFamilyPerson,
  sayFamilyWord,
  unlinkFamily,
  unlinkWords,
  wordFor,
  wordLabel,
  wordOf,
  writtenDetails,
  type FamilyOf,
} from './familyLinks'

const anna = { id: 'a', first_name: 'Anna', last_name: 'Thomas' }
const ben = { id: 'b', first_name: 'Ben', last_name: 'Thomas' }
const cara = { id: 'c', first_name: 'Cara', last_name: 'Thomas' }
const dan = { id: 'd', first_name: 'Dan', last_name: 'Thomas' }

const nobody = () => ({ spouse: [], children: [], parents: [], siblings: [] })
/** A family as `family_of()` hands it over, with only what a test names in it. */
const fam = (linked: Partial<Omit<FamilyOf, 'written_people'>> = {}, written: Partial<FamilyOf['written_people']> = {}): FamilyOf => ({
  ...nobody(),
  ...linked,
  written_people: { ...nobody(), ...written },
})

beforeEach(() => rpc.mockReset())

describe('reading who is linked to somebody', () => {
  it('asks the database for that one person and reads back the lists', async () => {
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
    // A database from before the words (0328) has no brothers and sisters to hand over.
    expect(family.siblings).toEqual([])
    // Somebody written in, with what is written; a last name left out reads as none.
    expect(family.written_people.children).toEqual([{ id: 'w1', first_name: 'Zak', last_name: '', dob: '2018-01-02', gender: 'male', school: 'Hill Primary', year_group: 'Year 3' }])
  })

  it('reads an answer with nothing in it as nobody linked and nobody written in', async () => {
    rpc.mockResolvedValue({ data: {}, error: null })
    expect(await fetchFamilyOf('a')).toEqual(fam())
  })

  it('reads a database that only counts the people written in (0319) as none to show', async () => {
    rpc.mockResolvedValue({ data: { spouse: [], children: [], parents: [], written: { spouse: 1, children: 2, parents: 0 } }, error: null })
    expect((await fetchFamilyOf('a')).written_people).toEqual(nobody())
  })

  it('passes a refusal on', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'You do not have permission to link families.' } })
    await expect(fetchFamilyOf('a')).rejects.toMatchObject({ message: 'You do not have permission to link families.' })
  })

  it('reads what has been said of each person, and the brothers and sisters', async () => {
    rpc.mockResolvedValue({
      data: {
        spouse: [{ ...ben, gender: 'male' }],
        children: [{ ...cara, gender: null }],
        parents: [],
        siblings: [{ ...dan, gender: 'male' }],
        written_people: { spouse: [], children: [], parents: [], siblings: [{ id: 'w5', first_name: 'Eve', last_name: null, gender: 'female' }] },
      },
      error: null,
    })
    const family = await fetchFamilyOf('a')
    expect(family.spouse[0].gender).toBe('male')
    expect(family.children[0].gender).toBeNull()
    expect(family.siblings).toEqual([{ ...dan, gender: 'male' }])
    expect(family.written_people.siblings).toEqual([{ id: 'w5', first_name: 'Eve', last_name: '', gender: 'female' }])
  })

  it('is kept under the family’s key, so a household changing reads it again', () => {
    expect(familyOfKey('a')[0]).toBe('family')
  })
})

describe('linking and unlinking', () => {
  it('names the two people and the word for what the second is to the first', async () => {
    rpc.mockResolvedValue({ data: { came: [], parents: [] }, error: null })
    expect(await linkFamily('a', 'b', 'husband')).toEqual({ came: [], parents: [] })
    expect(rpc).toHaveBeenCalledWith('link_family_as', { p_person: 'a', p_relative: 'b', p_word: 'husband' })
  })

  it('hands back who else the link moved', async () => {
    rpc.mockResolvedValue({ data: { came: ['Sue'], parents: ['Gran'] }, error: null })
    expect(await linkFamily('a', 'b', 'brother')).toEqual({ came: ['Sue'], parents: ['Gran'] })
  })

  it('reads an answer with nothing in it as nobody else moved', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    expect(await linkFamily('a', 'b', 'son')).toEqual({ came: [], parents: [] })
  })

  it('unlinks by the two people alone', async () => {
    rpc.mockResolvedValue({ error: null })
    await unlinkFamily('a', 'b')
    expect(rpc).toHaveBeenCalledWith('unlink_family', { p_person: 'a', p_relative: 'b' })
  })

  it('passes on what the database says when it refuses', async () => {
    rpc.mockResolvedValue({ error: { code: 'P0001', message: 'Anna already has a husband or wife linked. Unlink them first.' } })
    await expect(linkFamily('a', 'c', 'husband')).rejects.toMatchObject({ message: /already has a husband or wife/ })
  })

  it('says the word of an account already linked, or of somebody written in', async () => {
    rpc.mockResolvedValue({ error: null })
    await sayFamilyWord('a', { account: 'b' }, 'husband')
    expect(rpc).toHaveBeenLastCalledWith('say_family_word', { p_person: 'a', p_relative: 'b', p_written: null, p_word: 'husband' })
    await sayFamilyWord('a', { written: 'w1' }, 'daughter')
    expect(rpc).toHaveBeenLastCalledWith('say_family_word', { p_person: 'a', p_relative: null, p_written: 'w1', p_word: 'daughter' })
  })
})

describe('the words', () => {
  it('still names the three links 0319 takes, with brothers and sisters the fourth list', () => {
    expect(migration).toContain("p_relation not in ('spouse', 'child', 'parent')")
    expect(FAMILY_RELATIONS).toEqual(['spouse', 'child', 'parent', 'sibling'])
    expect(Object.keys(FAMILY_WORDS).sort()).toEqual([...FAMILY_RELATIONS].sort())
  })

  it('offers eight words, each one the database takes and means the same by', () => {
    expect(FAMILY_WORD_LIST).toEqual(['husband', 'wife', 'son', 'daughter', 'father', 'mother', 'brother', 'sister'])
    const fn = words.slice(words.indexOf('create or replace function public.family_word'), words.indexOf('What has been said of an account'))
    for (const word of FAMILY_WORD_LIST) {
      const { part, gender } = WORD_MEANS[word]
      // The line that gives the list, and the line that gives man or woman, both name the word.
      expect(fn).toMatch(new RegExp(`when p_word in \\([^)]*'${word}'[^)]*\\) then '${part}'`))
      expect(fn).toMatch(new RegExp(`when p_word in \\([^)]*'${word}'[^)]*\\) then '${gender}'`))
    }
  })

  it('has two words for each list, the man’s first', () => {
    for (const part of FAMILY_RELATIONS) {
      const [his, hers] = WORDS_OF[part]
      expect(WORD_MEANS[his]).toEqual({ part, gender: 'male' })
      expect(WORD_MEANS[hers]).toEqual({ part, gender: 'female' })
    }
  })

  it('says the word for somebody once it is known, and the pair until then', () => {
    expect(wordOf('spouse', 'female')).toBe('wife')
    expect(wordOf('sibling', 'male')).toBe('brother')
    expect(wordOf('child', null)).toBeNull()
    expect(wordFor('parent', 'female')).toBe('mother')
    expect(wordFor('spouse', undefined)).toBe('husband or wife')
    expect(wordFor('sibling', null)).toBe('brother or sister')
    expect(wordLabel('child', 'male')).toBe('Son')
    expect(wordLabel('parent', null)).toBe('Parent')
  })

  it('writes a list of names the way it is said', () => {
    expect(namesList([])).toBe('')
    expect(namesList(['Anna'])).toBe('Anna')
    expect(namesList(['Anna', 'Ben'])).toBe('Anna and Ben')
    expect(namesList(['Anna', 'Ben', 'Cara'])).toBe('Anna, Ben and Cara')
  })

  it('says what unlinking a husband or wife leaves where', () => {
    expect(unlinkWords(anna, ben, 'spouse', fam({ spouse: [ben] }))).toBe('Ben leaves Anna’s household. The address and any children on it stay with Anna.')
  })

  it('says a child is unlinked from both of a couple', () => {
    expect(unlinkWords(anna, cara, 'child', fam({ spouse: [ben] }))).toBe('Cara stops being linked as the child of Anna and of Ben: the two share one household.')
    expect(unlinkWords(anna, cara, 'child', fam())).toBe('Cara stops being linked as Anna’s child.')
  })

  it('says the same from the child’s side', () => {
    expect(unlinkWords(cara, anna, 'parent', fam({ parents: [anna, ben] }))).toBe('Cara stops being linked as the child of Anna and of Ben: parents share one household.')
    expect(unlinkWords(cara, anna, 'parent', fam({ parents: [anna] }))).toBe('Cara stops being linked as Anna’s child.')
  })

  it('says leaving a parent is leaving the brothers and sisters too', () => {
    expect(unlinkWords(cara, anna, 'parent', fam({ parents: [anna], siblings: [dan] }))).toBe(
      'Cara stops being linked as Anna’s child. Cara stops being linked to Dan as brother or sister too.',
    )
  })

  it('says unlinking a brother or sister takes them from the parents as well', () => {
    expect(unlinkWords(cara, dan, 'sibling', fam({ parents: [anna, ben], siblings: [dan] }))).toBe(
      'Dan stops being linked as Cara’s brother or sister, and so as the child of Anna and Ben: brothers and sisters are children of one household.',
    )
    expect(unlinkWords(cara, dan, 'sibling', fam({ siblings: [dan] }))).toBe('Dan stops being linked as Cara’s brother or sister.')
  })
})

describe('what a link does besides the link', () => {
  it('says a brother or sister becomes the child of the person’s parents, linked or written in', () => {
    expect(linkAlso(cara, dan, 'brother', fam({ parents: [anna] }, { parents: [{ id: 'w1', first_name: 'Ben', last_name: '' }] }))).toBe(
      'That makes Dan the child of Anna and Ben too, as Cara is.',
    )
    expect(linkAlso(cara, dan, 'brother', fam())).toBeNull()
  })

  it('says a parent linked to somebody with brothers and sisters and no parent on the app becomes theirs too', () => {
    expect(linkAlso(cara, anna, 'mother', fam({ siblings: [dan] }))).toBe('Dan, Cara’s brother or sister, becomes Anna’s child too.')
    expect(linkAlso(cara, anna, 'mother', fam({ siblings: [dan] }, { siblings: [{ id: 'w2', first_name: 'Eve', last_name: '' }] }))).toBe(
      'Dan and Eve, Cara’s brothers and sisters, become Anna’s children too.',
    )
    // A parent already linked: the database refuses a second unless they are husband and wife.
    expect(linkAlso(cara, anna, 'mother', fam({ parents: [ben], siblings: [dan] }))).toBeNull()
  })

  it('says nothing more for a husband, a wife or a child', () => {
    expect(linkAlso(anna, ben, 'husband', fam({ siblings: [dan], parents: [cara] }))).toBeNull()
    expect(linkAlso(anna, cara, 'daughter', fam({ siblings: [dan] }))).toBeNull()
  })

  it('says the link once it is made, and that both were told', () => {
    expect(linkedWords(anna, ben, 'husband', { came: [], parents: [] })).toBe('Ben Thomas is now linked as Anna’s husband. They have both been told.')
  })

  it('says whose children a brother and sister now both are', () => {
    expect(linkedWords(cara, dan, 'brother', { came: [], parents: ['Anna', 'Ben'] })).toBe(
      'Dan Thomas is now linked as Cara’s brother. They are both down as children of Anna and Ben. Everybody it changes has been told.',
    )
  })

  it('says who came with a child linked to a parent', () => {
    expect(linkedWords(cara, anna, 'mother', { came: ['Dan'], parents: [] })).toBe(
      'Anna Thomas is now linked as Cara’s mother. Dan, already linked as a brother or sister, came too. Everybody it changes has been told.',
    )
    expect(linkedWords(cara, anna, 'mother', { came: ['Dan', 'Eve'], parents: [] })).toMatch(/Dan and Eve, already linked as brothers and sisters, came too\./)
  })
})

describe('somebody with no account, written in', () => {
  const draft = { first_name: 'zak', last_name: 'THOMAS', dob: '2018-01-02', gender: 'male' as const, school: 'Hill Primary', year_group: 'Year 3' }

  it('is written into one person’s family as what they are to them, the name written like a name', async () => {
    rpc.mockResolvedValue({ error: null })
    await saveFamilyPerson({ personId: 'a', word: 'son', id: null, draft })
    expect(rpc).toHaveBeenCalledWith('save_family_person', {
      p_person: 'a',
      p_relation: 'son',
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
    await saveFamilyPerson({ personId: 'a', word: null, id: 'w9', draft: { ...draft, dob: '', gender: '' } })
    // Changing what is written: the word is not read, and none is sent.
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_id: 'w9', p_relation: null, p_dob: null, p_gender: null })
  })

  it('refuses something that is not a name before asking the database', async () => {
    await expect(saveFamilyPerson({ personId: 'a', word: 'son', id: null, draft: { ...draft, first_name: 'y@cht_234' } })).rejects.toThrow()
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
    expect(writtenDetails(zak, today)).toMatch(/2018 \(8\) · Year 3 · Hill Primary$/)
    expect(writtenDetails({ id: 'w2', first_name: 'Ravi', last_name: 'Kumar' }, today)).toBe('')
    // Boy or girl is the word beside them now, for an adult as well (0328).
    expect(writtenDetails({ id: 'w3', first_name: 'Lily', last_name: '', gender: 'female' }, today)).toBe('')
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
    expect(LIST_OF).toEqual({ spouse: 'spouse', child: 'children', parent: 'parents', sibling: 'siblings' })
    for (const key of Object.values(LIST_OF)) expect(words).toContain(`'${key}', coalesce(jsonb_agg(who order by name)`)
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

describe('the words, in the database (0328)', () => {
  it('is the same right, asked by every function that reads or changes a family', () => {
    // family_of, link_family_as, say_family_word, unlink_family, save_family_person.
    expect(words.match(/public\.may\((?:auth\.uid\(\)|me), 'people\.family'\)/g)).toHaveLength(5)
    expect(words).toContain('revoke all on function public.link_family_as(uuid, uuid, text) from public, anon')
    expect(words).toContain('revoke all on function public.say_family_word(uuid, uuid, uuid, text) from public, anon')
  })

  it('keeps what a word means, and what has been said of somebody, for the database alone', () => {
    expect(words).toContain('revoke all on function public.family_word(text) from public, anon, authenticated')
    expect(words).toContain('revoke all on function public.family_gender_of(uuid) from public, anon, authenticated')
  })

  it('will not let somebody link themselves in as a brother or sister either', () => {
    expect(words).toContain("if (p_person = me or p_relative = me) and not public.may(me, 'people.contacts') then")
  })

  it('still hands back no address', () => {
    const fn = words.slice(words.indexOf('create or replace function public.family_of'), words.indexOf('Linking two accounts by a word'))
    expect(fn).toContain("'gender', public.family_gender_of(p.id)")
    expect(fn).not.toMatch(/address|postcode|town/)
  })

  it('leaves link_family() as it was, for a phone that has not reloaded', () => {
    expect(words).not.toContain('create or replace function public.link_family(')
    expect(words).toContain('perform public.link_family(p_person, p_relative, w.part);')
  })

  it('only takes a word for what somebody already is', () => {
    expect(words).toContain("raise exception 'That is not what they are to %. Unlink them and link them again to change it.', person_name;")
  })
})
