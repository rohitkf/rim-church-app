import { z } from 'zod'
import { supabase } from './supabaseClient'
import { dobWithAge, type PersonDraft, type Relation } from './family'
import { nameToSave } from './personName'

/*
 * Linking a family for them (0319).
 *
 * A family is a household (0149), and its own people link it from their
 * profiles: one asks, the other says yes. Whoever holds `people.family`
 * (Admins and the Owner out of the box) can make the same link directly,
 * for any two accounts, from the person's card on Volunteers: husband and
 * wife, or a child and their parents. Nobody is asked; both are told.
 *
 * Somebody with no account is written in by hand (0320), as the family
 * can on their own profile, until they join: then their account is linked
 * and takes the entry's place.
 *
 * The database does all of it. `family_of()` hands back the accounts
 * linked to one person and the people written in by hand with what is
 * written about them — whoever may change it has to read it — and never
 * the address: that is the family's and `people.contacts`' to read. `link_family()` and
 * `unlink_family()` make and take the link, and refuse in words what
 * cannot be meant (a second husband, a child with two unlinked parents).
 *
 * A link is said by one of eight words (0328): husband, wife, son,
 * daughter, father, mother, brother, sister. Six are the three links
 * with whether the person is a man or a woman said along with it, which
 * the database keeps on the person and hands back for each one; brother
 * and sister are two children of the same household, which can now be
 * asked for directly. Somebody linked before the words has none, and is
 * shown by the pair ("husband or wife") until somebody says which.
 *
 * One more refusal is about the linker, not the family: being in a
 * household is what opens it, so linking yourself to somebody is refused
 * unless you read households anyway (`people.contacts`). Your own family
 * is linked from your profile, where the other person confirms it.
 */

const genderSchema = z.enum(['male', 'female']).nullable().optional()
export type Gender = 'male' | 'female'

const linkedSchema = z.object({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  /** What has been said of them (0328): null until a word that says it is used. */
  gender: genderSchema,
})
export type LinkedPerson = z.infer<typeof linkedSchema>

/** Somebody with no account, written in by hand: by the family on their profile, or for them here (0320). */
const writtenSchema = z.object({
  id: z.string(),
  first_name: z.string().nullable().transform((v) => v ?? ''),
  last_name: z.string().nullable().transform((v) => v ?? ''),
  dob: z.string().nullable().optional(),
  gender: genderSchema,
  school: z.string().nullable().optional(),
  year_group: z.string().nullable().optional(),
})
export type WrittenPerson = z.infer<typeof writtenSchema>

const NOBODY_WRITTEN = { spouse: [], children: [], parents: [], siblings: [] }

const familyOfSchema = z.object({
  spouse: z.array(linkedSchema).default([]),
  children: z.array(linkedSchema).default([]),
  parents: z.array(linkedSchema).default([]),
  /** The other children of the household this person is a child of (0328). */
  siblings: z.array(linkedSchema).default([]),
  /** The people written in by hand, to be changed or taken off. */
  written_people: z
    .object({
      spouse: z.array(writtenSchema).default([]),
      children: z.array(writtenSchema).default([]),
      parents: z.array(writtenSchema).default([]),
      siblings: z.array(writtenSchema).default([]),
    })
    .default(NOBODY_WRITTEN),
})
export type FamilyOf = z.infer<typeof familyOfSchema>

/** Under the family's own key, so a household changing anywhere reads it again (lib/liveTables). */
export const familyOfKey = (personId: string) => ['family', 'of', personId] as const

/** The accounts linked to one person as family. Refused without `people.family`. */
export async function fetchFamilyOf(personId: string): Promise<FamilyOf> {
  const { data, error } = await supabase.rpc('family_of', { p_person: personId })
  if (error) throw error
  return familyOfSchema.parse(data)
}

/** Which of a family's four lists somebody is in. A brother or sister is the fourth (0328). */
export type FamilyPart = Relation | 'sibling'

/** The words a link is said by (0328), in the order they are offered. */
export const FAMILY_WORD_LIST = ['husband', 'wife', 'son', 'daughter', 'father', 'mother', 'brother', 'sister'] as const
export type FamilyWord = (typeof FAMILY_WORD_LIST)[number]

/** What each word says: which list, and whether a man or a woman. */
export const WORD_MEANS: Record<FamilyWord, { part: FamilyPart; gender: Gender }> = {
  husband: { part: 'spouse', gender: 'male' },
  wife: { part: 'spouse', gender: 'female' },
  son: { part: 'child', gender: 'male' },
  daughter: { part: 'child', gender: 'female' },
  father: { part: 'parent', gender: 'male' },
  mother: { part: 'parent', gender: 'female' },
  brother: { part: 'sibling', gender: 'male' },
  sister: { part: 'sibling', gender: 'female' },
}

/** The two words of a list, the man's first. */
export const WORDS_OF: Record<FamilyPart, readonly [FamilyWord, FamilyWord]> = {
  spouse: ['husband', 'wife'],
  child: ['son', 'daughter'],
  parent: ['father', 'mother'],
  sibling: ['brother', 'sister'],
}

/** The word for somebody in a list, or null where nobody has said which they are. */
export function wordOf(part: FamilyPart, gender: Gender | null | undefined): FamilyWord | null {
  if (!gender) return null
  return WORDS_OF[part][gender === 'male' ? 0 : 1]
}

/** "wife", or "husband or wife" where nobody has said: what somebody is, in a sentence. */
export function wordFor(part: FamilyPart, gender: Gender | null | undefined): string {
  return wordOf(part, gender) ?? FAMILY_WORDS[part].one
}

/** "Wife", "Husband or wife": the same, as a label. */
export function wordLabel(part: FamilyPart, gender: Gender | null | undefined): string {
  const word = wordFor(part, gender)
  return word.charAt(0).toUpperCase() + word.slice(1)
}

const linkedAnswerSchema = z
  .object({ came: z.array(z.string()).default([]), parents: z.array(z.string()).default([]) })
  .nullable()
  .transform((v) => v ?? { came: [], parents: [] })
/**
 * What a link moved that whoever made it could not see beforehand: the
 * first names of the brothers and sisters who came with a child (`came`),
 * and for a brother or sister, of the parents both are now children of.
 */
export type LinkAnswer = z.infer<typeof linkedAnswerSchema>

/** Link two accounts: `word` is what `relativeId` is to `personId`. */
export async function linkFamily(personId: string, relativeId: string, word: FamilyWord): Promise<LinkAnswer> {
  const { data, error } = await supabase.rpc('link_family_as', { p_person: personId, p_relative: relativeId, p_word: word })
  if (error) throw error
  return linkedAnswerSchema.parse(data ?? null)
}

/**
 * Say which word somebody already in the family is: an account, or
 * somebody written in. It changes no household and tells nobody.
 */
export async function sayFamilyWord(
  personId: string,
  who: { account: string } | { written: string },
  word: FamilyWord,
): Promise<void> {
  const { error } = await supabase.rpc('say_family_word', {
    p_person: personId,
    p_relative: 'account' in who ? who.account : null,
    p_written: 'written' in who ? who.written : null,
    p_word: word,
  })
  if (error) throw error
}

/** Take the link between two accounts away, whichever it is. */
export async function unlinkFamily(personId: string, relativeId: string): Promise<void> {
  const { error } = await supabase.rpc('unlink_family', { p_person: personId, p_relative: relativeId })
  if (error) throw error
}

export const fullName = (p: { first_name: string; last_name: string }) => `${p.first_name} ${p.last_name}`.trim()

/** A family's four lists, in the order they are shown. */
export const FAMILY_RELATIONS: readonly FamilyPart[] = ['spouse', 'child', 'parent', 'sibling']

/** What each is called: over its list, and for one person nobody has said a word for. */
export const FAMILY_WORDS: Record<FamilyPart, { heading: string; one: string }> = {
  spouse: { heading: 'Husband or wife', one: 'husband or wife' },
  child: { heading: 'Children', one: 'child' },
  parent: { heading: 'Parents', one: 'parent' },
  sibling: { heading: 'Brothers and sisters', one: 'brother or sister' },
}

/** Which of a family's lists a part is: the key `family_of()` files people under. */
export const LIST_OF: Record<FamilyPart, 'spouse' | 'children' | 'parents' | 'siblings'> = {
  spouse: 'spouse',
  child: 'children',
  parent: 'parents',
  sibling: 'siblings',
}

/** "Anna", "Anna and Ben", "Anna, Ben and Cara". */
export function namesList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** Everybody in one of a family's lists by first name, the accounts then the people written in. */
const firstNames = (family: FamilyOf, list: 'spouse' | 'children' | 'parents' | 'siblings') =>
  [...family[list], ...family.written_people[list]].map((p) => p.first_name).filter(Boolean)

/**
 * What linking somebody by this word does besides the link itself, said
 * before it is done. A brother or sister is a child of the same
 * household, so they become the child of this person's parents; and a
 * parent linked to somebody with brothers and sisters and no parent on
 * the app becomes theirs too. Null when the link is only the link.
 */
export function linkAlso(person: { first_name: string }, relative: { first_name: string }, word: FamilyWord, family: FamilyOf): string | null {
  const first = person.first_name || 'them'
  const theirs = relative.first_name || 'They'
  const { part } = WORD_MEANS[word]
  if (part === 'sibling') {
    const parents = firstNames(family, 'parents')
    return parents.length > 0 ? `That makes ${theirs} the child of ${namesList(parents)} too, as ${first} is.` : null
  }
  if (part === 'parent' && family.parents.length === 0) {
    const others = firstNames(family, 'siblings')
    return others.length > 0
      ? `${namesList(others)}, ${first}’s ${others.length === 1 ? 'brother or sister' : 'brothers and sisters'}, ${others.length === 1 ? 'becomes' : 'become'} ${theirs}’s ${others.length === 1 ? 'child' : 'children'} too.`
      : null
  }
  return null
}

/** What a link did, said once it is done: the link, and whatever `answer` says moved with it. */
export function linkedWords(
  person: { first_name: string },
  relative: { first_name: string; last_name: string },
  word: FamilyWord,
  answer: LinkAnswer,
): string {
  const first = person.first_name || 'them'
  const parts = [`${fullName(relative)} is now linked as ${first}’s ${word}.`]
  if (answer.parents.length > 0) parts.push(`They are both down as children of ${namesList(answer.parents)}.`)
  if (answer.came.length > 0) {
    parts.push(
      `${namesList(answer.came)}, already linked as ${answer.came.length === 1 ? 'a brother or sister' : 'brothers and sisters'}, came too.`,
    )
  }
  parts.push(answer.parents.length + answer.came.length > 0 ? 'Everybody it changes has been told.' : 'They have both been told.')
  return parts.join(' ')
}

/**
 * Write somebody with no account into a person's family by a word, or
 * (with `id`) change what is written, where the word is not read.
 */
export async function saveFamilyPerson(input: {
  personId: string
  word: FamilyWord | null
  id: string | null
  draft: PersonDraft
}): Promise<void> {
  const { draft } = input
  const { error } = await supabase.rpc('save_family_person', {
    p_person: input.personId,
    p_relation: input.word,
    p_id: input.id,
    p_first: nameToSave(draft.first_name, 'First name'),
    p_last: nameToSave(draft.last_name, 'Last name'),
    p_dob: draft.dob || null,
    p_gender: draft.gender || null,
    p_school: draft.school,
    p_year: draft.year_group,
  })
  if (error) throw error
}

/** Take somebody written in by hand off a person's family. An account is unlinked, not removed. */
export async function removeFamilyPerson(personId: string, id: string): Promise<void> {
  const { error } = await supabase.rpc('remove_family_person', { p_person: personId, p_id: id })
  if (error) throw error
}

/** What is written about somebody, as the form takes it. */
export function draftOf(p: WrittenPerson): PersonDraft {
  return {
    first_name: p.first_name,
    last_name: p.last_name,
    dob: p.dob ?? '',
    gender: p.gender ?? '',
    school: p.school ?? '',
    year_group: p.year_group ?? '',
  }
}

/**
 * "7 Jun 2015 (11) · Year 6 · Hill Primary": what is written about
 * somebody besides their name. Not boy or girl: the word beside them
 * (son, daughter, wife) says it, for an adult as well as a child (0328).
 */
export function writtenDetails(p: WrittenPerson, today: Date = new Date()): string {
  return [dobWithAge(p.dob, today), p.year_group ?? '', p.school ?? ''].filter(Boolean).join(' · ')
}

/** What unlinking these two takes away, said before it is done. */
export function unlinkWords(
  person: { first_name: string },
  relative: { first_name: string },
  relation: FamilyPart,
  family: FamilyOf,
): string {
  const first = person.first_name
  const theirs = relative.first_name
  if (relation === 'spouse') {
    return `${theirs} leaves ${first}’s household. The address and any children on it stay with ${first}.`
  }
  if (relation === 'child') {
    const other = family.spouse[0]
    return other
      ? `${theirs} stops being linked as the child of ${first} and of ${other.first_name}: the two share one household.`
      : `${theirs} stops being linked as ${first}’s child.`
  }
  if (relation === 'sibling') {
    // Brothers and sisters are children of one household: leaving it is leaving its parents.
    const parents = firstNames(family, 'parents')
    return parents.length > 0
      ? `${theirs} stops being linked as ${first}’s brother or sister, and so as the child of ${namesList(parents)}: brothers and sisters are children of one household.`
      : `${theirs} stops being linked as ${first}’s brother or sister.`
  }
  const others = family.parents.filter((p) => p.first_name !== theirs)
  const said =
    others.length > 0
      ? `${first} stops being linked as the child of ${theirs} and of ${others.map((p) => p.first_name).join(' and ')}: parents share one household.`
      : `${first} stops being linked as ${theirs}’s child.`
  // Leaving the parents' household is leaving the brothers and sisters in it.
  const siblings = firstNames(family, 'siblings')
  return siblings.length > 0 ? `${said} ${first} stops being linked to ${namesList(siblings)} as brother or sister too.` : said
}
