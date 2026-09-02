import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { SearchIcon } from './icons'
import { formatServiceDay } from '../lib/sunday'

interface Hit {
  id: string
  kind: 'Page' | 'Team' | 'Person' | 'Equipment' | 'Service' | 'Role' | 'Message'
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

/**
 * One box over everything a person might be looking for: a team, someone's
 * name, a piece of kit by tag or model, a service by date.
 *
 * Each source is queried with the same term and RLS decides what comes
 * back, so nobody is shown the existence of something they could not open.
 */
async function search(term: string): Promise<Hit[]> {
  const like = `%${term}%`

  const [teams, people, equipment, services, roles, messages] = await Promise.all([
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
      label: row.body.length > 60 ? `${row.body.slice(0, 60)}…` : row.body,
      detail: 'Message board',
      to: '/messages',
    })
  }

  return hits
}

export function GlobalSearch() {
  const navigate = useNavigate()
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const wrapper = useRef<HTMLDivElement>(null)
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

  // ⌘K / Ctrl-K from anywhere, the shortcut people already try.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        input.current?.focus()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  function go(hit: Hit) {
    setOpen(false)
    setTerm('')
    navigate(hit.to)
  }

  return (
    <div ref={wrapper} className="relative w-full max-w-sm">
      <label className="flex items-center gap-2.5 rounded-full bg-surface-low px-4 py-2.5 text-body-sm text-on-surface-variant ring-1 ring-inset ring-black/5 transition-shadow duration-500 ease-[var(--ease-glide)] focus-within:ring-2 focus-within:ring-secondary dark:bg-surface-container dark:ring-white/10">
        <SearchIcon width={16} height={16} />
        <input
          ref={input}
          value={term}
          onChange={(e) => {
            setTerm(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') return setOpen(false)
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
          className="w-full bg-transparent text-on-surface outline-none placeholder:text-on-surface-variant"
        />
        <kbd className="hidden shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant ring-1 ring-inset ring-black/8 sm:block dark:ring-white/10">
          ⌘K
        </kbd>
      </label>

      {open && term.trim().length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-[var(--radius-shell)] bg-surface-lowest shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12">
          {!enabled ? (
            <p className="px-4 py-3 text-body-sm text-on-surface-variant">
              Keep typing — {MIN_QUERY} letters or more.
            </p>
          ) : results.isLoading ? (
            <p className="px-4 py-3 text-body-sm text-on-surface-variant">Searching…</p>
          ) : hits.length === 0 ? (
            <p className="px-4 py-3 text-body-sm text-on-surface-variant">
              Nothing matches “{debounced}”.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {hits.map((hit, i) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(hit)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors duration-200 ${
                      i === active ? 'bg-surface-low' : ''
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block break-words text-body-sm text-on-surface">{hit.label}</span>
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
      )}
    </div>
  )
}
