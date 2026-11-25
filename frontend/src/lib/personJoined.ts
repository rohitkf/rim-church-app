import { z } from 'zod'
import { supabase } from './supabaseClient'
import { nameOf, type Family, type FamilyMember } from './families'
import { wordFor, type FamilyPart } from './familyLinks'
import { guestLabel, type Guest } from './guests'

/*
 * Somebody who joins the app is linked once (0332).
 *
 * A person with no account can be on the guest roll, because they serve,
 * and written into a family by hand, because they are somebody's wife or
 * son. The two lists do not know about each other. So wherever one of
 * them is linked to the account the person now has, the other is looked
 * for by name and offered in the same step, and `person_joined()` does
 * both together or neither.
 *
 * Looked for, never assumed: two people can share a name, so a match is a
 * line with a tick the linker can take off. It starts ticked only where
 * the whole name is the same.
 */

const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

/**
 * How alike two names are: 'same' when every word matches, 'near' when
 * the first names match and the rest does not disagree (one of them has
 * no last name, as somebody written in as just "Sam" has not), and null
 * for two different people.
 */
export function nameLikeness(a: string, b: string): 'same' | 'near' | null {
  const x = plain(a)
  const y = plain(b)
  if (x.length === 0 || y.length === 0) return null
  if (x.join(' ') === y.join(' ')) return 'same'
  if (x[0] !== y[0]) return null
  if (x.length === 1 || y.length === 1) return 'near'
  return x[x.length - 1] === y[y.length - 1] ? 'near' : null
}

/** The better of the likenesses of one name to any of several. */
function bestLikeness(name: string, others: readonly string[]): 'same' | 'near' | null {
  let best: 'same' | 'near' | null = null
  for (const other of others) {
    const got = nameLikeness(name, other)
    if (got === 'same') return 'same'
    if (got) best = got
  }
  return best
}

/** Somebody written into a family who may be the person now being linked. */
export interface WrittenMatch {
  /** The household row: what `person_joined()` is told. */
  id: string
  name: string
  /** What they are written in as, and to whom: read the way the database reads it (0332). */
  part: FamilyPart
  beside: FamilyMember
  gender: FamilyMember['gender']
  /** The whole name is the same, so the tick starts on. */
  exact: boolean
}

/** What a written-in person is, from where they are written: the same four answers `person_joined()` gives. */
function standing(family: Family, written: FamilyMember, accountId: string): { part: FamilyPart; beside: FamilyMember } | null {
  const others = family.members.filter((m) => m.user_id && m.user_id !== accountId)
  const adult = others.find((m) => m.kind === 'adult')
  const child = others.find((m) => m.kind === 'child')
  if (written.kind === 'adult') {
    if (adult) return { part: 'spouse', beside: adult }
    return child ? { part: 'parent', beside: child } : null
  }
  if (adult) return { part: 'child', beside: adult }
  return child ? { part: 'sibling', beside: child } : null
}

/**
 * The people written into any family whose name is like one of `names`
 * (the guest's, the account's), the exact ones first. Somebody the
 * account is already linked beside is not offered twice.
 */
export function writtenMatches(families: readonly Family[], names: readonly string[], accountId: string): WrittenMatch[] {
  const found: WrittenMatch[] = []
  for (const family of families) {
    for (const m of family.members) {
      if (m.user_id) continue
      const like = bestLikeness(nameOf(m), names)
      if (!like) continue
      const is = standing(family, m, accountId)
      if (!is) continue
      found.push({ id: m.id, name: nameOf(m), part: is.part, beside: is.beside, gender: m.gender ?? null, exact: like === 'same' })
    }
  }
  return found.sort((a, b) => Number(b.exact) - Number(a.exact) || a.name.localeCompare(b.name))
}

/** "Sam Thomas, written in as Anna’s husband". */
export function writtenLine(m: WrittenMatch): string {
  return `${m.name}, written in as ${m.beside.first_name || 'somebody'}’s ${wordFor(m.part, m.gender)}`
}

/** Somebody still on the guest list who may be the account now being linked. */
export interface GuestMatch {
  guest: Guest
  exact: boolean
}

/** The guests not yet linked whose name is like the account's, the exact ones first. */
export function guestMatches(guests: readonly Guest[], accountName: string): GuestMatch[] {
  return guests
    .filter((g) => !g.became_member)
    .map((guest) => ({ guest, like: nameLikeness(guest.name, accountName) }))
    .filter((x): x is { guest: Guest; like: 'same' | 'near' } => x.like !== null)
    .map((x) => ({ guest: x.guest, exact: x.like === 'same' }))
    .sort((a, b) => Number(b.exact) - Number(a.exact) || a.guest.name.localeCompare(b.guest.name))
}

/** "Also on the guest list as Pastor Sam Thomas". */
export const guestLine = (m: GuestMatch) => `On the guest list as ${guestLabel(m.guest)}`

const answerSchema = z.object({
  guest: z.boolean(),
  family: z.array(z.object({ word: z.string().nullable(), beside: z.string().nullable() })),
})
export type JoinedAnswer = z.infer<typeof answerSchema>

/**
 * Link the account to who it was: a guest, people written into families,
 * or both. Together or not at all; a refusal comes back in the
 * database's own words.
 */
export async function personJoined(accountId: string, guestId: string | null, writtenIds: readonly string[]): Promise<JoinedAnswer> {
  const { data, error } = await supabase.rpc('person_joined', {
    p_account: accountId,
    p_guest: guestId,
    p_written: writtenIds.length > 0 ? [...writtenIds] : null,
  })
  if (error) throw error
  return answerSchema.parse(data)
}
