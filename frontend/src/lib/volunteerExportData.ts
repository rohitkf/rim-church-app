import { z } from 'zod'
import { supabase } from './supabaseClient'
import { fetchAccountBlocks } from './accountBlocks'
import { fetchGuests } from './guests'
import { fetchPeopleSetup } from './gettingSetUp'
import { fetchMinors } from './minors'
import type { ExportDetails, ExportGuest, ExportInput, ExportServing, ExportSetup } from './volunteerExport'

/*
 * Everything else the volunteer export can carry, read when it is asked
 * for and not before (the Owner, November 2026: "as detailed as possible
 * [...] Every single details about that person").
 *
 * The page has names, teams and roles in hand. The rest lives in six
 * places, each with its own reader and its own right: marital status and
 * the account's dates (people.contacts, 0322), whether details are
 * finished (people.onboard), who is blocked (people.block), who is under
 * 18 (people.minors), every time on the rota, and the guest roll.
 *
 * Each is read on its own and a part that cannot be read is named and
 * left out: one refusal must not cost the Owner the whole file. What was
 * left out is handed back so the dialog can say so, rather than a sheet
 * with a column quietly missing.
 */

export interface ExportRights {
  /** Marital status and the account's dates go with contact details. */
  contacts: boolean
  setup: boolean
  blocks: boolean
  minors: boolean
}

export type ExportExtras = Pick<ExportInput, 'details' | 'setup' | 'blocks' | 'minors' | 'serving' | 'guests'> & {
  /** What could not be read, in words for the dialog. */
  leftOut: string[]
}

const detailsSchema = z.array(
  z.object({
    id: z.string(),
    marital_status: z.string().nullable(),
    joined_at: z.string().nullable(),
    email_confirmed_at: z.string().nullable(),
    last_sign_in_at: z.string().nullable(),
  }),
)

export async function fetchPeopleDetails(): Promise<Map<string, ExportDetails>> {
  const { data, error } = await supabase.rpc('people_details')
  if (error) throw error
  return new Map(detailsSchema.parse(data ?? []).map(({ id, ...rest }) => [id, rest]))
}

const servingSchema = z.array(
  z.object({
    user_id: z.string(),
    department_id: z.string(),
    role_label: z.string().nullable(),
    is_shadow: z.boolean().nullable().optional(),
    service: z.object({ date: z.string(), service_type: z.string() }).nullable(),
  }),
)

/** A page of rows at a time: the Data API hands back a thousand at most. */
const PAGE = 1000
const MOST_PAGES = 30

/** Every time anybody is on the rota, past and coming. */
export async function fetchServing(): Promise<ExportServing[]> {
  const rows: ExportServing[] = []
  for (let page = 0; page < MOST_PAGES; page += 1) {
    const { data, error } = await supabase
      .from('rota_assignments')
      .select('user_id, department_id, role_label, is_shadow, service:services(date, service_type)')
      .order('id')
      .range(page * PAGE, page * PAGE + PAGE - 1)
    if (error) throw error
    const got = servingSchema.parse(data ?? [])
    for (const r of got) {
      if (r.service) rows.push({ user_id: r.user_id, department_id: r.department_id, role_label: r.role_label, is_shadow: r.is_shadow, date: r.service.date, service_type: r.service.service_type })
    }
    if (got.length < PAGE) break
  }
  return rows
}

const guestTeamsSchema = z.array(z.object({ guest_id: z.string(), department_id: z.string(), member_type: z.enum(['core', 'guest']) }))

/** The guest roll, with the teams each guest is on. */
export async function fetchExportGuests(): Promise<ExportGuest[]> {
  const [guests, teams] = await Promise.all([
    fetchGuests(),
    supabase.from('department_guests').select('guest_id, department_id, member_type'),
  ])
  if (teams.error) throw teams.error
  const on = guestTeamsSchema.parse(teams.data ?? [])
  return guests.map((g) => ({
    id: g.id,
    name: g.name,
    title: g.title,
    note: g.note,
    became_member: !!g.became_member,
    teams: on.filter((t) => t.guest_id === g.id).map(({ department_id, member_type }) => ({ department_id, member_type })),
  }))
}

/** Read every part the reader has the right to, each on its own. */
export async function fetchExportExtras(rights: ExportRights): Promise<ExportExtras> {
  const leftOut: string[] = []
  const part = async <T>(wanted: boolean, read: () => Promise<T>, name: string): Promise<T | undefined> => {
    if (!wanted) return undefined
    try {
      return await read()
    } catch (err) {
      console.error(`export: ${name} could not be read`, err)
      leftOut.push(name)
      return undefined
    }
  }
  const [details, setupRows, blockRows, minors, serving, guests] = await Promise.all([
    part(rights.contacts, fetchPeopleDetails, 'marital status and sign-in dates'),
    part(rights.setup, fetchPeopleSetup, 'whether details are finished'),
    part(rights.blocks, fetchAccountBlocks, 'who is blocked'),
    part(rights.minors, fetchMinors, 'who is under 18'),
    part(true, fetchServing, 'the rota'),
    part(true, fetchExportGuests, 'the guest roll'),
  ])
  const setup = setupRows
    ? new Map<string, ExportSetup>(setupRows.map((r) => [r.user_id, { joined: r.joined, gaps: r.gaps, notifications: r.notifications, completed_at: r.completed_at }]))
    : undefined
  const blocks = blockRows ? new Map(blockRows.map((b) => [b.user_id, { blocked_at: b.blocked_at, reason: b.reason }])) : undefined
  return { details, setup, blocks, minors, serving, guests, leftOut }
}
