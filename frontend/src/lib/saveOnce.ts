/**
 * A save sent twice is carried out once (0286).
 *
 * Where the database has a natural key a repeat is harmless: one clock-in
 * a person a day, one vote a poll. A song, a board post, an issue, a
 * registration have none. And the answer to a save can be lost — the
 * phone gives up after a minute on a bad connection while the database
 * has already done it — so the second tap, a perfectly reasonable thing
 * to do when the app said it failed, saves it again. A button that greys
 * out covers the double tap on a good day; nothing covered the answer
 * that never came (the system-design review, November 2026).
 *
 * This sits under every request the app makes and changes only creates:
 *
 *   A row the app inserts itself   The database would give a new row its
 *       id; the app gives it one first. When the answer never comes, the
 *       ids are remembered, and the same save sent again carries the same
 *       ids — so if the first did land, the second is refused as a
 *       duplicate, and that refusal is read as what it is: already saved.
 *       The caller gets the row back as if it had just made it.
 *   A function that creates        The ones in SAVE_ONCE_FUNCTIONS have a
 *       form that takes a key (`p_request_key`, migration 0286). The same
 *       key again is answered by the database with the first answer.
 *   Two at once                    The same create while the first is
 *       still on its way does not go out at all: both callers get the one
 *       answer. That is the double tap.
 *
 * What it does not do is guess. Two saves that are the same on purpose —
 * the same message posted twice, a minute apart — are two saves: a save
 * is only treated as a repeat when the one before it, identical to the
 * last character, never got an answer, or is still waiting for one.
 * Nothing is remembered once any answer arrives, including "no".
 *
 * No call site changes, and none must: a create that names its own id, an
 * upsert, an update, a delete and every read pass through untouched.
 */

/**
 * Tables whose new rows the app gives an id: the ones the app may insert
 * into directly, with `id uuid primary key default gen_random_uuid()`.
 * `saveOnce.test.ts` holds this to the migrations, both ways — a table
 * here must be made that way, and a new table made that way must be
 * either here or in NOT_INSERTED_BY_THE_APP below.
 */
export const SAVE_ONCE_TABLES: ReadonlySet<string> = new Set([
  'app_notices', 'availability', 'availability_change_requests', 'checklist_items', 'checklists',
  'church_events', 'department_guests', 'department_members', 'department_role_checklist_items',
  'department_role_groups', 'department_roles', 'departments', 'giving_bank_accounts', 'giving_links',
  'guest_availability', 'guest_rota_assignments', 'guests', 'inventory_categories', 'inventory_documents',
  'inventory_items', 'messages', 'purchase_requests', 'registration_event_dates', 'registration_events',
  'registration_promo_codes', 'registration_ticket_types', 'rota_assignments', 'rota_checklist_progress',
  'rota_release_requests', 'rota_tags', 'service_debrief_items', 'service_debriefs', 'service_series',
  'service_session_assignees', 'service_sessions', 'service_template_sessions', 'service_templates',
  'services', 'set_list_items', 'songs', 'stage_areas', 'stage_blocks', 'stage_comments', 'stage_layouts',
  'team_messages', 'team_poll_options', 'team_poll_votes', 'team_polls', 'user_roles',
])

/**
 * Tables with the same kind of id that the app never inserts into itself:
 * written by a function, a trigger or a timed job (no insert policy), or
 * by the device rather than a person's press. Listed so that a new table
 * has to be put on one list or the other.
 */
export const NOT_INSERTED_BY_THE_APP: ReadonlySet<string> = new Set([
  'activity', 'announcements', 'app_feedback', 'attendance', 'availability_history', 'church_updates',
  'client_errors', 'clock_in_history', 'clock_in_requests', 'clock_ins', 'department_role_permanents',
  'family_link_requests', 'guest_availability_history', 'household_members', 'households', 'inventory_events',
  'invitations', 'notifications', 'ownership_transfers', 'permission_changes', 'permission_grants',
  'prayer_lists', 'prayer_requests', 'prayer_updates', 'push_subscriptions', 'registration_order_tickets',
  'registration_orders', 'service_issues', 'stage_layout_log', 'stage_move_requests',
  'stage_template_requests', 'stage_templates', 'team_join_requests',
])

/**
 * Functions that create something with no natural key, each with a form
 * that takes a request key (migration 0286 lists the same names; a test
 * holds the two together).
 */
export const SAVE_ONCE_FUNCTIONS: ReadonlySet<string> = new Set([
  'registration_register',
  'registration_walk_in',
  'send_announcement',
  'alert_team',
  'post_church_update',
  'raise_issue',
  'submit_feedback',
  'prayer_ask',
  'prayer_add_update',
  'create_service_series',
  'add_guest_to_team',
  'push_onboarding',
  'prompt_setup',
  'prompt_location',
])

/** The argument the repeat-safe form of a function takes its key in. */
export const REQUEST_KEY = 'p_request_key'

/** How long a save that never got an answer is remembered: a retry comes within minutes. */
export const UNSETTLED_FOR_MS = 10 * 60_000
/** No more than this many are remembered; the oldest go first. */
const UNSETTLED_MAX = 30
const STORAGE_KEY = 'rim.unsettled-saves'

/** What the app says when it knows the save landed but cannot hand the row back. */
export const ALREADY_SAVED = 'This was already saved a moment ago, so nothing has been added twice. Reload to see it.'

interface Unsettled {
  ids: string[]
  at: number
}

type Kind = { what: 'insert'; table: string } | { what: 'call'; fn: string }

interface Create {
  kind: Kind
  /** The request as the caller wrote it: what makes two saves "the same". */
  key: string
  /** The rows, or the function's arguments. */
  body: unknown
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** A short, stable name for a long string: enough to tell one save from another on one device. */
function digest(text: string): string {
  let a = 0xdeadbeef ^ text.length
  let b = 0x41c6ce57 ^ text.length
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i)
    a = Math.imul(a ^ c, 2654435761)
    b = Math.imul(b ^ c, 1597334677)
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909)
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909)
  return `${(b >>> 0).toString(36)}${(a >>> 0).toString(36)}${text.length.toString(36)}`
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // An old browser on plain http: the same shape, from the same source of chance.
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

const headerOf = (init: RequestInit | undefined, name: string): string => new Headers(init?.headers).get(name) ?? ''

/** Whether this request creates something this file looks after — and if so, what. */
export function createIn(url: string, init: RequestInit | undefined): Create | null {
  if ((init?.method ?? 'GET').toUpperCase() !== 'POST' || typeof init?.body !== 'string') return null
  let at: URL
  try {
    at = new URL(url)
  } catch {
    return null
  }
  const path = /\/rest\/v1\/(.+)$/.exec(at.pathname)?.[1]
  if (!path) return null

  let body: unknown
  try {
    body = JSON.parse(init.body)
  } catch {
    return null
  }
  const key = digest(`${at.pathname}${at.search}\n${init.body}`)

  if (path.startsWith('rpc/')) {
    const fn = path.slice(4)
    if (!SAVE_ONCE_FUNCTIONS.has(fn) || !isRecord(body) || REQUEST_KEY in body) return null
    return { kind: { what: 'call', fn }, key, body }
  }

  if (!SAVE_ONCE_TABLES.has(path)) return null
  // An upsert already says what a repeat means.
  if (at.searchParams.has('on_conflict') || /resolution=/.test(headerOf(init, 'Prefer'))) return null
  const rows = Array.isArray(body) ? body : [body]
  if (rows.length === 0 || !rows.every(isRecord)) return null
  // A create that names its own id has already done this, its own way.
  if (rows.some((row) => row.id !== undefined && row.id !== null)) return null
  return { kind: { what: 'insert', table: path }, key, body }
}

/** The request with its ids in it. */
function withIds(url: string, init: RequestInit, create: Create, ids: string[]): { url: string; init: RequestInit } {
  if (create.kind.what === 'call') {
    return { url, init: { ...init, body: JSON.stringify({ ...(create.body as Record<string, unknown>), [REQUEST_KEY]: ids[0] }) } }
  }
  const rows = (Array.isArray(create.body) ? create.body : [create.body]) as Record<string, unknown>[]
  const named = rows.map((row, i) => ({ ...row, id: ids[i] }))
  const at = new URL(url)
  // Many rows at once name the columns they fill; the id is one more.
  const columns = at.searchParams.get('columns')
  if (columns && !columns.split(',').includes('"id"')) at.searchParams.set('columns', `${columns},"id"`)
  return { url: at.toString(), init: { ...init, body: JSON.stringify(Array.isArray(create.body) ? named : named[0]) } }
}

/** A gateway that gave up says nothing about whether the database did. */
const answerUnknown = (status: number) => status === 502 || status === 503 || status === 504 || (status >= 520 && status <= 524)

/**
 * The database refusing a row because its id is already there. On a retry
 * that can only be the try before: the ids are this file's own and drawn
 * at random, so nothing else holds them.
 *
 * It is known by the name of the table's own primary key and nothing
 * more. The database does say which id collided — to the table's owner.
 * To a signed-in person it leaves that line out, because row security is
 * on and the row might not be theirs to know about; so the id cannot be
 * looked for in the answer (tried against Postgres 17, November 2026).
 * Every table in SAVE_ONCE_TABLES has a key named `<table>_pkey`; a test
 * holds that no migration renames one.
 */
async function isOurDuplicate(res: Response, table: string): Promise<boolean> {
  if (res.status !== 409) return false
  try {
    const said = (await res.clone().json()) as { code?: unknown; message?: unknown }
    return said.code === '23505' && typeof said.message === 'string' && said.message.includes(`"${table}_pkey"`)
  } catch {
    return false
  }
}

function load(storage: Storage | null, now: number): Map<string, Unsettled> {
  const kept = new Map<string, Unsettled>()
  try {
    const raw = storage?.getItem(STORAGE_KEY)
    if (!raw) return kept
    for (const [key, value] of Object.entries(JSON.parse(raw) as Record<string, Unsettled>)) {
      if (value && Array.isArray(value.ids) && typeof value.at === 'number' && now - value.at < UNSETTLED_FOR_MS) kept.set(key, value)
    }
  } catch {
    // Storage that cannot be read remembers nothing: a retry is then an ordinary save, as it always was.
  }
  return kept
}

function safeSessionStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

/**
 * Wrap `fetch` so a create sent twice is carried out once. `baseFetch`
 * must be the one that gives up after a deadline: that giving up is what
 * marks a save as having had no answer.
 */
export function saveOnce(
  baseFetch: typeof fetch,
  options: { storage?: Storage | null; now?: () => number; makeId?: () => string } = {},
): typeof fetch {
  const storage = options.storage === undefined ? safeSessionStorage() : options.storage
  const now = options.now ?? Date.now
  const makeId = options.makeId ?? newId
  const unsettled = load(storage, now())
  const inFlight = new Map<string, Promise<Response>>()

  const persist = () => {
    try {
      if (unsettled.size === 0) storage?.removeItem(STORAGE_KEY)
      else storage?.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(unsettled)))
    } catch {
      // Not remembered across a reload, then; still remembered here.
    }
  }
  const remember = (key: string, ids: string[]) => {
    unsettled.delete(key)
    unsettled.set(key, { ids, at: now() })
    while (unsettled.size > UNSETTLED_MAX) unsettled.delete(unsettled.keys().next().value as string)
    persist()
  }
  const forget = (key: string) => {
    if (unsettled.delete(key)) persist()
  }

  /** The row (or rows) the earlier try made, handed back as if this one had made them. */
  async function alreadySaved(url: string, init: RequestInit, table: string, ids: string[]): Promise<Response> {
    const wantsRows = /return=representation/.test(headerOf(init, 'Prefer'))
    if (!wantsRows) return new Response(null, { status: 201, statusText: 'Created' })
    try {
      const at = new URL(url)
      const read = new URL(at.origin + at.pathname)
      read.searchParams.set('id', `in.(${ids.join(',')})`)
      read.searchParams.set('select', at.searchParams.get('select') ?? '*')
      const headers = new Headers(init.headers)
      headers.delete('Prefer')
      headers.delete('Content-Type')
      const res = await baseFetch(read.toString(), { method: 'GET', headers, signal: init.signal })
      if (res.ok) {
        let text = await res.text()
        let readable = true
        try {
          const rows: unknown = JSON.parse(text)
          if (Array.isArray(rows)) {
            // Fewer rows than were made: some are not this person's to read. Say so in words instead.
            readable = rows.length === ids.length
            // An insert hands its rows back in the order they were sent; a read does not promise to.
            const place = (row: unknown) => (isRecord(row) && typeof row.id === 'string' ? ids.indexOf(row.id) : -1)
            if (readable && rows.every((row) => place(row) >= 0)) text = JSON.stringify([...rows].sort((a, b) => place(a) - place(b)))
          }
        } catch {
          readable = false
        }
        if (readable) {
          return new Response(text, {
            status: 201,
            statusText: 'Created',
            headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
          })
        }
      }
    } catch {
      // Falls through: it is saved, and that much can still be said.
    }
    // P0001 is how the database's own sentences arrive; this is one, written here.
    return new Response(JSON.stringify({ code: 'P0001', message: ALREADY_SAVED, details: `${table} ${ids.join(',')}`, hint: null }), {
      status: 409,
      statusText: 'Conflict',
      headers: { 'Content-Type': 'application/json' },
    })
  }

  async function send(url: string, init: RequestInit, create: Create): Promise<Response> {
    const before = unsettled.get(create.key)
    const again = !!before && now() - before.at < UNSETTLED_FOR_MS
    const count = create.kind.what === 'call' ? 1 : Array.isArray(create.body) ? create.body.length : 1
    const ids = again && before.ids.length === count ? before.ids : Array.from({ length: count }, makeId)
    const request = withIds(url, init, create, ids)

    let res: Response
    try {
      res = await baseFetch(request.url, request.init)
    } catch (error) {
      // No answer: it may have landed. Send the same ids if it is tried again.
      remember(create.key, ids)
      throw error
    }
    if (answerUnknown(res.status)) {
      remember(create.key, ids)
      return res
    }
    forget(create.key)
    if (again && create.kind.what === 'insert' && (await isOurDuplicate(res, create.kind.table))) {
      return alreadySaved(request.url, request.init, create.kind.table, ids)
    }
    return res
  }

  return async (input, init) => {
    // The Supabase client sends an address and its options; anything else is not a create of ours.
    if (typeof input !== 'string') return baseFetch(input, init)
    let create: Create | null = null
    try {
      create = createIn(input, init)
    } catch {
      create = null
    }
    if (!create || !init) return baseFetch(input, init)

    // The same create, already on its way: one request, and the one answer for both.
    const going = inFlight.get(create.key)
    if (going) return (await going).clone()

    const key = create.key
    const sent = send(input, init, create)
    inFlight.set(key, sent)
    try {
      return (await sent).clone()
    } finally {
      inFlight.delete(key)
    }
  }
}
