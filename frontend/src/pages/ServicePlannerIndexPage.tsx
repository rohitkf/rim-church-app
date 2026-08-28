import { type FormEvent, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { QueryState } from '../components/QueryState'
import { useAuth } from '../auth/AuthContext'
import { fetchServices, fetchServiceTemplates, fetchTemplateSessions } from '../lib/queries'
import { addMinutesIso, combineDateAndTime } from '../lib/time'
import { agendaDate, monthGrid, monthTitle, todayIso } from '../lib/monthGrid'
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

  const upcoming = useMemo(
    () => visibleServices.filter((s) => s.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6),
    [visibleServices, today],
  )

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
            ? 'Tap a service on the calendar to open its running order.'
            : 'Tap a service on the calendar to open its running order. Upcoming services appear here once they are scheduled.'
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
                className="rounded-full hairline px-2.5 py-1.5 text-body-sm text-on-surface hover:border-secondary"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => setCursor({ year: now.getFullYear(), month: now.getMonth() })}
                className="rounded-full hairline px-2.5 py-1.5 text-body-sm text-on-surface hover:border-secondary"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
                className="rounded-full hairline px-2.5 py-1.5 text-body-sm text-on-surface hover:border-secondary"
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
                  <div className="mt-1 flex flex-col gap-1">
                    {dayServices.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => navigate(`/service-planner/${s.id}`)}
                        title={`${s.service_type} — ${s.date}`}
                        className={`w-full truncate rounded-sm px-1.5 py-1 text-left text-label-sm font-medium ${
                          s.date < today
                            ? 'bg-surface-container text-on-surface-variant'
                            : 'bg-secondary text-on-primary hover:opacity-90'
                        }`}
                      >
                        {s.service_type}
                      </button>
                    ))}
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

        {upcoming.length > 0 && (
          <section className="mt-6">
            <div className="text-headline-md">Upcoming services</div>
            <ul className="mt-3 flex flex-col gap-3">
              {upcoming.map((s) => {
                const d = agendaDate(s.date)
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/service-planner/${s.id}`)}
                      className="flex w-full items-center gap-4 rounded-[var(--radius-card)] bg-surface-lowest hairline p-4 text-left hover:border-secondary"
                    >
                      <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-md bg-secondary/10 text-secondary">
                        <span className="font-mono text-label-sm uppercase leading-none">{d.month}</span>
                        <span className="text-headline-md leading-tight">{d.day}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-on-surface">{s.service_type}</span>
                        <span className="block text-body-sm text-on-surface-variant">
                          {d.weekday} · {s.date}
                        </span>
                      </span>
                      <span className="shrink-0 text-on-surface-variant">›</span>
                    </button>
                  </li>
                )
              })}
            </ul>
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
