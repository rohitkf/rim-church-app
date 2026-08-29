import { Fragment, type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { QueryState } from '../components/QueryState'
import { useAuth } from '../auth/AuthContext'
import { fetchServices, fetchServiceTemplates, fetchTemplateSessions } from '../lib/queries'
import { addMinutesIso, combineDateAndTime } from '../lib/time'
import { agendaDate, monthGrid, monthTitle, todayIso } from '../lib/monthGrid'
import { serviceBounds } from '../lib/serviceProgress'
import { lastWeeklyClear, lastWeeklyClearDate } from '../lib/plannerWeek'
import { formatTime } from '../lib/time'
import { isNewServiceFormDirty } from '../lib/formDirty'
import { UnsavedChangesDialog, useUnsavedChangesGuard } from '../components/UnsavedChangesGuard'
import { ActionButton, Field, PageHeader, inputClasses } from '../components/Surface'
import type { Service } from '../lib/types'
import { useErrorText } from '../lib/useErrorText'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function ServicePlannerIndexPage() {
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: fetchServices })
  const templatesQuery = useQuery({
    queryKey: ['service-templates'],
    queryFn: fetchServiceTemplates,
    enabled: isAdmin,
  })

  const [newDate, setNewDate] = useState('')
  const [newType, setNewType] = useState('')
  const [templateId, setTemplateId] = useState('')

  // The modal lives in the URL: the button needs no shared state, and the
  // form stays linkable — /service-planner?new=1 opens it directly.
  const [params, setParams] = useSearchParams()
  const creating = params.get('new') === '1'
  const openCreate = () => {
    params.set('new', '1')
    setParams(params)
  }
  const closeCreate = () => {
    params.delete('new')
    setParams(params, { replace: true })
  }
  const [createError, setCreateError] = useState<string | null>(null)
  // Tracks the last value WE wrote into the name field, so switching
  // templates keeps auto-filling until the admin types their own name.
  const lastAutoFilledName = useRef('')

  const { blocker, allowNavigation } = useUnsavedChangesGuard(isNewServiceFormDirty(newDate, newType))

  function handleTemplateChange(id: string) {
    setTemplateId(id)
    const template = templatesQuery.data?.find((t) => t.id === id)
    if (!newType.trim() || newType === lastAutoFilledName.current) {
      setNewType(template?.name ?? '')
      lastAutoFilledName.current = template?.name ?? ''
    }
  }

  const createService = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('services')
        .insert({ date: newDate, service_type: newType.trim() })
        .select()
        .single()
      if (error) throw error
      const created = z.object({ id: z.string() }).parse(data)

      // Materialize the template's timeline onto the new service: the
      // first session starts at the template's usual start time, each
      // later one at the previous start + duration.
      if (templateId) {
        const template = templatesQuery.data?.find((t) => t.id === templateId)
        const templateSessions = await fetchTemplateSessions(templateId)
        if (template && templateSessions.length > 0) {
          let start = combineDateAndTime(newDate, template.start_time.slice(0, 5))
          const rows = templateSessions.map((ts) => {
            const row = {
              service_id: created.id,
              order_index: ts.order_index,
              start_time: start,
              duration_minutes: ts.duration_minutes,
              session_name: ts.session_name,
            }
            start = addMinutesIso(start, ts.duration_minutes)
            return row
          })
          const { error: sessionsError } = await supabase.from('service_sessions').insert(rows)
          if (sessionsError) throw sessionsError
        }
      }
      return created.id
    },
    onSuccess: (id) => {
      // The form's contents just became a real service, so jumping into
      // its planner isn't "leaving unsaved work" — don't warn about it.
      allowNavigation()
      setNewDate('')
      setNewType('')
      setCreateError(null)
      queryClient.invalidateQueries({ queryKey: ['services'] })
      navigate(`/service-planner/${id}`)
    },
    onError: (err: unknown) => setCreateError(errorText(err, 'Could not create service.')),
  })

  function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!newDate || !newType.trim()) return
    createService.mutate()
  }

  const now = new Date()
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const today = todayIso()

  // Team members only plan ahead: past services are Admin-only history.
  const visibleServices = useMemo(
    () => (servicesQuery.data ?? []).filter((s) => isAdmin || s.date >= today),
    [servicesQuery.data, isAdmin, today],
  )
  const servicesByDate = useMemo(() => {
    const map = new Map<string, Service[]>()
    for (const s of visibleServices) {
      map.set(s.date, [...(map.get(s.date) ?? []), s])
    }
    return map
  }, [visibleServices])

  // What time each upcoming service runs, from its own running order. A
  // service with no order planned has no times to show — inventing some
  // would be worse than saying nothing.
  // Back to the last Tuesday, not just from today: a service that finished
  // this week still has to be drawn, with the times it actually ran.
  const weekStartDate = lastWeeklyClearDate()

  // Re-read the clock so a service that ends while the page is open moves
  // itself down rather than waiting for someone to reload.
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  const upcomingIds = useMemo(
    () => visibleServices.filter((s) => s.date >= weekStartDate).map((s) => s.id),
    [visibleServices, weekStartDate],
  )
  const sessionsQuery = useQuery({
    queryKey: ['planner-index-sessions', upcomingIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_sessions')
        .select('service_id, start_time, duration_minutes')
        .in('service_id', upcomingIds)
      if (error) throw error
      return z
        .array(
          z.object({
            service_id: z.string(),
            start_time: z.string(),
            duration_minutes: z.number().nullable(),
          }),
        )
        .parse(data)
    },
    enabled: upcomingIds.length > 0,
  })

  const windowFor = useMemo(() => {
    const byService = new Map<string, { id: string; start_time: string; duration_minutes: number | null }[]>()
    for (const row of sessionsQuery.data ?? []) {
      byService.set(row.service_id, [
        ...(byService.get(row.service_id) ?? []),
        { id: `${row.service_id}-${row.start_time}`, ...row },
      ])
    }
    const windows = new Map<string, { from: number; to: number }>()
    for (const [serviceId, rows] of byService) {
      const bounds = serviceBounds(rows)
      if (bounds) windows.set(serviceId, bounds)
    }
    return windows
  }, [sessionsQuery.data])

  // A service is finished when its last session's end has passed — the
  // running order already says so, and nothing has to be marked or
  // remembered for it to be true.
  const finishedIds = useMemo(() => {
    const done = new Set<string>()
    for (const [serviceId, window] of windowFor) {
      if (clock >= window.to) done.add(serviceId)
    }
    return done
  }, [windowFor, clock])

  const upcoming = useMemo(
    () =>
      visibleServices
        .filter((s) => s.date >= today && !finishedIds.has(s.id))
        // By day, then by when it actually starts — two services on one
        // Sunday should read morning before evening, which alphabetical
        // order by name does not promise.
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            (windowFor.get(a.id)?.from ?? Infinity) - (windowFor.get(b.id)?.from ?? Infinity) ||
            a.service_type.localeCompare(b.service_type),
        )
        .slice(0, 6),
    [visibleServices, today, windowFor, finishedIds],
  )

  // What has already happened this week, most recent first. Anything that
  // ended before the last Tuesday is simply not here: the list empties on
  // the same clock as the message board rather than growing for ever.
  const finished = useMemo(() => {
    const since = lastWeeklyClear()
    return visibleServices
      .filter((s) => finishedIds.has(s.id) && (windowFor.get(s.id)?.to ?? 0) >= since)
      .sort((a, b) => (windowFor.get(b.id)?.to ?? 0) - (windowFor.get(a.id)?.to ?? 0))
  }, [visibleServices, finishedIds, windowFor])

  // Two services on one Sunday are one day with two services in it, not
  // two unrelated rows that happen to repeat a date. Saying the date once
  // is both shorter and truer.
  const upcomingDays = useMemo(() => groupByDate(upcoming), [upcoming])
  const finishedDays = useMemo(() => groupByDate(finished), [finished])

  function shiftMonth(delta: number) {
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  const weeks = monthGrid(cursor.year, cursor.month)

  return (
    <div>
      <PageHeader
        eyebrow="The month ahead"
        title="Service Planner"
        description={
          isAdmin
            ? 'Tap a service to open its running order.'
            : 'Tap a service to open its running order. Upcoming services appear here once they are scheduled.'
        }
        action={
          isAdmin && (
            /* The only way to start a service. It used to live in the
               sidebar; the sidebar is now a dock of destinations, and an
               action is not a destination — so it belongs here, where the
               design puts every page's one primary action. */
            <ActionButton onClick={openCreate} glyph={<span aria-hidden="true">+</span>}>
              New service
            </ActionButton>
          )
        }
      />

      <QueryState isLoading={servicesQuery.isLoading} error={servicesQuery.error}>
        <section className="mt-6 rounded-[var(--radius-card)] bg-surface-lowest hairline p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-headline-md">{monthTitle(cursor.year, cursor.month)}</div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
                className="tap-square rounded-full hairline px-2.5 py-1.5 text-body-sm text-on-surface hover:border-secondary"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => setCursor({ year: now.getFullYear(), month: now.getMonth() })}
                className="tap-square rounded-full hairline px-2.5 py-1.5 text-body-sm text-on-surface hover:border-secondary"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
                className="tap-square rounded-full hairline px-2.5 py-1.5 text-body-sm text-on-surface hover:border-secondary"
              >
                ›
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-px overflow-hidden rounded-md border border-border-subtle bg-border-subtle">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className={`bg-surface-lowest px-1 py-2 text-center font-mono text-label-sm uppercase tracking-wide ${d === 'Sun' ? 'text-secondary' : 'text-on-surface-variant'}`}
              >
                {d}
              </div>
            ))}
            {weeks.flat().map((cell) => {
              const dayServices = servicesByDate.get(cell.iso) ?? []
              const isToday = cell.iso === today
              return (
                <div
                  key={cell.iso}
                  className={`min-h-16 bg-surface-lowest p-1 sm:min-h-20 ${cell.inMonth ? '' : 'opacity-40'}`}
                >
                  <div
                    className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full font-mono text-label-sm ${
                      isToday ? 'bg-primary text-on-primary' : 'text-on-surface-variant'
                    }`}
                  >
                    {cell.day}
                  </div>
                  {/*
                    A seventh of a phone is 50px, which turns every service
                    name into "S…" — a chip that says nothing and cannot be
                    read. So below `sm` the day carries dots instead: the
                    calendar's job there is to say which days have
                    something on, and the agenda underneath — where the
                    names have a whole line each — says what.
                  */}
                  <div className="mt-1 flex flex-wrap justify-center gap-1 sm:flex-col sm:flex-nowrap sm:justify-start">
                    {dayServices.map((s) => {
                      // Green once it has happened, blue while it is still
                      // to come — the same two colours the lists below
                      // use, so the calendar and the agenda never disagree
                      // about what is behind you.
                      const tone = finishedIds.has(s.id)
                        ? {
                            chip: 'bg-[color-mix(in_oklab,var(--color-accent-green)_20%,transparent)] text-accent-green hover:opacity-90',
                            dot: 'bg-accent-green',
                          }
                        : s.date < today
                          ? {
                              chip: 'bg-surface-container text-on-surface-variant',
                              dot: 'bg-on-surface-faint',
                            }
                          : {
                              chip: 'bg-secondary text-on-primary hover:opacity-90',
                              dot: 'bg-secondary',
                            }
                      return (
                        <Fragment key={s.id}>
                          <span
                            aria-hidden="true"
                            className={`h-1.5 w-1.5 rounded-full sm:hidden ${tone.dot}`}
                          />
                          <button
                            type="button"
                            onClick={() => navigate(`/service-planner/${s.id}`)}
                            title={`${s.service_type} — ${s.date}`}
                            className={`hidden w-full truncate rounded-sm px-1.5 py-1 text-left text-label-sm font-medium sm:block ${tone.chip}`}
                          >
                            {s.service_type}
                          </button>
                        </Fragment>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {isAdmin && creating && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-service-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
          >
            <form
              onSubmit={handleCreate}
              className="w-full max-w-lg rounded-[var(--radius-shell)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 id="new-service-title" className="text-headline-md">
                  New service
                </h2>
                <Link
                  to="/service-planner/templates"
                  className="shrink-0 text-body-sm font-medium text-secondary"
                >
                  Manage templates ›
                </Link>
              </div>
              <p className="mt-1 text-body-sm text-on-surface-variant">
                Start from a template to get the usual running order pre-filled, or Blank to build
                it yourself.
              </p>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Date">
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    autoFocus
                    className={inputClasses}
                  />
                </Field>
                <Field label="Service type">
                  <input
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    placeholder="English, Malayalam…"
                    className={inputClasses}
                  />
                </Field>
                <Field label="Template" className="sm:col-span-2">
                  <select
                    value={templateId}
                    onChange={(e) => handleTemplateChange(e.target.value)}
                    className={inputClasses}
                  >
                    <option value="">Blank</option>
                    {templatesQuery.data?.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              {createError && (
                <p className="mt-4 rounded-xl bg-error-container px-3.5 py-2.5 text-body-sm text-on-error-container">
                  {createError}
                </p>
              )}

              <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeCreate}
                  className="rounded-full px-4 py-2.5 text-body-sm font-medium text-on-surface ring-1 ring-black/8 transition-all duration-500 ease-[var(--ease-glide)] hover:ring-black/20 dark:ring-white/10"
                >
                  Cancel
                </button>
                <ActionButton
                  type="submit"
                  disabled={createService.isPending || !newDate || !newType.trim()}
                  glyph="+"
                >
                  {createService.isPending ? 'Creating' : 'Create service'}
                </ActionButton>
              </div>
            </form>
          </div>
        )}

        {upcomingDays.length > 0 && (
          <section className="mt-6">
            <div className="text-headline-md">Upcoming services</div>
            <div className="mt-3 flex flex-col gap-5">
              {upcomingDays.map(([date, services]) => (
                <DayGroup
                  key={date}
                  date={date}
                  services={services}
                  windowFor={windowFor}
                  onOpen={(id) => navigate(`/service-planner/${id}`)}
                />
              ))}
            </div>
          </section>
        )}

        {/* What has already happened, out of the way of what hasn't.
            Still openable — the running order is where the overruns and
            the sign-offs are, and the week after is when anyone actually
            looks at them. */}
        {finishedDays.length > 0 && (
          <section className="mt-8">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div className="text-headline-md text-on-surface-variant">Finished</div>
              <p className="font-mono text-label-sm text-on-surface-faint">
                Clears every Tuesday
              </p>
            </div>
            <div className="mt-3 flex flex-col gap-5">
              {finishedDays.map(([date, services]) => (
                <DayGroup
                  key={date}
                  date={date}
                  services={services}
                  windowFor={windowFor}
                  finished
                  onOpen={(id) => navigate(`/service-planner/${id}`)}
                />
              ))}
            </div>
          </section>
        )}
      </QueryState>

      <UnsavedChangesDialog
        blocker={blocker}
        message="This service hasn’t been created yet. Leaving now discards what you’ve entered."
      />
    </div>
  )
}

/** Services under the day they happen on, in the order they were given. */
function groupByDate(services: Service[]): [string, Service[]][] {
  const days = new Map<string, Service[]>()
  for (const service of services) {
    days.set(service.date, [...(days.get(service.date) ?? []), service])
  }
  return [...days.entries()]
}

/**
 * One day, and everything on in it.
 *
 * The date is the group's, not each row's: repeating "Sun · 2026-08-30"
 * under two services made them look like two separate days that happened
 * to collide, and left the reader comparing dates to work out that they
 * are the same morning. Said once at the top, the rows underneath are
 * free to be what actually distinguishes them — the name and the time.
 *
 * A finished day is green rather than blue. The blue accent is this app's
 * "here is where you are going"; green is its "this is done", the same
 * colour a signed-off checklist and a completed session already use, so a
 * glance down the page separates what happened from what is still to
 * come without reading a word.
 */
function DayGroup({
  date,
  services,
  windowFor,
  finished = false,
  onOpen,
}: {
  date: string
  services: Service[]
  windowFor: Map<string, { from: number; to: number }>
  finished?: boolean
  onOpen: (serviceId: string) => void
}) {
  const d = agendaDate(date)

  return (
    <div className="flex gap-4">
      <div
        className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-md ${
          finished
            ? 'bg-[color-mix(in_oklab,var(--color-accent-green)_14%,transparent)] text-accent-green'
            : 'bg-secondary/10 text-secondary'
        }`}
      >
        <span className="font-mono text-label-sm uppercase leading-none">{d.month}</span>
        <span className="text-headline-md leading-tight">{d.day}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <span className="text-body-md font-medium text-on-surface">{d.weekday}</span>
          <span className="font-mono text-label-sm text-on-surface-faint">{date}</span>
          {services.length > 1 && (
            <span className="font-mono text-label-sm text-on-surface-faint">
              · {services.length} services
            </span>
          )}
        </div>

        <ul className="mt-2 flex flex-col gap-2">
          {services.map((service) => {
            const runWindow = windowFor.get(service.id)
            return (
              <li key={service.id}>
                <button
                  type="button"
                  onClick={() => onOpen(service.id)}
                  className={`flex w-full items-center gap-4 rounded-[var(--radius-card)] bg-surface-lowest p-4 text-left transition-colors ${
                    finished
                      ? 'shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent-green)_20%,transparent)] hover:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent-green)_40%,transparent)]'
                      : 'hairline hover:border-secondary'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-8 w-0.5 shrink-0 rounded-full ${
                      finished ? 'bg-accent-green' : 'bg-secondary'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-on-surface">
                      {service.service_type}
                    </span>
                    <span className="mt-0.5 block font-mono text-label-sm text-on-surface-faint tabular">
                      {runWindow
                        ? `${formatTime(new Date(runWindow.from).toISOString())} – ${formatTime(
                            new Date(runWindow.to).toISOString(),
                          )}`
                        : 'No running order yet'}
                    </span>
                  </span>
                  <span className="shrink-0 text-on-surface-variant">›</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
