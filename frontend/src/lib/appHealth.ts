import { z } from 'zod'
import { supabase } from './supabaseClient'
import type { ErrorSource } from './clientErrors'

/**
 * Settings › App Health: what has gone wrong, read back (0284).
 *
 * Three things, all the database's: the errors people's devices reported
 * (`client_errors`, written by lib/clientErrors), the timed jobs and
 * pushes that failed (`health_events`, copied hourly out of the
 * platform's short-lived logs), and how things stand this minute
 * (`health_overview()`). Whoever holds `settings.health` reads them — the
 * Owner alone out of the box — and is told once a day, in the bell, when
 * there is something new.
 *
 * This file is the reading and the arithmetic: errors folded by what
 * they say and which build said it, so six phones hitting one bug is one
 * thing to look at, and the words for each.
 */

export const HEALTH_ERRORS_KEY = ['app-health', 'errors']
export const HEALTH_EVENTS_KEY = ['app-health', 'events']
export const HEALTH_OVERVIEW_KEY = ['app-health', 'overview']

/** Both tables are cleared after this long (delete_old_health_records). */
export const HEALTH_KEPT_DAYS = 30

const reporterSchema = z.object({ first_name: z.string().nullable(), last_name: z.string().nullable() })

export const clientErrorSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  last_at: z.string(),
  times: z.number(),
  user_id: z.string().nullable(),
  source: z.string(),
  message: z.string(),
  stack: z.string().nullable(),
  page: z.string().nullable(),
  build: z.string().nullable(),
  device: z.string().nullable(),
  installed: z.boolean().nullable(),
  // A person since removed, or a visitor: nobody to name.
  reporter: reporterSchema.nullable().catch(null).default(null),
})
export type ClientError = z.infer<typeof clientErrorSchema>

export const healthEventSchema = z.object({
  id: z.number(),
  kind: z.enum(['job', 'push', 'call']),
  name: z.string(),
  at: z.string(),
  detail: z.string().nullable(),
})
export type HealthEvent = z.infer<typeof healthEventSchema>

const jobSchema = z.object({
  name: z.string().nullable(),
  schedule: z.string().nullable(),
  active: z.boolean().nullable(),
  runs: z.number(),
  failed: z.number(),
  last_at: z.string().nullable(),
  last_ok: z.boolean().nullable(),
})
export type HealthJob = z.infer<typeof jobSchema>

export const healthOverviewSchema = z.object({
  at: z.string(),
  jobs: z.array(jobSchema).catch([]),
  pushes: z.object({ asked: z.number(), answered: z.number(), failed: z.number(), hours: z.number() }),
  database: z.object({ bytes: z.number(), connections: z.number(), connections_max: z.number() }),
  errors: z.object({ day: z.number(), kept: z.number() }),
  // Which migration the database has reached, by its own ledger (0285). A
  // database from before that has no ledger to read, and says nothing.
  schema: z
    .object({ version: z.number(), recorded: z.number(), latest: z.string().nullable(), latest_at: z.string().nullable() })
    .nullable()
    .catch(null)
    .default(null),
})
export type HealthOverview = z.infer<typeof healthOverviewSchema>

/**
 * What the ledger says, in a sentence, against the migration this build
 * needs. Behind is the one that matters; ahead is the ordinary state
 * between releases, because the database always goes first.
 */
export function ledgerWords(schema: HealthOverview['schema'], needs: number): { tone: 'green' | 'orange'; words: string } | null {
  if (!schema) return null
  const gaps = schema.recorded > schema.version ? ` ${schema.recorded - schema.version} recorded after a gap do not count.` : ''
  if (schema.version < needs) {
    return { tone: 'orange', words: `The database is at migration ${schema.version}; this version of the app needs ${needs}. Anything new will not work until the rest are applied.${gaps}` }
  }
  const ahead = schema.version > needs ? `, ${schema.version - needs} ahead of what this version of the app needs` : ', which is what this version of the app needs'
  return { tone: gaps ? 'orange' : 'green', words: `The database is at migration ${schema.version}${ahead}.${gaps}` }
}

const ERROR_COLUMNS =
  'id, created_at, last_at, times, user_id, source, message, stack, page, build, device, installed, reporter:profiles!client_errors_user_id_fkey(first_name, last_name)'

/** The newest five hundred: more than a month of an app that is working. */
export async function fetchClientErrors(): Promise<ClientError[]> {
  const { data, error } = await supabase.from('client_errors').select(ERROR_COLUMNS).order('last_at', { ascending: false }).limit(500)
  if (error) throw error
  return z.array(clientErrorSchema).parse(data ?? [])
}

export async function fetchHealthEvents(): Promise<HealthEvent[]> {
  const { data, error } = await supabase.from('health_events').select('id, kind, name, at, detail').order('at', { ascending: false }).limit(200)
  if (error) throw error
  return z.array(healthEventSchema).parse(data ?? [])
}

export async function fetchHealthOverview(): Promise<HealthOverview> {
  const { data, error } = await supabase.rpc('health_overview')
  if (error) throw error
  return healthOverviewSchema.parse(data)
}

/** Put away errors that are dealt with. Answers how many went. */
export async function clearClientErrors(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const { data, error } = await supabase.from('client_errors').delete().in('id', ids).select('id')
  if (error) throw error
  return data?.length ?? 0
}

export async function clearHealthEvents(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0
  const { data, error } = await supabase.from('health_events').delete().in('id', ids).select('id')
  if (error) throw error
  return data?.length ?? 0
}

/** What the broken page showed for this report: the first eight of its id, as report_client_error() answers. */
export function errorReference(id: string): string {
  return id.replace(/-/g, '').slice(0, 8).toUpperCase()
}

const SOURCE_WORDS: Record<ErrorSource, string> = {
  page: 'A page could not be drawn',
  boundary: 'The app itself failed',
  window: 'An error outside a page',
  promise: 'Something left running failed',
  query: 'A read failed',
  save: 'A save failed',
}

/** Which net caught it, in words. One nobody has heard of is said as it came. */
export function sourceWords(source: string): string {
  return (SOURCE_WORDS as Record<string, string>)[source] ?? source
}

/** Who reported it: their name, "a visitor" for a page nobody signs in to, or somebody since removed. */
export function reporterName(row: Pick<ClientError, 'user_id' | 'reporter'>): string {
  const name = [row.reporter?.first_name, row.reporter?.last_name].filter(Boolean).join(' ').trim()
  if (name) return name
  return row.user_id ? 'Somebody signed in' : 'A visitor, not signed in'
}

/** A device in a few words, from what its browser called itself: "iPhone · Safari · 390×844". */
export function deviceWords(device: string | null): string {
  if (!device) return 'Unknown device'
  const system = /iPhone/.test(device)
    ? 'iPhone'
    : /iPad/.test(device)
      ? 'iPad'
      : /Android/.test(device)
        ? 'Android'
        : /Windows/.test(device)
          ? 'Windows'
          : /CrOS/.test(device)
            ? 'Chromebook'
            : /Macintosh|Mac OS X/.test(device)
              ? 'Mac'
              : /Linux/.test(device)
                ? 'Linux'
                : 'Unknown device'
  const browser = /EdgA?\/|EdgiOS\//.test(device)
    ? 'Edge'
    : /SamsungBrowser/.test(device)
      ? 'Samsung Internet'
      : /Firefox\/|FxiOS\//.test(device)
        ? 'Firefox'
        : /CriOS\/|Chrome\//.test(device)
          ? 'Chrome'
          : /Safari\//.test(device)
            ? 'Safari'
            : ''
  const size = / · (\d+×\d+)$/.exec(device)?.[1]
  return [system, browser, size].filter(Boolean).join(' · ')
}

/** One thing to look at: every report that says the same on the same build. */
export interface ErrorGroup {
  key: string
  message: string
  build: string | null
  /** How many times it happened, repeats included. */
  times: number
  /** How many different people, signed in; visitors are counted apart, as one cannot tell them from each other. */
  people: number
  visitors: boolean
  firstAt: string
  lastAt: string
  pages: string[]
  sources: string[]
  rows: ClientError[]
}

/** Fold the reports by what they say and which build said it, the latest first. */
export function groupErrors(rows: ClientError[]): ErrorGroup[] {
  const groups = new Map<string, ErrorGroup>()
  for (const row of rows) {
    const key = `${row.build ?? ''}\n${row.message}`
    let group = groups.get(key)
    if (!group) {
      group = { key, message: row.message, build: row.build, times: 0, people: 0, visitors: false, firstAt: row.created_at, lastAt: row.last_at, pages: [], sources: [], rows: [] }
      groups.set(key, group)
    }
    group.times += row.times
    group.rows.push(row)
    if (row.created_at < group.firstAt) group.firstAt = row.created_at
    if (row.last_at > group.lastAt) group.lastAt = row.last_at
    if (row.page && !group.pages.includes(row.page)) group.pages.push(row.page)
    if (!group.sources.includes(row.source)) group.sources.push(row.source)
    if (!row.user_id) group.visitors = true
  }
  for (const group of groups.values()) {
    group.people = new Set(group.rows.map((r) => r.user_id).filter(Boolean)).size
    group.rows.sort((a, b) => b.last_at.localeCompare(a.last_at))
  }
  return [...groups.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt))
}

/** "3 people and visitors", "1 person", "visitors". */
export function whoWords(group: Pick<ErrorGroup, 'people' | 'visitors'>): string {
  const people = group.people === 0 ? '' : `${group.people} ${group.people === 1 ? 'person' : 'people'}`
  if (people && group.visitors) return `${people} and visitors`
  return people || 'visitors'
}

export const timesWords = (times: number) => (times === 1 ? 'once' : times === 2 ? 'twice' : `${times.toLocaleString()} times`)

/** A size in the unit a person would say it in. */
export function bytesWords(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

const EVENT_WORDS: Record<HealthEvent['kind'], string> = {
  job: 'Timed job',
  push: 'Notification to phones',
  call: 'Background request',
}
export const eventWords = (kind: HealthEvent['kind']) => EVENT_WORDS[kind]

/** How long ago, coarsely; a date once it is more than a day. */
export function agoWords(iso: string, now: number): string {
  const then = new Date(iso).getTime()
  const minutes = Math.round((now - then) / 60_000)
  if (!Number.isFinite(minutes)) return ''
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })}, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

/** The jobs that want looking at first: one that failed, then one that has not run, then the rest by name. */
export function jobsInOrder(jobs: HealthJob[]): HealthJob[] {
  const weight = (j: HealthJob) => (j.failed > 0 ? 0 : j.active === false ? 1 : j.runs === 0 ? 2 : 3)
  return [...jobs].sort((a, b) => weight(a) - weight(b) || (a.name ?? '').localeCompare(b.name ?? ''))
}

/**
 * One line for the top of the room: whether anything wants doing.
 *
 * `events` is what the hourly copy has recorded; `jobsFailing` is what the
 * platform's own log shows this minute, which can be up to an hour ahead
 * of it. They are the same failures seen twice, so the larger is said.
 */
export function healthVerdict(input: { groups: number; events: number; jobsFailing: number }): { tone: 'green' | 'orange'; words: string } {
  const failures = Math.max(input.events, input.jobsFailing)
  const parts: string[] = []
  if (failures > 0) parts.push(`${failures} ${failures === 1 ? 'failure' : 'failures'} in the app’s own work`)
  if (input.groups > 0) parts.push(`${input.groups} ${input.groups === 1 ? 'kind of error' : 'kinds of error'} from people’s devices`)
  if (parts.length === 0) return { tone: 'green', words: `Nothing has gone wrong in the last ${HEALTH_KEPT_DAYS} days that the app knows of.` }
  return { tone: 'orange', words: `${parts.join(', and ')}.` }
}
