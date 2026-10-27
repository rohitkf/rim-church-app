import { z } from 'zod'
import { supabase } from './supabaseClient'

/**
 * Prayer Requests (0197).
 *
 * The database hands the page everything it may show this person in one
 * answer — `prayer_board()` — with an anonymous request's author already
 * left out for whoever should not see it, so nothing here decides who
 * sees what. These are the shapes, the calls, and the sorting into the
 * page's sections.
 */

export const PRAYER_KEY = ['prayer-board'] as const

const personSchema = z.object({ first_name: z.string(), last_name: z.string() })

export const RESPONSES = ['prayed', 'praying', 'fasting'] as const
export type PrayerResponse = (typeof RESPONSES)[number]

export const RESPONSE_WORDS: Record<PrayerResponse, { button: string; counted: string }> = {
  prayed: { button: 'I prayed', counted: 'prayed' },
  praying: { button: 'Still praying', counted: 'still praying' },
  fasting: { button: 'Fasting', counted: 'fasting' },
}

export const prayerRequestSchema = z.object({
  id: z.string(),
  kind: z.enum(['private', 'general']),
  status: z.enum(['open', 'answered', 'closed']),
  body: z.string(),
  anonymous: z.boolean(),
  mine: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  answered_at: z.string().nullable(),
  closed_at: z.string().nullable(),
  testimony: z.string().nullable(),
  testimony_named: z.boolean(),
  shared: z.boolean(),
  /** Null when it is being kept from this person. */
  author: personSchema.extend({ id: z.string() }).nullable(),
  counts: z.object({ prayed: z.number(), praying: z.number(), fasting: z.number() }),
  my_response: z.enum(RESPONSES).nullable(),
  /** Who responded — the author's and the pastors' to see, null for anybody else. */
  responders: z.array(personSchema.extend({ kind: z.enum(RESPONSES) })).nullable(),
  updates: z.array(z.object({ id: z.string(), body: z.string(), created_at: z.string() })),
  /** A pastor asked this person to pray for it (0198). */
  assigned_to_me: z
    .object({ note: z.string().nullable(), by: personSchema.nullable(), at: z.string() })
    .nullable()
    .optional(),
  /** Who has been asked, and how they responded — for whoever may assign. */
  assignees: z
    .array(personSchema.extend({ id: z.string(), show_name: z.boolean(), response: z.enum(RESPONSES).nullable() }))
    .nullable()
    .optional(),
})
export type PrayerRequest = z.infer<typeof prayerRequestSchema>

const audienceSchema = z.object({ teams: z.array(z.string()), people: z.array(z.string()) })

export const prayerListSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** This person is on it. */
  mine: z.boolean(),
  /** Who is on it — the runners' to see. */
  members: audienceSchema.nullable(),
  items: z.array(z.object({ request_id: z.string(), show_name: z.boolean() })),
})
export type PrayerList = z.infer<typeof prayerListSchema>

export const prayerBoardSchema = z.object({
  /** One of the pastors: reads private requests and every author. */
  pastoral: z.boolean(),
  /** May take down a general request. */
  moderator: z.boolean(),
  /** May ask members to pray for a request (0198). */
  may_assign: z.boolean().optional().default(false),
  /** May make and fill prayer lists (0198). */
  may_run_lists: z.boolean().optional().default(false),
  lists: z.array(prayerListSchema).optional().default([]),
  requests: z.array(prayerRequestSchema),
})
export type PrayerBoard = z.infer<typeof prayerBoardSchema>

export async function fetchPrayerBoard(): Promise<PrayerBoard> {
  const { data, error } = await supabase.rpc('prayer_board')
  if (error) throw error
  return prayerBoardSchema.parse(data)
}

async function call(fn: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as unknown
}

export const askForPrayer = (kind: 'private' | 'general', body: string, anonymous: boolean) =>
  call('prayer_ask', { kind, body, anonymous })
export const editPrayer = (id: string, body: string, anonymous: boolean) =>
  call('prayer_edit', { request_id: id, body, anonymous })
export const respondToPrayer = (id: string, response: PrayerResponse | null) =>
  call('prayer_respond', { request_id: id, response })
export const addPrayerUpdate = (id: string, body: string) => call('prayer_add_update', { request_id: id, body })
export const removePrayerUpdate = (updateId: string) => call('prayer_remove_update', { update_id: updateId })
export const markPrayerAnswered = (id: string, testimony: string, named: boolean, share: boolean) =>
  call('prayer_answer', { request_id: id, testimony: testimony.trim() || null, named, share })
export const closePrayer = (id: string) => call('prayer_close', { request_id: id })
export const reopenPrayer = (id: string) => call('prayer_reopen', { request_id: id })
export const removePrayer = (id: string) => call('prayer_remove', { request_id: id })
export const assignPrayer = (id: string, people: string[], showName: boolean, note: string) =>
  call('prayer_assign', { request_id: id, people, show_name: showName, note: note.trim() || null })
export const unassignPrayer = (id: string, person: string) => call('prayer_unassign', { request_id: id, person })
export const savePrayerList = (id: string | null, name: string, members: { teams: string[]; people: string[] }) =>
  call('prayer_list_save', { list_id: id, name, members })
export const deletePrayerList = (id: string) => call('prayer_list_delete', { list_id: id })
export const addToPrayerList = (listId: string, requestId: string, showName: boolean) =>
  call('prayer_list_add', { list_id: listId, request_id: requestId, show_name: showName })
export const removeFromPrayerList = (listId: string, requestId: string) =>
  call('prayer_list_remove', { list_id: listId, request_id: requestId })

export interface PrayerSections {
  /** Open, for the whole church. */
  requests: PrayerRequest[]
  /** This person's own, every kind and state. */
  mine: PrayerRequest[]
  /** Answered, and everybody's to see: general ones, and private ones shared. */
  testimonies: PrayerRequest[]
  /** The pastors': private requests, open first, then answered ones kept private. */
  inbox: PrayerRequest[]
  /** What a pastor asked this person to pray for, still open. */
  assigned: PrayerRequest[]
}

const newest = (a: PrayerRequest, b: PrayerRequest) => b.created_at.localeCompare(a.created_at)
const newestAnswered = (a: PrayerRequest, b: PrayerRequest) => (b.answered_at ?? '').localeCompare(a.answered_at ?? '')

export function prayerSections(board: PrayerBoard): PrayerSections {
  const all = board.requests
  return {
    requests: all.filter((r) => r.kind === 'general' && r.status === 'open').sort(newest),
    mine: all.filter((r) => r.mine).sort(newest),
    testimonies: all
      .filter((r) => r.status === 'answered' && (r.kind === 'general' || r.shared))
      .sort(newestAnswered),
    inbox: board.pastoral
      ? all
          .filter((r) => r.kind === 'private' && r.status !== 'closed')
          .sort((a, b) => (a.status === b.status ? newest(a, b) : a.status === 'open' ? -1 : 1))
      : [],
    assigned: all.filter((r) => r.assigned_to_me && r.status === 'open').sort(newest),
  }
}

/** "12 prayed · 5 still praying · 2 fasting", or null when nobody has yet. */
export function countsLine(counts: PrayerRequest['counts']): string | null {
  const parts = RESPONSES.filter((k) => counts[k] > 0).map((k) => `${counts[k]} ${RESPONSE_WORDS[k].counted}`)
  return parts.length ? parts.join(' · ') : null
}

/** Who asked, as this person may be told. */
export function whoAsked(r: PrayerRequest): string {
  const name = r.author ? `${r.author.first_name} ${r.author.last_name}`.trim() : null
  if (r.mine) return 'You'
  if (r.status === 'answered') return r.testimony_named && name ? name : name ? `${name} (anonymous to others)` : 'Anonymous'
  if (r.anonymous) return name ? `${name} (anonymous to others)` : 'Anonymous'
  // Passed on by a pastor without "Show who asked" (0198).
  return name ?? (r.kind === 'private' ? 'Name kept private' : 'Somebody')
}
