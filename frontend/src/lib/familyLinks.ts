import { z } from 'zod'
import { supabase } from './supabaseClient'
import type { Relation } from './family'

/*
 * Linking a family for them (0319).
 *
 * A family is a household (0149), and its own people link it from their
 * profiles: one asks, the other says yes. Whoever holds `people.family`
 * (Admins and the Owner out of the box) can make the same link directly,
 * for any two accounts, from the person's card on Volunteers: husband and
 * wife, or a child and their parents. Nobody is asked; both are told.
 *
 * The database does all of it. `family_of()` hands back the accounts
 * linked to one person and a count of the people written in by hand —
 * not who those are, not an address, not a date of birth: a household is
 * its family's and `people.contacts`' to read. `link_family()` and
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

const familyOfSchema = z.object({
  spouse: z.array(linkedSchema).default([]),
  children: z.array(linkedSchema).default([]),
  parents: z.array(linkedSchema).default([]),
  /** People written in by hand on the family's own profiles: how many, never who. */
  written: z
    .object({ spouse: z.number().default(0), children: z.number().default(0), parents: z.number().default(0) })
    .default({ spouse: 0, children: 0, parents: 0 }),
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

/** "2 children written in by hand, with no account", or nothing when there are none. */
export function writtenWords(relation: Relation, count: number): string | null {
  if (count <= 0) return null
  if (relation === 'spouse') return 'A husband or wife is written in by hand on their profile, with no account. Linking an account here takes its place.'
  const what = relation === 'child' ? (count === 1 ? 'child is' : 'children are') : count === 1 ? 'parent is' : 'parents are'
  return `${count} ${what} written in by hand on their profile, with no account.`
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
