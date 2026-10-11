import { z } from 'zod'
import { supabase } from './supabaseClient'
import { ageFrom } from './celebrations'

/*
 * A family is a household (0149): one address, up to two adults, any
 * number of children. Somebody with an account is linked by id, and their
 * name and date of birth come from their own profile; anybody else is
 * written in by hand. Linking an account needs that person's yes.
 *
 * The database decides who sees what — the family and the Owner — and
 * every change goes through its functions, so this file only reads what
 * comes back and calls them.
 */

const linkedPersonSchema = z.object({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  dob: z.string().nullable(),
  avatar_url: z.string().nullable().optional(),
})

export const householdMemberSchema = z.object({
  id: z.string(),
  household_id: z.string(),
  kind: z.enum(['adult', 'child']),
  user_id: z.string().nullable(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  dob: z.string().nullable(),
  gender: z.enum(['male', 'female']).nullable(),
  school: z.string().nullable(),
  year_group: z.string().nullable(),
  person: linkedPersonSchema.nullable().optional(),
})
export type HouseholdMember = z.infer<typeof householdMemberSchema>

export const householdSchema = z.object({
  id: z.string(),
  address_line1: z.string().nullable(),
  address_line2: z.string().nullable(),
  town: z.string().nullable(),
  postcode: z.string().nullable(),
})
export type Household = z.infer<typeof householdSchema>

export type Relation = 'spouse' | 'child' | 'parent'

export const linkRequestSchema = z.object({
  id: z.string(),
  from_user: z.string(),
  to_user: z.string(),
  relation: z.enum(['spouse', 'child', 'parent']),
  replaces_member: z.string().nullable(),
  created_at: z.string(),
  from: z.object({ first_name: z.string(), last_name: z.string() }).nullable().optional(),
  to: z.object({ first_name: z.string(), last_name: z.string() }).nullable().optional(),
})
export type LinkRequest = z.infer<typeof linkRequestSchema>

export const FAMILY_KEY = ['family'] as const

const MEMBER_COLUMNS =
  'id, household_id, kind, user_id, first_name, last_name, dob, gender, school, year_group, person:profiles!household_members_user_id_fkey(id, first_name, last_name, dob, avatar_url)'

/** Every household the reader may see, and everybody in them. */
export async function fetchHouseholds(): Promise<{ households: Household[]; members: HouseholdMember[] }> {
  const [h, m] = await Promise.all([
    supabase.from('households').select('id, address_line1, address_line2, town, postcode'),
    supabase.from('household_members').select(MEMBER_COLUMNS),
  ])
  if (h.error) throw h.error
  if (m.error) throw m.error
  return {
    households: z.array(householdSchema).parse(h.data ?? []),
    members: z.array(householdMemberSchema).parse(m.data ?? []),
  }
}

/** Requests made by me, and of me, still waiting. */
export async function fetchLinkRequests(): Promise<LinkRequest[]> {
  const { data, error } = await supabase
    .from('family_link_requests')
    .select(
      'id, from_user, to_user, relation, replaces_member, created_at, from:profiles!family_link_requests_from_user_fkey(first_name, last_name), to:profiles!family_link_requests_to_user_fkey(first_name, last_name)',
    )
    .order('created_at')
  if (error) throw error
  return z.array(linkRequestSchema).parse(data ?? [])
}

/** My home (where I am an adult), and my parents' (where I am a child). */
export function myFamily(
  data: { households: Household[]; members: HouseholdMember[] } | undefined,
  myId: string | undefined,
) {
  const households = data?.households ?? []
  const members = data?.members ?? []
  const homeId = members.find((m) => m.user_id === myId && m.kind === 'adult')?.household_id ?? null
  const parentsId = members.find((m) => m.user_id === myId && m.kind === 'child')?.household_id ?? null
  const inHome = members.filter((m) => m.household_id === homeId)
  const inParents = members.filter((m) => m.household_id === parentsId)
  return {
    home: households.find((h) => h.id === homeId) ?? null,
    spouse: inHome.find((m) => m.kind === 'adult' && m.user_id !== myId) ?? null,
    children: inHome.filter((m) => m.kind === 'child'),
    parents: inParents.filter((m) => m.kind === 'adult'),
  }
}

/** A person's name, from their profile when linked. */
export function nameOf(m: HouseholdMember): string {
  const first = m.person?.first_name ?? m.first_name ?? ''
  const last = m.person?.last_name ?? m.last_name ?? ''
  return `${first} ${last}`.trim()
}

export function dobOf(m: HouseholdMember): string | null {
  return m.person ? m.person.dob : m.dob
}

/** "12 Mar 2015 (11)", or the age alone when the date is not wanted. */
export function dobWithAge(dob: string | null | undefined, today: Date = new Date()): string {
  if (!dob) return ''
  const age = ageFrom(dob, today)
  const date = new Date(`${dob}T12:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return age === null ? date : `${date} (${age})`
}

export const RELATION_LABEL: Record<Relation, string> = {
  spouse: 'spouse',
  child: 'child',
  parent: 'parent',
}

/* ---- Changes, every one through the database's own functions ---- */

export async function saveAddress(a: {
  line1: string
  line2: string
  town: string
  postcode: string
}): Promise<void> {
  const { error } = await supabase.rpc('save_household_address', {
    p_line1: a.line1,
    p_line2: a.line2,
    p_town: a.town,
    p_postcode: a.postcode,
  })
  if (error) throw error
}

export interface PersonDraft {
  first_name: string
  last_name: string
  dob: string
  gender: '' | 'male' | 'female'
  school: string
  year_group: string
}

export const EMPTY_PERSON: PersonDraft = {
  first_name: '',
  last_name: '',
  dob: '',
  gender: '',
  school: '',
  year_group: '',
}

export async function savePerson(input: {
  id: string | null
  where: 'home' | 'parents'
  kind: 'adult' | 'child'
  draft: PersonDraft
}): Promise<void> {
  const { draft } = input
  const { error } = await supabase.rpc('save_household_person', {
    p_id: input.id,
    p_where: input.where,
    p_kind: input.kind,
    p_first: draft.first_name,
    p_last: draft.last_name,
    p_dob: draft.dob || null,
    p_gender: draft.gender || null,
    p_school: draft.school,
    p_year: draft.year_group,
  })
  if (error) throw error
}

export async function removePerson(id: string): Promise<void> {
  const { error } = await supabase.rpc('remove_household_person', { p_id: id })
  if (error) throw error
}

export async function requestLink(to: string, relation: Relation, replaces: string | null): Promise<void> {
  const { error } = await supabase.rpc('request_family_link', {
    p_to: to,
    p_relation: relation,
    p_replaces: replaces,
  })
  if (error) throw error
}

export async function cancelLink(id: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_family_link', { p_request: id })
  if (error) throw error
}

export async function answerLink(id: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('answer_family_link', { p_request: id, p_accept: accept })
  if (error) throw error
}

/* ---- Finding somebody who already has an account ---- */

const suggestionSchema = z.object({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  avatar_url: z.string().nullable().optional(),
})
export type Suggestion = z.infer<typeof suggestionSchema>

/** Characters PostgREST's filter syntax would read as its own. */
const clean = (s: string) => s.replace(/[,()%*\\:."']/g, '').trim()

/**
 * Accounts whose name starts like what has been typed: "gr" finds Grace,
 * "grace me" finds Grace Mensah. Names are readable by everybody signed
 * in (0127), so this is no wider than the app already is.
 */
export async function findPeople(typed: string, excludeId?: string): Promise<Suggestion[]> {
  const words = clean(typed).split(/\s+/).filter(Boolean)
  if (words.length === 0 || words.join('').length < 2) return []
  let query = supabase.from('profiles').select('id, first_name, last_name, avatar_url').limit(6)
  if (words.length === 1) {
    query = query.or(`first_name.ilike.${words[0]}%,last_name.ilike.${words[0]}%`)
  } else {
    query = query.ilike('first_name', `${words[0]}%`).ilike('last_name', `${words.slice(1).join(' ')}%`)
  }
  if (excludeId) query = query.neq('id', excludeId)
  const { data, error } = await query
  if (error) throw error
  return z.array(suggestionSchema).parse(data ?? [])
}
