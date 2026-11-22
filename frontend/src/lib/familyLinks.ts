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
 * One more refusal is about the linker, not the family: being in a
 * household is what opens it, so linking yourself to somebody is refused
 * unless you read households anyway (`people.contacts`). Your own family
 * is linked from your profile, where the other person confirms it.
 */

const linkedSchema = z.object({ id: z.string(), first_name: z.string(), last_name: z.string() })
export type LinkedPerson = z.infer<typeof linkedSchema>

/** Somebody with no account, written in by hand: by the family on their profile, or for them here (0320). */
const writtenSchema = z.object({
  id: z.string(),
  first_name: z.string().nullable().transform((v) => v ?? ''),
  last_name: z.string().nullable().transform((v) => v ?? ''),
  dob: z.string().nullable().optional(),
  gender: z.enum(['male', 'female']).nullable().optional(),
  school: z.string().nullable().optional(),
  year_group: z.string().nullable().optional(),
})
export type WrittenPerson = z.infer<typeof writtenSchema>

const NOBODY_WRITTEN = { spouse: [], children: [], parents: [] }

const familyOfSchema = z.object({
  spouse: z.array(linkedSchema).default([]),
  children: z.array(linkedSchema).default([]),
  parents: z.array(linkedSchema).default([]),
  /** The people written in by hand, to be changed or taken off. */
  written_people: z
    .object({
      spouse: z.array(writtenSchema).default([]),
      children: z.array(writtenSchema).default([]),
      parents: z.array(writtenSchema).default([]),
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

/** Link two accounts: `relation` is what `relativeId` is to `personId`. */
export async function linkFamily(personId: string, relativeId: string, relation: Relation): Promise<void> {
  const { error } = await supabase.rpc('link_family', { p_person: personId, p_relative: relativeId, p_relation: relation })
  if (error) throw error
}

/** Take the link between two accounts away, whichever it is. */
export async function unlinkFamily(personId: string, relativeId: string): Promise<void> {
  const { error } = await supabase.rpc('unlink_family', { p_person: personId, p_relative: relativeId })
  if (error) throw error
}

export const fullName = (p: { first_name: string; last_name: string }) => `${p.first_name} ${p.last_name}`.trim()

/** The three ways two people can be linked, in the order they are offered. */
export const FAMILY_RELATIONS: readonly Relation[] = ['spouse', 'child', 'parent']

/** What each is called: over its list, and for one person in a sentence. */
export const FAMILY_WORDS: Record<Relation, { heading: string; one: string }> = {
  spouse: { heading: 'Husband or wife', one: 'husband or wife' },
  child: { heading: 'Children', one: 'child' },
  parent: { heading: 'Parents', one: 'parent' },
}

/** Which of a family's three lists a relation is: the key `family_of()` files people under. */
export const LIST_OF: Record<Relation, 'spouse' | 'children' | 'parents'> = { spouse: 'spouse', child: 'children', parent: 'parents' }

/** Write somebody with no account into a person's family, or (with `id`) change what is written. */
export async function saveFamilyPerson(input: {
  personId: string
  relation: Relation
  id: string | null
  draft: PersonDraft
}): Promise<void> {
  const { draft } = input
  const { error } = await supabase.rpc('save_family_person', {
    p_person: input.personId,
    p_relation: input.relation,
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

/** "7 Jun 2015 (11) · Girl · Year 6 · Hill Primary": what is written about somebody besides their name. */
export function writtenDetails(p: WrittenPerson, today: Date = new Date()): string {
  return [dobWithAge(p.dob, today), p.gender ? (p.gender === 'male' ? 'Boy' : 'Girl') : '', p.year_group ?? '', p.school ?? '']
    .filter(Boolean)
    .join(' · ')
}

/** What unlinking these two takes away, said before it is done. */
export function unlinkWords(
  person: { first_name: string },
  relative: { first_name: string },
  relation: Relation,
  family: Pick<FamilyOf, 'spouse' | 'parents'>,
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
  const others = family.parents.filter((p) => p.first_name !== theirs)
  return others.length > 0
    ? `${first} stops being linked as the child of ${theirs} and of ${others.map((p) => p.first_name).join(' and ')}: parents share one household.`
    : `${first} stops being linked as ${theirs}’s child.`
}
