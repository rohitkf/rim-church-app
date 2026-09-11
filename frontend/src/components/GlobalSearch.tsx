import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { SearchIcon } from './icons'
import { formatServiceDay } from '../lib/sunday'
import { Overlay } from './Surface'
import { shortcutLabel, shortcutSpoken, thisPlatform } from '../lib/shortcutKey'

interface Hit {
  id: string
  kind:
    | 'Page'
    | 'Team'
    | 'Person'
    | 'Equipment'
    | 'Service'
    | 'Role'
    | 'Message'
    | 'Event'
    | 'Song'
    | 'Session'
    | 'Team chat'
    | 'Alert'
    | 'Template'
  label: string
  detail: string
  to: string
}

/** The places in the app itself, so the box also works as a way to move. */
const PAGES: { label: string; detail: string; to: string; keywords: string }[] = [
  { label: 'Dashboard', detail: 'Readiness, availability and celebrations', to: '/', keywords: 'home overview readiness' },
  { label: 'Service Planner', detail: 'Running orders and templates', to: '/service-planner', keywords: 'plan running order sessions templates' },
  { label: 'Checklists', detail: 'Pre-service checks and sign-off', to: '/checklists', keywords: 'checks verify sign off' },
  { label: 'Availability Tracker', detail: 'Who can serve, and who turned up', to: '/availability', keywords: 'available attendance rota answers' },
  { label: 'Team Rota', detail: 'Who is doing what', to: '/rota', keywords: 'assign roles duty' },
  { label: 'Teams', detail: 'Departments, roles and handbooks', to: '/departments', keywords: 'departments handbook roles' },
  { label: 'Volunteers', detail: 'Everyone, their teams and permissions', to: '/volunteers', keywords: 'people members admin permissions' },
  { label: 'Inventory', detail: 'Equipment registers and value', to: '/inventory', keywords: 'equipment kit assets stock' },
  { label: 'Messages', detail: 'The message board', to: '/messages', keywords: 'announcements board post' },
  { label: 'Settings', detail: 'Your profile and appearance', to: '/settings/profile', keywords: 'profile account theme password' },
  { label: 'Access & privileges', detail: 'Who can do what', to: '/settings/access', keywords: 'permissions roles admin access privileges' },
  { label: 'App settings', detail: 'The church’s clocks and windows', to: '/settings/church', keywords: 'settings timings rota window clear' },
]

const MIN_QUERY = 2

/** A line of somebody's writing, short enough to sit in a result row. */
function snippet(body: string): string {
  return body.length > 60 ? `${body.slice(0, 60)}…` : body
}

/**
 * One box over everything a person might be looking for: a team, someone's
 * name, a piece of kit by tag or model, a service by date.
 *
 * Each source is queried with the same term and RLS decides what comes
 * back, so nobody is shown the existence of something they could not open.
 */
async function search(term: string): Promise<Hit[]> {
  const like = `%${term}%`

  const [
    teams,
    people,
    equipment,
    services,
    roles,
    messages,
    events,
    songs,
    sessions,
    teamChat,
    alerts,
    templates,
  ] = await Promise.all([
    supabase.from('departments').select('id, name').ilike('name', like).limit(4),
    supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like}`)
      .limit(4),
    supabase
      .from('inventory_items')
      .select('id, name, asset_tag, model, department_id')
      .or(`name.ilike.${like},asset_tag.ilike.${like},model.ilike.${like},serial_number.ilike.${like}`)
      .limit(5),
    supabase
      .from('services')
      .select('id, date, service_type')
      .ilike('service_type', like)
      .order('date', { ascending: false })
      .limit(3),
    supabase
      .from('department_roles')
      .select('id, name, department_id, departments(name)')
      .ilike('name', like)
      .limit(4),
    supabase
      .from('messages')
      .select('id, body, created_at')
      .ilike('body', like)
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('church_events')
      .select('id, title, event_date, location')
      .or(`title.ilike.${like},details.ilike.${like},location.ilike.${like}`)
      .order('event_date', { ascending: false })
      .limit(4),
    supabase
      .from('set_list_items')
      .select('id, title, led_by, service_id')
      .or(`title.ilike.${like},led_by.ilike.${like}`)
      .limit(4),
    supabase
      .from('service_sessions')
      .select('id, session_name, role_label, service_id')
      .or(`session_name.ilike.${like},role_label.ilike.${like}`)
      .limit(4),
    supabase
      .from('team_messages')
      .select('id, body, department_id, created_at')
      .ilike('body', like)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('announcements')
      .select('id, body, created_at')
      .ilike('body', like)
      .order('created_at', { ascending: false })
      .limit(3),
    supabase.from('service_templates').select('id, name').ilike('name', like).limit(3),
  ])

  const hits: Hit[] = []

  const needle = term.toLowerCase()
  for (const page of PAGES) {
    if (`${page.label} ${page.keywords}`.toLowerCase().includes(needle)) {
      hits.push({ id: `page-${page.to}`, kind: 'Page', label: page.label, detail: page.detail, to: page.to })
    }
  }

  for (const row of z
    .array(z.object({ id: z.string(), name: z.string() }))
    .catch([])
    .parse(teams.data ?? [])) {
    hits.push({ id: `team-${row.id}`, kind: 'Team', label: row.name, detail: 'Team', to: `/departments/${row.id}` })
  }

  for (const row of z
    .array(z.object({ id: z.string(), first_name: z.string(), last_name: z.string(), email: z.string() }))
    .catch([])
    .parse(people.data ?? [])) {
    hits.push({
      id: `person-${row.id}`,
      kind: 'Person',
      label: `${row.first_name} ${row.last_name}`.trim() || row.email,
      detail: row.email,
      to: '/volunteers',
    })
  }

  for (const row of z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        asset_tag: z.string().nullable().optional(),
        model: z.string().nullable().optional(),
        department_id: z.string(),
      }),
    )
    .catch([])
    .parse(equipment.data ?? [])) {
    hits.push({
      id: `kit-${row.id}`,
      kind: 'Equipment',
      label: row.name,
      detail: [row.asset_tag, row.model].filter(Boolean).join(' · ') || 'Equipment',
      to: `/inventory/${row.department_id}`,
    })
  }

  for (const row of z
    .array(z.object({ id: z.string(), date: z.string(), service_type: z.string() }))
    .catch([])
    .parse(services.data ?? [])) {
    hits.push({
      id: `service-${row.id}`,
      kind: 'Service',
      label: row.service_type,
      detail: formatServiceDay(row.date),
      to: `/service-planner/${row.id}`,
    })
  }

  for (const row of z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        department_id: z.string(),
        departments: z.object({ name: z.string() }).nullable().optional(),
      }),
    )
    .catch([])
    .parse(roles.data ?? [])) {
    hits.push({
      id: `role-${row.id}`,
      kind: 'Role',
      label: row.name,
      detail: row.departments?.name ?? 'Team role',
      to: `/departments/${row.department_id}`,
    })
  }

  for (const row of z
    .array(z.object({ id: z.string(), body: z.string(), created_at: z.string() }))
    .catch([])
    .parse(messages.data ?? [])) {
    hits.push({
      id: `message-${row.id}`,
      kind: 'Message',
      label: snippet(row.body),
      detail: 'Message board',
      to: '/messages',
    })
  }

  for (const row of z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        event_date: z.string(),
        location: z.string().nullable().optional(),
      }),
    )
    .catch([])
    .parse(events.data ?? [])) {
    hits.push({
      id: `event-${row.id}`,
      kind: 'Event',
      label: row.title,
      detail: [formatServiceDay(row.event_date), row.location].filter(Boolean).join(' · '),
      to: '/events',
    })
  }

  for (const row of z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        led_by: z.string().nullable().optional(),
        service_id: z.string(),
      }),
    )
    .catch([])
    .parse(songs.data ?? [])) {
    hits.push({
      id: `song-${row.id}`,
      kind: 'Song',
      label: row.title,
      detail: row.led_by ? `Led by ${row.led_by}` : 'Set list',
      to: '/set-lists',
    })
  }

  for (const row of z
    .array(
      z.object({
        id: z.string(),
        session_name: z.string(),
        role_label: z.string().nullable().optional(),
        service_id: z.string(),
      }),
    )
    .catch([])
    .parse(sessions.data ?? [])) {
    hits.push({
      id: `session-${row.id}`,
      kind: 'Session',
      label: row.session_name,
      detail: row.role_label ?? 'Running order',
      to: `/service-planner/${row.service_id}`,
    })
  }

  for (const row of z
    .array(z.object({ id: z.string(), body: z.string(), department_id: z.string() }))
    .catch([])
    .parse(teamChat.data ?? [])) {
    hits.push({
      id: `chat-${row.id}`,
      kind: 'Team chat',
      label: snippet(row.body),
      detail: 'Team chat',
      to: '/team-chat',
    })
  }

  for (const row of z
    .array(z.object({ id: z.string(), body: z.string() }))
    .catch([])
    .parse(alerts.data ?? [])) {
    hits.push({
      id: `alert-${row.id}`,
      kind: 'Alert',
      label: snippet(row.body),
      detail: 'Alert that went out',
      to: '/messages',
    })
  }

  for (const row of z
    .array(z.object({ id: z.string(), name: z.string() }))
    .catch([])
    .parse(templates.data ?? [])) {
    hits.push({
      id: `template-${row.id}`,
      kind: 'Template',
      label: row.name,
      detail: 'Service template',
      to: '/service-planner/templates',
    })
  }

  return hits
}

/**
 * One box over everything, and it opens in the middle of the screen.
 *
 * It used to be a text field in the header with a list hanging off the
 * bottom of it: a quarter of the width of the page for results that reach
 * across the whole app, competing with the header for room on a laptop
 * and pinned under the notch on a phone. ⌘K focused it, which on a busy
 * page meant the thing you had summoned was a thin strip in the corner.
 *
 * Now the header carries a button that looks like a field, and pressing
 * it — or the shortcut, from anywhere — opens the search over the page,
 * centred, the way every search worth using since Spotlight has done it.
 * The page behind it is held still (see Overlay), so the list you are
 * arrowing through cannot scroll away underneath you.
 */
export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const platform = useMemo(() => thisPlatform(), [])

  // ⌘K or Ctrl-K from anywhere. Both modifiers, always — only the label
  // in the corner is platform-specific, because a keyboard that has one
  // of these keys is not confused by the app accepting the other.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((was) => !was)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Search — ${shortcutSpoken(platform)}`}
        aria-keyshortcuts={platform.platform && /mac|iphone|ipad/i.test(platform.platform) ? 'Meta+K' : 'Control+K'}
        className="tap flex w-full max-w-sm items-center gap-2.5 rounded-full bg-surface-low px-4 py-2.5 text-body-sm text-on-surface-variant ring-1 ring-inset ring-black/5 transition-shadow duration-500 ease-[var(--ease-glide)] hover:ring-secondary/50 dark:bg-surface-container dark:ring-white/10"
      >
        <SearchIcon width={16} height={16} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">Search anything…</span>
        {/* The key this keyboard actually has. It advertised ⌘K to
            everybody, including the people who do not have that key. */}
        <kbd className="hidden shrink-0 whitespace-nowrap rounded-md px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant ring-1 ring-inset ring-black/8 sm:block dark:ring-white/10">
          {shortcutLabel(platform)}
        </kbd>
      </button>

      {open && <SearchPalette onClose={() => setOpen(false)} />}
    </>
  )
}

/** The search itself, over the page rather than beside it. */
function SearchPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [term, setTerm] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  const debounced = useDebouncedValue(term.trim(), 200)
  const enabled = debounced.length >= MIN_QUERY

  const results = useQuery({
    queryKey: ['global-search', debounced],
    queryFn: () => search(debounced),
    enabled,
  })

  const hits = useMemo(() => results.data ?? [], [results.data])

  useEffect(() => setActive(0), [debounced])
  useEffect(() => input.current?.focus(), [])

  function go(hit: Hit) {
    onClose()
    navigate(hit.to)
  }

  return (
    <Overlay onDismiss={onClose} label="Search" closable={false}>
      <div
        // Stops at the width of a sentence and the height of a screenful:
        // a palette that grows to fill a 1440px desk is a page, and this
        // is a thing you look at for two seconds.
        className="w-full max-w-xl overflow-hidden rounded-[var(--radius-shell)] bg-surface-lowest shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12"
      >
        <label className="flex items-center gap-3 border-b border-border-subtle px-5 py-4">
          <SearchIcon width={18} height={18} className="shrink-0 text-on-surface-variant" />
          <input
            ref={input}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (!hits.length) return
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((i) => (i + 1) % hits.length)
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((i) => (i - 1 + hits.length) % hits.length)
              }
              if (e.key === 'Enter') {
                e.preventDefault()
                go(hits[active])
              }
            }}
            placeholder="Search anything…"
            aria-label="Search"
            className="w-full bg-transparent text-body-lg text-on-surface outline-none placeholder:text-on-surface-faint"
          />
          <kbd className="hidden shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] text-on-surface-faint ring-1 ring-inset ring-black/8 sm:block dark:ring-white/10">
            esc
          </kbd>
        </label>

        {!term.trim() ? (
          <p className="px-5 py-4 text-body-sm text-on-surface-variant">
            People, teams, services, kit, songs, messages — anything you can open.
          </p>
        ) : !enabled ? (
          <p className="px-5 py-4 text-body-sm text-on-surface-variant">
            Keep typing — {MIN_QUERY} letters or more.
          </p>
        ) : results.isLoading ? (
          <p className="px-5 py-4 text-body-sm text-on-surface-variant">Searching…</p>
        ) : hits.length === 0 ? (
          <p className="px-5 py-4 text-body-sm text-on-surface-variant">
            Nothing matches &ldquo;{debounced}&rdquo;.
          </p>
        ) : (
          <ul className="max-h-[min(60vh,28rem)] overflow-y-auto py-1.5">
            {hits.map((hit, i) => (
              <li key={hit.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(hit)}
                  className={`flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors duration-200 ${
                    i === active ? 'bg-surface-low' : ''
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block break-words text-body-md text-on-surface">{hit.label}</span>
                    <span className="block break-words text-label-sm text-on-surface-variant">
                      {hit.detail}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-surface-container px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">
                    {hit.kind}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Overlay>
  )
}
