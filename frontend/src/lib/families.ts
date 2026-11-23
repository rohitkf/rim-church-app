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
 * Thomas". A household with only children written in is "The family of"
 * nobody, so it falls back to its first member.
 */
export function familyTitle(family: Family): string {
  const adults = family.members.filter((m) => m.kind === 'adult')
  const named = (adults.length > 0 ? adults : family.members.slice(0, 1)).filter((m) => nameOf(m))
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
  const parts = [
    adults > 0 ? `${adults} ${adults === 1 ? 'adult' : 'adults'}` : '',
    children > 0 ? `${children} ${children === 1 ? 'child' : 'children'}` : '',
  ].filter(Boolean)
  return parts.join(', ')
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
