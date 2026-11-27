import { CHURCH_NAME } from './churchName'

/**
 * The copy of your own data, as something a person can read.
 *
 * `my_data()` answers with the database's own rows (lib/myData), and the
 * first download was exactly that: a file of tables called
 * `service_session_assignees`, columns called `include_pre`, and a
 * thirty-six character id wherever a team, a service or a person was
 * meant. The Owner downloaded theirs the day it shipped and sent it back:
 * it was all there, and none of it could be read.
 *
 * So the copy people are given is a document: a heading for each kind of
 * thing in plain words, a name where there was an id, a date where there
 * was a timestamp, Yes and No, and nothing for a blank. The raw file is
 * still offered beside it, for whoever wants every column.
 *
 * What is known by name is worded here; what is not (a table or a column
 * added after this was written) is still shown, under its own name with
 * the underscores taken out, so the document never has less in it than
 * the database gave. Only references are left out: the row's own id, the
 * reader's id repeated on every row, and ids of things that could not be
 * named. The document says so, and says where the rest is.
 */

/** What an id means, where it could be found out. */
export interface Lookups {
  team: Map<string, string>
  service: Map<string, string>
  role: Map<string, string>
  person: Map<string, string>
  session: Map<string, string>
  /** The reader's own id: "you", wherever they are who did something. */
  me: string | null
}

export const NO_LOOKUPS: Lookups = { team: new Map(), service: new Map(), role: new Map(), person: new Map(), session: new Map(), me: null }

export interface ReadableEntry {
  lines: [label: string, value: string][]
}

export interface ReadableSection {
  title: string
  about?: string
  entries: ReadableEntry[]
}

export interface ReadableData {
  made: string
  account: [label: string, value: string][]
  sections: ReadableSection[]
}

/** Each table the app is known to keep about a person, in the order a person would ask about them. */
const TABLES: Record<string, { title: string; about?: string }> = {
  profiles: { title: 'Your profile', about: 'What you gave when you joined, and have changed since.' },
  profile_sensitive: { title: 'DBS and visa', about: 'Seen by you, the Owner and a Pastor.' },
  dbs_details: { title: 'Your DBS certificate', about: 'The details you gave so that it could be checked.' },
  dbs_log: { title: 'What has happened to your DBS details' },
  household_members: { title: 'Your family', about: 'Where you are linked to a household.' },
  family_link_requests: { title: 'Family links you asked for' },
  department_members: { title: 'Teams you are on' },
  user_roles: { title: 'Roles you hold' },
  department_role_permanents: { title: 'Roles that are yours every week' },
  team_join_requests: { title: 'Teams you asked to join' },
  rota_assignments: { title: 'Your places on the rota' },
  rota_release_requests: { title: 'Times you asked to be released from the rota' },
  service_session_assignees: { title: 'Parts of a service you are named on' },
  availability: { title: 'Whether you could serve', about: 'Your answer for each service still kept.' },
  availability_history: { title: 'Changes to those answers' },
  availability_change_requests: { title: 'Changes you asked for after answers closed' },
  clock_ins: { title: 'When you clocked in', about: 'The time, and where your phone was at that moment.' },
  clock_in_history: { title: 'Changes to your clock-ins' },
  clock_in_requests: { title: 'Times you asked to be clocked in' },
  on_my_way: { title: 'What you told your team about arriving today', about: 'A time, or that you could not make it. Never where you were. It is cleared overnight.' },
  location_access: { title: 'Whether this app may use your location' },
  messages: { title: 'Messages you posted' },
  team_messages: { title: 'What you wrote in team chat' },
  team_polls: { title: 'Polls you asked' },
  team_poll_votes: { title: 'Your answers to polls' },
  announcements: { title: 'Alerts you sent' },
  prayer_requests: { title: 'Your prayer requests' },
  prayer_responses: { title: 'Requests you prayed for' },
  prayer_assignments: { title: 'Prayer requests given to you' },
  app_feedback: { title: 'Feedback you sent' },
  notifications: { title: 'Notifications sent to you', about: 'What the bell has told you, until each is cleared.' },
  push_preferences: { title: 'Which notifications reach your phone' },
  onboarding: { title: 'The tour and what is new', about: 'Which parts of the tour you have seen, and which notes about new things.' },
  permission_grants: { title: 'Things you have been allowed by name' },
  permission_blocks: { title: 'Things you have been kept from by name' },
  account_blocks: { title: 'Blocks on your account' },
  ownership_transfers: { title: 'Offers to hand you the app, or that you made' },
  stage_move_requests: { title: 'Stage changes you asked for' },
  stage_template_requests: { title: 'Stage templates you asked for' },
}

/** What a column is called to a person. One list for every table: a column means the same thing wherever it is. */
const COLUMNS: Record<string, string> = {
  first_name: 'First name',
  last_name: 'Last name',
  single_name: 'Has one name only',
  email: 'Email address',
  phone: 'Telephone',
  dob: 'Date of birth',
  anniversary: 'Wedding anniversary',
  marital_status: 'Married or single',
  avatar_url: 'Photo',
  emergency_contact_name: 'Who to ring in an emergency',
  emergency_contact_phone: 'Their telephone',
  emergency_contact_relation: 'Who they are to you',
  department_id: 'Team',
  service_id: 'Service',
  role_id: 'Role',
  session_id: 'Part of the service',
  role_label: 'Role, as it was called',
  role_type: 'Role',
  member_type: 'Kind of member',
  status: 'Answer',
  previous_status: 'Answer before',
  attended: 'Turned up',
  note: 'Note',
  body: 'What it said',
  type: 'About',
  read_boolean: 'Read',
  on_date: 'Day',
  clocked_at: 'Clocked in at',
  previous_at: 'Time before',
  call_at: 'Due in at',
  method: 'How',
  address: 'Where your phone was',
  latitude: 'Latitude',
  longitude: 'Longitude',
  accuracy_m: 'How exact the position was (metres)',
  distance_m: 'How far from church (metres)',
  kind: 'Kind',
  gender: 'Man or woman',
  school: 'School',
  year_group: 'Year group',
  has_dbs: 'Says they have a DBS check',
  visa_type: 'Visa',
  visa_expiry: 'Visa runs out',
  visa_has_expiry: 'Visa has an end date',
  visa_note: 'Visa note',
  certificate_number: 'Certificate number',
  issued_on: 'Issued',
  surname: 'Surname on the certificate',
  workforce: 'Workforce',
  update_service: 'On the Update Service',
  share_code: 'Share code',
  consented_at: 'Gave permission to check',
  consent_wording: 'What you agreed to',
  wording: 'What it said',
  verified_at: 'Verified',
  verified_by: 'Verified by',
  certificate_seen: 'Certificate was seen',
  id_seen: 'Identity was seen',
  status_checked: 'Status was checked',
  event: 'What happened',
  at: 'When',
  by: 'By',
  state: 'Answer',
  browser: 'Browser',
  platform: 'Device',
  installed: 'App installed on the device',
  reported_at: 'Last told',
  asked_at: 'Asked',
  word: 'What you said',
  eta_at: 'When you expected to be there',
  how: 'How the time was arrived at',
  said_at: 'Said',
  asked_by: 'Asked by',
  is_shadow: 'Shadowing',
  include_pre: 'There before the service',
  include_during: 'There during the service',
  include_post: 'There after the service',
  is_substitute: 'Standing in',
  is_translator: 'Translating',
  after_close: 'After answers had closed',
  by_clock_in: 'Made by clocking in',
  by_request: 'Made by a request',
  seen: 'Parts of the tour seen',
  releases_seen: 'Notes about new things seen',
  pushed_at: 'Tour sent to you',
  pushed_by: 'Sent by',
  setup_asked_at: 'Asked to finish your details',
  setup_asked_by: 'Asked by',
  setup_closed_at: 'Finished your details',
  question: 'Question',
  title: 'Title',
  details: 'Details',
  onboarded_at: 'Finished joining',
  welcomed_at: 'First welcomed',
  created_at: 'Added',
  updated_at: 'Last changed',
  changed_at: 'When',
  changed_by: 'Changed by',
  created_by: 'Added by',
  added_by: 'Added by',
}

/** References that say nothing by themselves: the row's own number, and the reader on every row. */
const LEFT_OUT = new Set(['id', 'user_id', 'household_id', 'permanent_id', 'reference_id', 'guest_id', 'order_index', 'address_tries', 'address_tried_at', 'address_looked_up_at', 'heads_told'])

/** Columns whose ids name a thing, and which kind. */
const NAMED: Record<string, keyof Omit<Lookups, 'me'>> = { department_id: 'team', service_id: 'service', role_id: 'role', session_id: 'session' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DAY = /^\d{4}-\d{2}-\d{2}$/
const MOMENT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
/** A word the database uses for one of a few choices: `department_head`, `clocked_in`. */
const CODE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/

/** `service_session_assignees` as words, for a table or column this file has not heard of. */
export function plainName(name: string): string {
  const words = name.replace(/_(id|at)$/, '').replace(/_/g, ' ').trim()
  return words ? words[0].toUpperCase() + words.slice(1) : name
}

function dayWords(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function momentWords(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

/** One value as a person reads it, or null for nothing worth a line. */
export function readableValue(column: string, value: unknown, look: Lookups): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) {
    const parts = value.map((v) => readableValue(column, v, look)).filter((v): v is string => v !== null)
    return parts.length ? parts.join(', ') : null
  }
  if (typeof value === 'object') {
    // A set of things each with a time (the parts of the tour seen): the things. Otherwise each with what it holds.
    const pairs = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== null && v !== '')
    if (pairs.length === 0) return null
    if (pairs.every(([, v]) => typeof v === 'string' && MOMENT.test(v))) return pairs.map(([k]) => plainName(k)).join(', ')
    return pairs.map(([k, v]) => `${plainName(k)}: ${readableValue(k, v, look) ?? ''}`).join('; ')
  }
  const text = String(value)
  const kind = NAMED[column]
  if (kind) return look[kind].get(text) ?? (kind === 'service' ? 'A service that is no longer kept' : null)
  if (UUID.test(text)) {
    // Somebody: you, a name, or nobody this document can name.
    if (look.me && text === look.me) return 'You'
    return look.person.get(text) ?? null
  }
  if (DAY.test(text)) return dayWords(text)
  if (MOMENT.test(text)) return momentWords(text)
  if (CODE.test(text) && text.length <= 40 && column !== 'certificate_number' && column !== 'share_code') return plainName(text)
  return text
}

/** The order lines are read in: the order of the list above (a name before a date before who added it), then anything it has not heard of. */
const COLUMN_ORDER = new Map(Object.keys(COLUMNS).map((column, i) => [column, i]))

function entryOf(row: Record<string, unknown>, look: Lookups): ReadableEntry {
  const lines: [string, string][] = []
  const columns = Object.keys(row).sort(
    (a, b) => (COLUMN_ORDER.get(a) ?? COLUMN_ORDER.size) - (COLUMN_ORDER.get(b) ?? COLUMN_ORDER.size),
  )
  for (const column of columns) {
    if (LEFT_OUT.has(column)) continue
    const said = readableValue(column, row[column], look)
    if (said === null) continue
    lines.push([COLUMNS[column] ?? plainName(column), said])
  }
  return { lines }
}

/** Newest first, where a row says when it was. */
function whenOf(row: Record<string, unknown>): string {
  for (const column of ['on_date', 'clocked_at', 'changed_at', 'at', 'created_at', 'updated_at']) {
    const v = row[column]
    if (typeof v === 'string') return v
  }
  return ''
}

/**
 * The database's answer, as a document. Every table it gave is in it: the
 * ones this file knows in their order, then any it does not, by name.
 */
export function readableData(data: unknown, look: Lookups = NO_LOOKUPS): ReadableData {
  const answer = (data && typeof data === 'object' ? data : {}) as { made_at?: unknown; account?: unknown; tables?: unknown }
  const tables = (answer.tables && typeof answer.tables === 'object' ? answer.tables : {}) as Record<string, unknown>
  const account = (answer.account && typeof answer.account === 'object' ? answer.account : {}) as Record<string, unknown>

  const accountLines: [string, string][] = []
  for (const [column, label] of [
    ['email', 'Signs in as'],
    ['created_at', 'Account made'],
    ['email_confirmed_at', 'Email address confirmed'],
    ['last_sign_in_at', 'Last signed in'],
  ] as const) {
    const said = readableValue(column, account[column], look)
    if (said) accountLines.push([label, said])
  }

  const known = Object.keys(TABLES)
  const names = Object.keys(tables).sort((a, b) => {
    // A table read by two columns comes as "name (column)": filed with its table.
    const at = (n: string) => {
      const i = known.indexOf(n.replace(/ \(.*\)$/, ''))
      return i < 0 ? known.length : i
    }
    return at(a) - at(b) || a.localeCompare(b)
  })

  const sections: ReadableSection[] = []
  for (const name of names) {
    const rows = Array.isArray(tables[name]) ? (tables[name] as Record<string, unknown>[]) : []
    const base = name.replace(/ \(.*\)$/, '')
    const through = name.match(/ \((.*)\)$/)?.[1]
    const entries = [...rows]
      .sort((a, b) => whenOf(b).localeCompare(whenOf(a)))
      .map((row) => entryOf(row, look))
      .filter((entry) => entry.lines.length > 0)
    if (entries.length === 0) continue
    const worded = TABLES[base]
    sections.push({
      title: `${worded?.title ?? plainName(base)}${through ? ` (${(COLUMNS[through] ?? plainName(through)).toLowerCase()})` : ''}`,
      about: worded?.about,
      entries,
    })
  }

  return { made: typeof answer.made_at === 'string' ? momentWords(answer.made_at) : momentWords(new Date().toISOString()), account: accountLines, sections }
}

/** How many things the document lists, for the line that says the copy was made. */
export function countReadable(doc: ReadableData): { sections: number; entries: number } {
  return { sections: doc.sections.length, entries: doc.sections.reduce((sum, s) => sum + s.entries.length, 0) }
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch)

/**
 * The document as one file that opens in any browser and prints: no
 * script, no picture, nothing fetched. Everything in it came from the
 * database as somebody's typing, so every piece is escaped: a note that
 * says `<script>` is the words `<script>`.
 */
export function readableHtml(doc: ReadableData, who: string): string {
  const e = escapeHtml
  const lines = (pairs: [string, string][]) =>
    `<dl>${pairs.map(([label, value]) => `<div><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`).join('')}</dl>`
  const sections = doc.sections
    .map(
      (s) => `<section>
<h2>${e(s.title)}${s.entries.length > 1 ? ` <span class="count">${s.entries.length}</span>` : ''}</h2>
${s.about ? `<p class="about">${e(s.about)}</p>` : ''}
${s.entries.map((entry) => `<article>${lines(entry.lines)}</article>`).join('\n')}
</section>`,
    )
    .join('\n')
  const title = `What ${CHURCH_NAME}’s app holds about ${who || 'you'}`
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)}</title>
<style>
  :root { color-scheme: light dark; --ink: #111827; --soft: #4b5563; --faint: #6b7280; --line: #e5e7eb; --card: #f9fafb; }
  @media (prefers-color-scheme: dark) { :root { --ink: #f3f4f6; --soft: #d1d5db; --faint: #9ca3af; --line: #374151; --card: #1f2937; } }
  body { font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--ink); max-width: 46rem; margin: 0 auto; padding: 2rem 1rem 4rem; }
  h1 { font-size: 1.75rem; line-height: 1.2; margin: 0 0 .5rem; text-wrap: balance; }
  h2 { font-size: 1.2rem; margin: 2.5rem 0 .25rem; }
  .count { font: 0.8rem ui-monospace, monospace; color: var(--faint); font-weight: 400; }
  p { color: var(--soft); margin: .25rem 0 1rem; }
  .about { font-size: .95rem; }
  article { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: .75rem 1rem; margin: .5rem 0; break-inside: avoid; }
  dl { margin: 0; }
  dl > div { display: grid; grid-template-columns: minmax(9rem, 14rem) 1fr; gap: .25rem 1rem; padding: .2rem 0; }
  dt { color: var(--faint); }
  dd { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
  footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--line); font-size: .9rem; color: var(--faint); }
  @media (max-width: 30rem) { dl > div { grid-template-columns: 1fr; gap: 0; padding: .35rem 0; } }
  @media print { body { max-width: none; padding: 0; } article { border-color: #999; background: none; } }
</style>
</head>
<body>
<h1>${e(title)}</h1>
<p>Made on ${e(doc.made)}. This is everything the app keeps that is yours: each thing that would be deleted if your account were removed.</p>
<section>
<h2>Your account</h2>
<article>${lines(doc.account)}</article>
</section>
${sections}
<footer>
<p>Blank answers are left out, and so are the app’s own reference numbers. A team, a service or a person is shown by name where the app could still name it. The data file, offered beside this one in Settings, has every column exactly as it is stored.</p>
<p>To keep this as a PDF, print it and choose “Save as PDF”.</p>
</footer>
</body>
</html>
`
}
