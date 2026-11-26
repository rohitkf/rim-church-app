import { z } from 'zod'
import { supabase } from './supabaseClient'
import { NAV_ITEMS } from './navItems'
import { SETTINGS_SECTIONS, type SettingsSection } from './settingsSections'
import { SERVICE_PARAM } from './serviceLinks'
import { formatServiceDay } from './sunday'
import { matchScore, snippetAround, tokensOf } from './searchMatch'
import { RECENT_KEY } from './searchRecent'

/**
 * The search over everything: what there is to find, and finding it.
 *
 * It was one function that asked twelve tables whether a column contained
 * exactly what was typed, and a list of pages kept by hand beside it. So
 * half the menu could not be found (the Calendar, Set Lists, Prayer,
 * Giving and every room of Settings added since the list was written),
 * two words found nobody, a slip found nothing, results came in the order
 * the tables were asked, and choosing a person opened Volunteers and left
 * you to look for them again.
 *
 * Now there are three kinds of thing, found three ways:
 *
 * - **Places**: every page in the menu and every room of Settings, read
 *   from the lists the menu and Settings are themselves drawn from, so a
 *   page added to the app is in the search the day it is added
 *   (`globalSearch.test.ts` holds that). Found as you type, with no
 *   request made.
 * - **Things with a name**: people, teams, roles, services, events,
 *   songs, kit, guests. Read once when the search is opened (they are a
 *   few hundred rows between them) and then found as you type, by
 *   `lib/searchMatch`: several words, a slip of the thumb, a first-letters
 *   shorthand, best first.
 * - **Things somebody wrote**: messages, team chat, updates, issues, a
 *   line of a song. Too much to hold, and looked for as written, so these
 *   are asked of the database, each word typed having to be there.
 *
 * Row rules decide what any of those requests give back, so nobody is
 * shown that something exists which they could not open; and a result
 * whose page this person cannot open is not offered either.
 */

export type HitKind =
  | 'Page'
  | 'Setting'
  | 'Person'
  | 'Team'
  | 'Guest'
  | 'Service'
  | 'Event'
  | 'Song'
  | 'Session'
  | 'Role'
  | 'Equipment'
  | 'Template'
  | 'Registration'
  | 'Message'
  | 'Team chat'
  | 'Alert'
  | 'Update'
  | 'Poll'
  | 'Issue'

/** The heading each kind is listed under. */
export const KIND_HEADING: Record<HitKind, string> = {
  Page: 'Pages',
  Setting: 'Settings',
  Person: 'People',
  Team: 'Teams',
  Guest: 'Guests',
  Service: 'Services',
  Event: 'Calendar',
  Song: 'Songs',
  Session: 'Running orders',
  Role: 'Roles',
  Equipment: 'Inventory',
  Template: 'Service templates',
  Registration: 'Event registrations',
  Message: 'Messages',
  'Team chat': 'Team chat',
  Alert: 'Alerts',
  Update: 'Church updates',
  Poll: 'Polls',
  Issue: 'Issues',
}

/** Something that can be found. */
export interface Thing {
  id: string
  kind: HitKind
  /** What it is called: the line a result shows, and what a match is worth most in. */
  label: string
  /** What tells it from the next thing of the same name. Shown, and searched. */
  detail: string
  /** Where choosing it goes. */
  to: string
  /** The page whose rule decides whether this person may go there. */
  page: string
  /** More to find it by that is not shown: a serial number, an email address, other words for it. */
  also?: string
  /** For things of a day: how near that day is, so next Sunday comes before last March. */
  day?: string
}

export interface Hit extends Thing {
  score: number
}

/* ------------------------------------------------------------------ *
 * Places
 * ------------------------------------------------------------------ */

/**
 * What else each page is looked for by, and what it says under its name.
 * Keyed by the menu's own paths: the page list is the menu's, this only
 * adds the words. `globalSearch.test.ts` fails for a page with no line here.
 */
export const PAGE_WORDS: Record<string, { detail: string; also: string }> = {
  '/': { detail: 'Readiness, availability and celebrations', also: 'home overview readiness today birthdays' },
  '/events': { detail: 'What is on, and the services', also: 'calendar diary events dates what is on schedule month week' },
  '/availability': { detail: 'Who can serve, and who turned up', also: 'available attendance answers can you serve yes no' },
  '/rota': { detail: 'Who is doing what', also: 'rota roster assign roles duty schedule who is on' },
  '/checklists': { detail: 'Pre-service checks and sign-off', also: 'checks verify sign off tick packing up' },
  '/clock-in': { detail: 'Who has arrived, and asking to be clocked in', also: 'clock in arrive present attendance location late' },
  '/service-planner': { detail: 'Services and their running orders, on the Calendar', also: 'plan running order sessions templates service flow' },
  '/set-lists': { detail: 'The songs for each service', also: 'set list songs worship music keys lyrics' },
  '/songs': { detail: 'Every song the church sings', also: 'songs database library lyrics key music worship' },
  '/stage': { detail: 'Where everything and everybody stands', also: 'stage layout plan plot drawing positions band' },
  '/countdown': { detail: 'The service clock, large', also: 'timer clock time overrun running over stage' },
  '/debriefs': { detail: 'How each service went, team by team', also: 'debrief review after the service notes went well' },
  '/issues': { detail: 'What went wrong, and what was done about it', also: 'issues problems faults raise report service related' },
  '/updates': { detail: 'News from the church', also: 'church updates news notices announcements' },
  '/messages': { detail: 'The message board', also: 'messages board post chat all department' },
  '/team-chat': { detail: 'Each team’s own room', also: 'team chat room talk messages' },
  '/polls': { detail: 'Questions asked of a team, and the answers', also: 'polls vote question survey' },
  '/feedback': { detail: 'Report a bug or suggest an improvement', also: 'feedback bug report suggestion idea improvement problem broken' },
  '/prayer': { detail: 'Ask for prayer, and pray for others', also: 'prayer requests pray praying testimony pastor' },
  '/giving': { detail: 'Tithes and offerings', also: 'giving tithes offerings donate bank money' },
  '/registrations': { detail: 'Events people book a place at', also: 'registrations events tickets bookings orders attendees payments' },
  '/door': { detail: 'Checking people in at an event', also: 'reception door check in scan tickets arrivals' },
  '/departments': { detail: 'Teams, their roles and handbooks', also: 'teams departments handbook roles join' },
  '/volunteers': { detail: 'Everyone, their teams and what they may do', also: 'volunteers people members admin permissions invite' },
  '/families': { detail: 'Who is linked to whom', also: 'family families husband wife spouse child children parents link tree household' },
  '/dbs': { detail: 'Everybody’s DBS, and marking one verified', also: 'dbs safeguarding certificate check verify verified compliance' },
  '/inventory': { detail: 'Equipment registers and value', also: 'inventory equipment kit assets stock gear' },
}

/** Doors inside a page that are worth a line of their own. */
const SIDE_DOORS: Thing[] = [
  { id: 'door-templates', kind: 'Page', label: 'Service templates', detail: 'Running orders to start a service from', to: '/service-planner/templates', page: '/service-planner', also: 'template running order reuse' },
  { id: 'door-settings', kind: 'Page', label: 'Settings', detail: 'Your account, and how the church’s app behaves', to: '/settings', page: '/settings', also: 'settings preferences options' },
  { id: 'door-by-person', kind: 'Setting', label: 'Access, by person', detail: 'Everything one person can open and do, and why', to: '/settings/access?tab=person', page: '/settings/access', also: 'person permissions what can they do grant' },
  { id: 'door-by-team', kind: 'Setting', label: 'Access, by team', detail: 'What a team’s people may do, and what the team has been given', to: '/settings/access?tab=team', page: '/settings/access', also: 'team permissions rules grant' },
  { id: 'door-history', kind: 'Setting', label: 'Permissions history', detail: 'Who changed which rule, and when', to: '/settings/access?tab=history', page: '/settings/access', also: 'history log audit changed rule who when' },
]

/**
 * Every place this person can go: the menu's pages they may open, by the
 * name the church gave each, and the rooms of Settings they have a key to.
 */
export function placeThings(
  names: Record<string, string>,
  canOpen: (path: string) => boolean,
  roomOpen: (room: SettingsSection) => boolean,
): Thing[] {
  const things: Thing[] = []
  for (const item of NAV_ITEMS) {
    if (!canOpen(item.to)) continue
    const words = PAGE_WORDS[item.to]
    const renamed = names[item.to]
    things.push({
      id: `page-${item.to}`,
      kind: 'Page',
      label: renamed ?? item.label,
      detail: words?.detail ?? 'Page',
      to: item.to,
      page: item.to,
      // A renamed page is still found by the name it had, which is what people type for a while.
      also: `${renamed ? item.label : ''} ${words?.also ?? ''}`,
    })
  }
  for (const room of SETTINGS_SECTIONS) {
    if (!roomOpen(room)) continue
    things.push({ id: `room-${room.to}`, kind: 'Setting', label: room.label, detail: room.blurb, to: room.to, page: room.to, also: room.keywords ?? '' })
  }
  for (const door of SIDE_DOORS) {
    const room = SETTINGS_SECTIONS.find((r) => r.to === door.page)
    if (room ? roomOpen(room) : door.page === '/settings' || canOpen(door.page)) things.push(door)
  }
  return things
}

/* ------------------------------------------------------------------ *
 * Things with a name
 * ------------------------------------------------------------------ */

/** As many of one kind as are held. A church has nowhere near this many of anything; past it, the oldest are not found by name. */
const HELD = 1000

const rowsOf = <T>(schema: z.ZodType<T>, data: unknown): T[] => z.array(schema).catch([]).parse(data ?? [])

const today = () => new Date().toISOString().slice(0, 10)

/** Of things that happen on days, the one to show for a name: the next to come, or failing that the last that was. */
function nearest<T extends { day: string }>(rows: T[], now: string): T {
  const coming = rows.filter((r) => r.day >= now).sort((a, b) => a.day.localeCompare(b.day))[0]
  return coming ?? [...rows].sort((a, b) => b.day.localeCompare(a.day))[0]
}

function groupBy<T>(rows: T[], key: (row: T) => string): T[][] {
  const groups = new Map<string, T[]>()
  for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), row])
  return [...groups.values()]
}

export const SEARCH_INDEX_KEY = ['search-index']

/**
 * Everything with a name, read once.
 *
 * A request that is refused or fails gives nothing of that kind and does
 * not stop the rest: a search that finds the teams and not the kit is
 * better than one that finds nothing.
 */
export async function fetchSearchIndex(opts: { contacts: boolean; volunteersOpen: boolean }): Promise<Thing[]> {
  const now = today()
  const [people, members, teams, roles, services, sessions, setList, songs, events, kit, guests, templates, registrations, contacts] =
    await Promise.all([
      supabase.from('profiles').select('id, first_name, last_name').limit(HELD),
      supabase.from('department_members').select('user_id, department_id').limit(HELD * 5),
      supabase.from('departments').select('id, name').limit(HELD),
      supabase.from('department_roles').select('id, name, department_id').limit(HELD),
      supabase.from('services').select('id, date, service_type').order('date', { ascending: false }).limit(HELD),
      supabase.from('service_sessions').select('id, session_name, role_label, service_id').order('created_at', { ascending: false }).limit(HELD),
      supabase.from('set_list_items').select('id, title, led_by, service_id').order('created_at', { ascending: false }).limit(HELD),
      supabase.from('songs').select('id, title, song_key').limit(HELD),
      supabase.from('church_events').select('id, title, event_date, location, series_id, category').order('event_date', { ascending: false }).limit(HELD),
      supabase.from('inventory_items').select('id, name, asset_tag, model, brand, category, serial_number, location, department_id').limit(HELD),
      supabase.from('guests').select('id, name, title, note').limit(HELD),
      supabase.from('service_templates').select('id, name').limit(HELD),
      supabase.from('registration_events').select('id, title, location_name, status').limit(HELD),
      // Email addresses and telephone numbers are for whoever holds them (0127); nobody else's search asks.
      opts.contacts ? supabase.rpc('people_contacts', { p_ids: null }) : Promise.resolve({ data: [] }),
    ])

  const things: Thing[] = []
  const text = z.string().nullable().optional()

  const teamRows = rowsOf(z.object({ id: z.string(), name: z.string() }), teams.data)
  const teamName = new Map(teamRows.map((t) => [t.id, t.name]))
  for (const t of teamRows) {
    things.push({ id: `team-${t.id}`, kind: 'Team', label: t.name, detail: 'Team', to: `/departments/${t.id}`, page: '/departments' })
  }

  const teamsOf = new Map<string, string[]>()
  for (const m of rowsOf(z.object({ user_id: z.string(), department_id: z.string() }), members.data)) {
    teamsOf.set(m.user_id, [...(teamsOf.get(m.user_id) ?? []), m.department_id])
  }
  const contactOf = new Map(
    rowsOf(z.object({ id: z.string(), email: text, phone: text }), contacts.data).map((c) => [c.id, c]),
  )
  for (const p of rowsOf(z.object({ id: z.string(), first_name: text, last_name: text }), people.data)) {
    const label = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()
    if (!label) continue
    const on = (teamsOf.get(p.id) ?? []).filter((id) => teamName.has(id))
    const contact = contactOf.get(p.id)
    // Volunteers finds them by name (its own search box reads the address);
    // somebody who cannot open it is shown the first team they are on.
    const to = opts.volunteersOpen ? `/volunteers?q=${encodeURIComponent(label)}` : on[0] ? `/departments/${on[0]}` : ''
    if (!to) continue
    things.push({
      id: `person-${p.id}`,
      kind: 'Person',
      label,
      detail: on.length ? on.map((id) => teamName.get(id)).sort().join(' · ') : 'On no team',
      to,
      page: opts.volunteersOpen ? '/volunteers' : '/departments',
      also: `${contact?.email ?? ''} ${contact?.phone ?? ''}`,
    })
  }

  for (const r of rowsOf(z.object({ id: z.string(), name: z.string(), department_id: z.string() }), roles.data)) {
    things.push({ id: `role-${r.id}`, kind: 'Role', label: r.name, detail: teamName.get(r.department_id) ?? 'Team role', to: `/departments/${r.department_id}`, page: '/departments' })
  }

  const serviceRows = rowsOf(z.object({ id: z.string(), date: z.string(), service_type: z.string() }), services.data)
  const serviceOf = new Map(serviceRows.map((s) => [s.id, s]))
  for (const s of serviceRows) {
    const when = new Date(`${s.date}T12:00:00`)
    things.push({
      id: `service-${s.id}`,
      kind: 'Service',
      label: s.service_type,
      detail: formatServiceDay(s.date),
      to: `/service-planner/${s.id}`,
      page: '/service-planner',
      // The day as people type it: "30 november", "nov 30", "sunday".
      also: Number.isNaN(when.getTime())
        ? s.date
        : `${s.date} ${when.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`,
      day: s.date,
    })
  }

  // A session called "Worship" is in every service: one line, for the nearest of them.
  const sessionRows = rowsOf(z.object({ id: z.string(), session_name: z.string(), role_label: text, service_id: z.string() }), sessions.data)
    .map((s) => ({ ...s, day: serviceOf.get(s.service_id)?.date ?? '' }))
    .filter((s) => s.day)
  for (const same of groupBy(sessionRows, (s) => plainName(s.session_name))) {
    const s = nearest(same, now)
    things.push({
      id: `session-${s.id}`,
      kind: 'Session',
      label: s.session_name,
      detail: `${formatServiceDay(s.day)}${same.length > 1 ? `, and ${same.length - 1} more` : ''}`,
      to: `/service-planner/${s.service_id}`,
      page: '/service-planner',
      also: s.role_label ?? '',
      day: s.day,
    })
  }

  const songRows = rowsOf(z.object({ id: z.string(), title: z.string(), song_key: text }), songs.data)
  const inLibrary = new Set(songRows.map((s) => plainName(s.title)))
  for (const s of songRows) {
    things.push({ id: `song-${s.id}`, kind: 'Song', label: s.title, detail: s.song_key ? `Song · ${s.song_key}` : 'Song', to: `/songs?q=${encodeURIComponent(s.title)}`, page: '/songs' })
  }
  // A song on a set list that the library does not hold is found where it is being sung.
  const setRows = rowsOf(z.object({ id: z.string(), title: z.string(), led_by: text, service_id: z.string() }), setList.data)
    .map((s) => ({ ...s, day: serviceOf.get(s.service_id)?.date ?? '' }))
    .filter((s) => s.day && !inLibrary.has(plainName(s.title)))
  for (const same of groupBy(setRows, (s) => plainName(s.title))) {
    const s = nearest(same, now)
    things.push({
      id: `setlist-${s.id}`,
      kind: 'Song',
      label: s.title,
      detail: `Set list · ${formatServiceDay(s.day)}`,
      to: `/set-lists?${SERVICE_PARAM}=${s.service_id}`,
      page: '/set-lists',
      also: s.led_by ?? '',
      day: s.day,
    })
  }

  // A weekly event is fifty rows: one line, for the next time it happens.
  const eventRows = rowsOf(
    z.object({ id: z.string(), title: z.string(), event_date: z.string(), location: text, series_id: text, category: text }),
    events.data,
  ).map((e) => ({ ...e, day: e.event_date }))
  for (const same of groupBy(eventRows, (e) => e.series_id ?? plainName(e.title))) {
    const e = nearest(same, now)
    things.push({
      id: `event-${e.id}`,
      kind: 'Event',
      label: e.title,
      detail: [formatServiceDay(e.day), e.location].filter(Boolean).join(' · '),
      to: '/events',
      page: '/events',
      also: e.category ?? '',
      day: e.day,
    })
  }

  for (const k of rowsOf(
    z.object({ id: z.string(), name: z.string(), asset_tag: text, model: text, brand: text, category: text, serial_number: text, location: text, department_id: z.string() }),
    kit.data,
  )) {
    things.push({
      id: `kit-${k.id}`,
      kind: 'Equipment',
      label: k.name,
      detail: [k.asset_tag, k.brand, k.model].filter(Boolean).join(' · ') || teamName.get(k.department_id) || 'Equipment',
      // The register opens on the item itself, as it does from a scanned label.
      to: `/inventory/${k.department_id}?item=${k.id}`,
      page: '/inventory',
      also: `${k.serial_number ?? ''} ${k.category ?? ''} ${k.location ?? ''} ${teamName.get(k.department_id) ?? ''}`,
    })
  }

  if (opts.volunteersOpen) {
    for (const g of rowsOf(z.object({ id: z.string(), name: z.string(), title: text, note: text }), guests.data)) {
      things.push({ id: `guest-${g.id}`, kind: 'Guest', label: [g.title, g.name].filter(Boolean).join(' '), detail: g.note || 'Guest', to: '/volunteers#guests', page: '/volunteers' })
    }
  }

  for (const t of rowsOf(z.object({ id: z.string(), name: z.string() }), templates.data)) {
    things.push({ id: `template-${t.id}`, kind: 'Template', label: t.name, detail: 'Service template', to: '/service-planner/templates', page: '/service-planner' })
  }

  for (const r of rowsOf(z.object({ id: z.string(), title: z.string(), location_name: text, status: text }), registrations.data)) {
    things.push({ id: `registration-${r.id}`, kind: 'Registration', label: r.title, detail: r.location_name || 'Event registration', to: `/registrations/${r.id}`, page: '/registrations' })
  }

  return things
}

/** A name as it is compared with another: its words, case and accents aside. */
function plainName(text: string): string {
  return tokensOf(text).join(' ')
}

/* ------------------------------------------------------------------ *
 * Matching
 * ------------------------------------------------------------------ */

/** How much a match is worth by where it was found: the name, what is shown under it, the unseen words. */
const WEIGHT = { label: 3, detail: 1.5, also: 1 }

/**
 * Where the line under the name is worth more or less than usual. A
 * service is its day, so "30 nov" should find the service; a session or a
 * set-list song only carries a day to tell it from its namesakes, and
 * should not come before the service whose day it is.
 */
const DETAIL_WEIGHT: Partial<Record<HitKind, number>> = { Service: 2.5, Session: 0.75, Song: 0.75 }

/**
 * A page comes before its own room of Settings. "Prayer" is the whole name
 * of the room and the start of the page's, and almost everybody typing it
 * wants to pray, not to choose who reads the private requests.
 */
const KIND_WORTH: Partial<Record<HitKind, number>> = { Setting: 0.8 }

/** The things that match, each with how well. */
export function matchThings(query: string, things: readonly Thing[]): Hit[] {
  const hits: Hit[] = []
  for (const thing of things) {
    const score = matchScore(query, [
      { text: thing.label, weight: WEIGHT.label },
      { text: thing.detail, weight: DETAIL_WEIGHT[thing.kind] ?? WEIGHT.detail },
      { text: thing.also, weight: WEIGHT.also },
    ])
    if (score !== null) hits.push({ ...thing, score: score * (KIND_WORTH[thing.kind] ?? 1) })
  }
  return hits
}

/* ------------------------------------------------------------------ *
 * Things somebody wrote
 * ------------------------------------------------------------------ */

/** The fewest letters before the database is asked. One letter is in every message there is. */
export const MIN_TEXT_QUERY = 3

/**
 * One typed word as a filter over some columns, for PostgREST's `or`.
 *
 * What was typed goes into a filter that has its own grammar, so it is
 * made plain first: `%` and `_` would be wildcards and `\` an escape to
 * LIKE, and a comma, a bracket or a quote would end the value early to
 * PostgREST. Typing "a,b" used to break the request for every kind at once.
 */
export function wordFilter(columns: string[], word: string): string {
  const like = word.replace(/[\\%_]/g, (ch) => `\\${ch}`)
  const quoted = `%${like}%`.replace(/[\\"]/g, (ch) => `\\${ch}`)
  return columns.map((column) => `${column}.ilike."${quoted}"`).join(',')
}

/** What was typed, as it is asked of the database: its words as written (case aside), the first few of them. */
export function textWords(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .slice(0, 5)
}

/** What a written thing is worth beside a named one: always less, and less the older it is. */
function writtenScore(query: string, label: string, created: string | null | undefined, now: number): number {
  const inLabel = matchScore(query, [{ text: label, weight: 1 }]) ?? 0.5
  const age = created ? Math.max(0, now - new Date(created).getTime()) / 86_400_000 : 365
  return Math.min(1.2, inLabel) * 0.6 + 0.4 / (1 + age / 30)
}

/** Whatever was written that holds every word typed, newest first of each kind. */
export async function searchWritten(query: string): Promise<Hit[]> {
  const words = textWords(query)
  if (words.length === 0) return []
  const now = Date.now()
  const has = <Q extends { or: (filter: string) => Q }>(q: Q, columns: string[]): Q =>
    words.reduce((asked, word) => asked.or(wordFilter(columns, word)), q)

  const [messages, chat, alerts, updates, polls, issues, lyrics, eventDetails] = await Promise.all([
    has(supabase.from('messages').select('id, body, created_at'), ['body']).order('created_at', { ascending: false }).limit(5),
    has(supabase.from('team_messages').select('id, body, department_id, created_at').is('deleted_at', null), ['body'])
      .order('created_at', { ascending: false })
      .limit(5),
    has(supabase.from('announcements').select('id, body, created_at'), ['body']).order('created_at', { ascending: false }).limit(4),
    has(supabase.from('church_updates').select('id, title, body, created_at'), ['title', 'body']).order('created_at', { ascending: false }).limit(4),
    has(supabase.from('team_polls').select('id, question, created_at'), ['question']).order('created_at', { ascending: false }).limit(4),
    has(supabase.from('service_issues').select('id, title, details, service_id, created_at'), ['title', 'details'])
      .order('created_at', { ascending: false })
      .limit(4),
    has(supabase.from('songs').select('id, title, lyrics'), ['lyrics']).limit(4),
    has(supabase.from('church_events').select('id, title, details, event_date'), ['details']).order('event_date', { ascending: false }).limit(4),
  ])

  const hits: Hit[] = []
  const text = z.string().nullable().optional()
  const written = (thing: Thing, created?: string | null) => hits.push({ ...thing, score: writtenScore(query, thing.label, created, now) })

  for (const m of rowsOf(z.object({ id: z.string(), body: z.string(), created_at: text }), messages.data)) {
    written({ id: `message-${m.id}`, kind: 'Message', label: snippetAround(query, m.body), detail: 'On the message board', to: '/messages', page: '/messages' }, m.created_at)
  }
  for (const m of rowsOf(z.object({ id: z.string(), body: z.string(), department_id: z.string(), created_at: text }), chat.data)) {
    written({ id: `chat-${m.id}`, kind: 'Team chat', label: snippetAround(query, m.body), detail: 'In a team’s chat', to: `/team-chat?team=${m.department_id}`, page: '/team-chat' }, m.created_at)
  }
  for (const a of rowsOf(z.object({ id: z.string(), body: z.string(), created_at: text }), alerts.data)) {
    written({ id: `alert-${a.id}`, kind: 'Alert', label: snippetAround(query, a.body), detail: 'An alert that went out', to: '/messages', page: '/messages' }, a.created_at)
  }
  for (const u of rowsOf(z.object({ id: z.string(), title: z.string(), body: text, created_at: text }), updates.data)) {
    written({ id: `update-${u.id}`, kind: 'Update', label: u.title, detail: u.body ? snippetAround(query, u.body) : 'Church update', to: '/updates', page: '/updates' }, u.created_at)
  }
  for (const p of rowsOf(z.object({ id: z.string(), question: z.string(), created_at: text }), polls.data)) {
    written({ id: `poll-${p.id}`, kind: 'Poll', label: p.question, detail: 'Poll', to: '/polls', page: '/polls' }, p.created_at)
  }
  for (const i of rowsOf(z.object({ id: z.string(), title: z.string(), details: text, service_id: z.string(), created_at: text }), issues.data)) {
    written(
      { id: `issue-${i.id}`, kind: 'Issue', label: i.title, detail: i.details ? snippetAround(query, i.details) : 'Issue', to: `/issues?${SERVICE_PARAM}=${i.service_id}`, page: '/issues' },
      i.created_at,
    )
  }
  for (const s of rowsOf(z.object({ id: z.string(), title: z.string(), lyrics: text }), lyrics.data)) {
    written({ id: `song-${s.id}`, kind: 'Song', label: s.title, detail: s.lyrics ? `“${snippetAround(query, s.lyrics, 60)}”` : 'Song', to: `/songs?q=${encodeURIComponent(s.title)}`, page: '/songs' })
  }
  for (const e of rowsOf(z.object({ id: z.string(), title: z.string(), details: text, event_date: text }), eventDetails.data)) {
    written({ id: `event-${e.id}`, kind: 'Event', label: e.title, detail: e.details ? snippetAround(query, e.details) : 'Calendar', to: '/events', page: '/events' })
  }
  return hits
}

/* ------------------------------------------------------------------ *
 * Putting the results in order
 * ------------------------------------------------------------------ */

export interface HitGroup {
  kind: HitKind
  heading: string
  hits: Hit[]
}

/** As many of one kind as are listed. The best of each, not all of one. */
export const PER_KIND = 5

/** How far a day is from today, for breaking a tie: nothing for today, more for further, and the past further than it is. */
function dayDistance(day: string | undefined, now: string): number {
  if (!day) return 0
  const days = (new Date(`${day}T12:00:00`).getTime() - new Date(`${now}T12:00:00`).getTime()) / 86_400_000
  return days >= 0 ? days : 400 - days
}

/**
 * The results as they are listed: one of each thing, the kind with the
 * best match first, and within a kind the best first, the nearest day
 * breaking a tie.
 */
export function arrange(found: readonly Hit[], now: string = today()): HitGroup[] {
  const best = new Map<string, Hit>()
  for (const hit of found) {
    const had = best.get(hit.id)
    if (!had || hit.score > had.score) best.set(hit.id, hit)
  }
  const kinds = new Map<HitKind, Hit[]>()
  for (const hit of best.values()) kinds.set(hit.kind, [...(kinds.get(hit.kind) ?? []), hit])
  return [...kinds.entries()]
    .map(([kind, hits]) => ({
      kind,
      heading: KIND_HEADING[kind],
      hits: hits
        .sort((a, b) => b.score - a.score || dayDistance(a.day, now) - dayDistance(b.day, now) || a.label.localeCompare(b.label))
        .slice(0, PER_KIND),
    }))
    .sort((a, b) => b.hits[0].score - a.hits[0].score || a.heading.localeCompare(b.heading))
}

/* ------------------------------------------------------------------ *
 * What was chosen lately
 * ------------------------------------------------------------------ */

const RECENT_KEPT = 6

const recentSchema = z.array(
  z.object({ id: z.string(), kind: z.string(), label: z.string(), detail: z.string(), to: z.string(), page: z.string() }),
)

/** What this person last chose from the search, newest first. This device's own. */
export function recentThings(): Thing[] {
  try {
    const kept = recentSchema.safeParse(JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'))
    return kept.success ? (kept.data.filter((t) => t.kind in KIND_HEADING) as Thing[]) : []
  } catch {
    return []
  }
}

/** Remember a choice. Not what somebody wrote: a line of a message has no business sitting in a browser's storage. */
export function rememberThing(thing: Thing): void {
  if (WRITTEN.has(thing.kind)) return
  try {
    const { id, kind, label, detail, to, page } = thing
    const next = [{ id, kind, label, detail, to, page }, ...recentThings().filter((t) => t.id !== id)].slice(0, RECENT_KEPT)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // Storage refused: the search works the same, it just starts empty next time.
  }
}

const WRITTEN = new Set<HitKind>(['Message', 'Team chat', 'Alert', 'Update', 'Poll', 'Issue'])
