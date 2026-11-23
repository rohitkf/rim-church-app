import { z } from 'zod'
import { supabase } from './supabaseClient'

/*
 * Every family, on one page (0326).
 *
 * `families()` hands whoever holds `people.family` each household that is
 * a family — two people or more — with who is in it by name: the accounts,
 * and the people written in by hand. Never an address, a date of birth or
 * a school: those are the family's and `people.contacts`'.
 *
 * One family drawn as a tree comes from `family_of()` (lib/familyLinks),
 * which already reads somebody's own household and their parents'
 * together.
 */

const memberSchema = z.object({
  /** The row in the household: what a written-in person is known by. */
  id: z.string(),
  /** Their account, or null for somebody written in by hand. */
  user_id: z.string().nullable(),
  kind: z.enum(['adult', 'child']),
  first_name: z.string().nullable().transform((v) => v ?? ''),
  last_name: z.string().nullable().transform((v) => v ?? ''),
  /** What a word has said of them (0329): null, or left out, where nobody has said. */
  gender: z.enum(['male', 'female']).nullable().optional(),
})
export type FamilyMember = z.infer<typeof memberSchema>

const familySchema = z.object({ id: z.string(), members: z.array(memberSchema) })
export type Family = z.infer<typeof familySchema>

/** Under the family's own key, so a household changing anywhere reads it again (lib/liveTables). */
export const FAMILIES_KEY = ['family', 'all'] as const

export async function fetchFamilies(): Promise<Family[]> {
  const { data, error } = await supabase.rpc('families')
  if (error) throw error
  return z.array(familySchema).parse(data ?? [])
}

export interface PersonName {
  id: string
  first_name: string
  last_name: string
}

export const PEOPLE_NAMES_KEY = ['people-names'] as const

/** Everybody with an account, by name: what the whole church can already read (0127). */
export async function fetchPeopleNames(): Promise<PersonName[]> {
  const { data, error } = await supabase.from('profiles').select('id, first_name, last_name').order('first_name')
  if (error) throw error
  return z
    .array(z.object({ id: z.string(), first_name: z.string().nullable(), last_name: z.string().nullable() }))
    .parse(data ?? [])
    .map((p) => ({ id: p.id, first_name: p.first_name ?? '', last_name: p.last_name ?? '' }))
}

export const nameOf = (p: { first_name: string; last_name: string }) => `${p.first_name} ${p.last_name}`.trim()

/**
 * What a family is called on its card: its adults, sharing a last name
 * where they do. "Anna & Tom Jacob", "Anna Jacob & Tom Mathew", "Gran
 * Thomas". A household with no adults in it is brothers and sisters with
 * no parent listed (0328), and is called by all of them the same way.
 */
export function familyTitle(family: Family): string {
  const adults = family.members.filter((m) => m.kind === 'adult')
  const named = (adults.length > 0 ? adults : family.members).filter((m) => nameOf(m))
  if (named.length === 0) return 'A family'
  if (named.length === 1) return nameOf(named[0])
  const last = named[0].last_name
  const shared = last !== '' && named.every((m) => m.last_name === last)
  if (shared) return `${named.map((m) => m.first_name).join(' & ')} ${last}`
  return named.map(nameOf).join(' & ')
}

/** "2 adults, 3 children", in the words a card has room for. */
export function familyCount(family: Family): string {
  const adults = family.members.filter((m) => m.kind === 'adult').length
  const children = family.members.length - adults
  // Nobody above them: they are each other's brothers and sisters, of whatever age.
  if (adults === 0 && children > 1) return `${children} brothers and sisters`
  const parts = [
    adults > 0 ? `${adults} ${adults === 1 ? 'adult' : 'adults'}` : '',
    children > 0 ? `${children} ${children === 1 ? 'child' : 'children'}` : '',
  ].filter(Boolean)
  return parts.join(', ')
}

/**
 * Households that are one family, shown as one (the Owner, November 2026:
 * "Rohit has mentioned his parents. Jolsna is his wife. I don't want
 * separate list of Rohit parents. And another separate one with Rohit and
 * jolsna. Combine families if they're all part of a family").
 *
 * The database keeps a family as households: somebody's own, and the one
 * they are a child of. Both came back as families, so a man who wrote his
 * parents in was listed twice, once under them and once beside his wife.
 * Households that share a person are joined here, by any chain: his
 * parents', his own, and his wife's parents' are one family on the page.
 */
export interface FamilyGroup {
  /** Stable for a list: the id of the household it is called by. */
  id: string
  /** The household it is called by: see `combineFamilies`. */
  head: Family
  /** Every household in it, the oldest generation first. */
  households: Family[]
  /** Everybody in it, once: generation by generation, adults before children. */
  members: FamilyMember[]
  /** How many generations of adults it has. */
  generations: number
}

/**
 * Which generation each household is, and whose it is: a household is one
 * below the household its adults are children of. `depth[i]` is for
 * `families[i]`; `homeOf` is the household somebody is an adult of.
 */
export function generationsOf(families: readonly Family[]): { depth: number[]; homeOf: Map<string, number> } {
  // Where somebody is an adult: their own household.
  const homeOf = new Map<string, number>()
  families.forEach((f, i) => {
    for (const m of f.members) if (m.user_id && m.kind === 'adult') homeOf.set(m.user_id, i)
  })
  // A household is one generation below the one its adults are children of.
  const above = families.map(() => [] as number[])
  families.forEach((f, i) => {
    for (const m of f.members) {
      const home = m.user_id && m.kind === 'child' ? homeOf.get(m.user_id) : undefined
      if (home !== undefined && home !== i) above[home].push(i)
    }
  })
  const depth = families.map(() => 0)
  // As many passes as there are households is enough, and stops a loop in the data going round for ever.
  for (let pass = 0; pass < families.length; pass += 1) {
    let moved = false
    families.forEach((_, i) => {
      const d = above[i].length > 0 ? Math.max(...above[i].map((a) => depth[a])) + 1 : 0
      if (d > depth[i] && d <= families.length) {
        depth[i] = d
        moved = true
      }
    })
    if (!moved) break
  }
  return { depth, homeOf }
}

export function combineFamilies(families: readonly Family[]): FamilyGroup[] {
  // Which group each household is in: joined wherever two share an account.
  const group = families.map((_, i) => i)
  const find = (i: number): number => (group[i] === i ? i : (group[i] = find(group[i])))
  const seenIn = new Map<string, number>()
  families.forEach((f, i) => {
    for (const m of f.members) {
      if (!m.user_id) continue
      const before = seenIn.get(m.user_id)
      if (before === undefined) seenIn.set(m.user_id, i)
      else group[find(i)] = find(before)
    }
  })

  const { depth, homeOf } = generationsOf(families)

  const byGroup = new Map<number, number[]>()
  families.forEach((_, i) => {
    const g = find(i)
    byGroup.set(g, [...(byGroup.get(g) ?? []), i])
  })

  const accounts = (f: Family) => f.members.filter((m) => m.kind === 'adult' && m.user_id).length
  return [...byGroup.values()]
    .map((ids) => {
      const order = [...ids].sort((a, b) => depth[a] - depth[b] || a - b)
      // Called by the household with the most of its adults on the app: the
      // people the church knows. Two the same, by the older generation.
      const head = order.reduce((best, i) => (accounts(families[i]) > accounts(families[best]) ? i : best), order[0])
      // Somebody with a household of their own is shown there, beside their
      // husband or wife, and not a second time among their parents' children.
      const members: FamilyMember[] = []
      const shown = new Set<string>()
      for (const kind of ['adult', 'child'] as const) {
        // The adults of every generation, then the children who are nobody's husband or wife here.
        for (const i of order) {
          for (const m of families[i].members) {
            if (m.kind !== kind) continue
            if (m.user_id) {
              if (shown.has(m.user_id) || (kind === 'child' && ids.includes(homeOf.get(m.user_id) ?? -1))) continue
              shown.add(m.user_id)
            }
            members.push(m)
          }
        }
      }
      const generations = new Set(order.filter((i) => families[i].members.some((m) => m.kind === 'adult')).map((i) => depth[i])).size
      return { at: head, group: { id: families[head].id, head: families[head], households: order.map((i) => families[i]), members, generations } }
    })
    .sort((a, b) => a.at - b.at)
    .map((g) => g.group)
}

/** What a family of several households is called: by the household it is headed by. */
export const groupTitle = (g: FamilyGroup): string => familyTitle(g.head)

/** "2 adults, 3 children" for one household; "6 people, 2 generations" for several joined. */
export function groupCount(g: FamilyGroup): string {
  if (g.households.length === 1) return familyCount(g.head)
  const people = `${g.members.length} people`
  return g.generations > 1 ? `${people}, ${g.generations} generations` : people
}

/** A family is found by anybody in it. */
export const groupMatches = (g: FamilyGroup, typed: string) => g.members.some((m) => nameMatches(nameOf(m), typed))

/** The account to open a family from: one of the household it is called by, or failing that anybody on the app. */
export function groupAnchor(g: FamilyGroup): FamilyMember | null {
  return anchorOf(g.head) ?? g.members.find((m) => m.user_id) ?? null
}

/** Lower case, accents off, so "jose" finds "José". */
const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Whether every word typed is in the name, in any order: "jacob an" finds Anna Jacob. */
export function nameMatches(name: string, typed: string): boolean {
  const words = plain(typed).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const hay = plain(name)
  return words.every((w) => hay.includes(w))
}

/** A family is found by anybody in it. */
export const familyMatches = (family: Family, typed: string) => family.members.some((m) => nameMatches(nameOf(m), typed))

/**
 * Everybody with an account who is in no family: nobody linked to them,
 * and nobody written in beside them. They are who the page is for.
 */
export function onTheirOwn(people: readonly PersonName[], families: readonly Family[]): PersonName[] {
  const linked = new Set(families.flatMap((f) => f.members.map((m) => m.user_id).filter((id): id is string => !!id)))
  return people.filter((p) => !linked.has(p.id))
}

/**
 * The account to open a family from: its first adult with an account, or
 * failing that its first child with one. Null for a family with nobody on
 * the app in it, which cannot be opened from anybody.
 */
export function anchorOf(family: Family): FamilyMember | null {
  return family.members.find((m) => m.kind === 'adult' && m.user_id) ?? family.members.find((m) => m.user_id) ?? null
}
