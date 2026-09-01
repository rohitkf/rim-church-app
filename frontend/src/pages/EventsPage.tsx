import { type FormEvent, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { ActionButton, Field, PageHeader, inputClasses } from '../components/Surface'
import { fetchDepartments, fetchServices } from '../lib/queries'
import { monthGrid, monthTitle, todayIso } from '../lib/monthGrid'
import { formatServiceDay } from '../lib/sunday'
import { useErrorText } from '../lib/useErrorText'
import { TeamMark } from '../components/TeamMark'
import {
  KIND_LABEL,
  buildDiary,
  byDay,
  type DiaryEntry,
  type DiaryEvent,
  type DiaryKind,
} from '../lib/churchDiary'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const personSchema = z.object({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  dob: z.string().nullable(),
  anniversary: z.string().nullable(),
})

const eventSchema = z.object({
  id: z.string(),
  title: z.string(),
  details: z.string().nullable(),
  event_date: z.string(),
  start_time: z.string().nullable(),
  location: z.string().nullable(),
  department_id: z.string().nullable(),
  created_by: z.string().nullable(),
  creator: z.object({ first_name: z.string(), last_name: z.string() }).nullable(),
  department: z.object({ name: z.string(), color: z.string().nullable() }).nullable(),
})

async function fetchPeople() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, dob, anniversary')
  if (error) throw error
  return z.array(personSchema).parse(data)
}

async function fetchEvents(): Promise<DiaryEvent[]> {
  const { data, error } = await supabase
    .from('church_events')
    .select(
      'id, title, details, event_date, start_time, location, department_id, created_by, creator:profiles!church_events_created_by_fkey(first_name, last_name), department:departments(name, color)',
    )
    .order('event_date')
  if (error) throw error
  return z.array(eventSchema).parse(data)
}

/** The dot a day wears in the calendar, and the chip a row wears in the list. */
const KIND_TONE: Record<DiaryKind, { dot: string; chip: string }> = {
  birthday: { dot: 'bg-accent-orange', chip: 'bg-accent-orange/15 text-accent-orange' },
  anniversary: { dot: 'bg-secondary', chip: 'bg-secondary/15 text-secondary' },
  service: { dot: 'bg-primary', chip: 'bg-primary/15 text-primary' },
  event: { dot: 'bg-accent-green', chip: 'bg-accent-green/15 text-accent-green' },
}

/**
 * Everything the church has a date for.
 *
 * Birthdays and anniversaries used to be a panel on the dashboard — seen by
 * whoever happened to look that morning and gone by the afternoon — and
 * services lived on the planner. Neither answers "what is on in March", which
 * is the question a diary exists for. So: one month at a glance, one list
 * underneath, and the things somebody decides on can be added to it.
 */
export function EventsPage() {
  const { session, isAdmin, isDepartmentHead } = useAuth()
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const today = todayIso()
  const now = new Date()

  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [location, setLocation] = useState('')
  const [details, setDetails] = useState('')
  const [departmentId, setDepartmentId] = useState('')

  const peopleQuery = useQuery({ queryKey: ['diary-people'], queryFn: fetchPeople })
  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: fetchServices })
  const eventsQuery = useQuery({ queryKey: ['church-events'], queryFn: fetchEvents })
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })

  // Which teams this person may file an event under. An Admin may use any,
  // including none — a church event belongs to the church.
  const myTeams = useMemo(
    () => (departmentsQuery.data ?? []).filter((d) => isAdmin || isDepartmentHead(d.id)),
    [departmentsQuery.data, isAdmin, isDepartmentHead],
  )
  const canAdd = isAdmin || myTeams.length > 0

  const diary = useMemo(
    () =>
      buildDiary({
        people: peopleQuery.data ?? [],
        services: servicesQuery.data ?? [],
        events: eventsQuery.data ?? [],
        today,
      }),
    [peopleQuery.data, servicesQuery.data, eventsQuery.data, today],
  )

  const byDate = useMemo(() => {
    const map = new Map<string, DiaryEntry[]>()
    for (const entry of diary) map.set(entry.date, [...(map.get(entry.date) ?? []), entry])
    return map
  }, [diary])

  const days = useMemo(() => byDay(diary), [diary])

  const addEvent = useMutation({
    mutationFn: async () => {
      const { error: insertError } = await supabase.from('church_events').insert({
        title: title.trim(),
        event_date: date,
        start_time: startTime || null,
        location: location.trim() || null,
        details: details.trim() || null,
        department_id: departmentId || null,
        created_by: session!.user.id,
      })
      if (insertError) throw insertError
    },
    onSuccess: () => {
      setAdding(false)
      setTitle(''); setDate(''); setStartTime(''); setLocation(''); setDetails(''); setDepartmentId('')
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['church-events'] })
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not add that event.')),
  })

  const removeEvent = useMutation({
    mutationFn: async (id: string) => {
      const { error: deleteError } = await supabase.from('church_events').delete().eq('id', id)
      if (deleteError) throw deleteError
    },
    onSuccess: () => {
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['church-events'] })
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not remove that event.')),
  })

  // Opening the form with a day already chosen. Tapping the 14th is
  // somebody saying which day they mean; asking again in the form is the
  // app not listening.
  function openAdd(on?: string) {
    setDate(on ?? '')
    setAdding(true)
  }

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !date) return
    addEvent.mutate()
  }

  const mayEdit = (entry: DiaryEntry) => {
    if (entry.kind !== 'event') return false
    const row = (eventsQuery.data ?? []).find((ev) => `event:${ev.id}` === entry.id)
    if (!row) return false
    return isAdmin || (!!row.department_id && isDepartmentHead(row.department_id))
  }

  const weeks = monthGrid(cursor.year, cursor.month)
  const shiftMonth = (delta: number) =>
    setCursor(({ year, month }) => {
      const at = new Date(year, month + delta, 1)
      return { year: at.getFullYear(), month: at.getMonth() }
    })

  const isLoading =
    peopleQuery.isLoading || servicesQuery.isLoading || eventsQuery.isLoading
  const loadError = peopleQuery.error || servicesQuery.error || eventsQuery.error

  return (
    <div>
      <PageHeader
        eyebrow="What is coming up"
        title="Events"
        description="Birthdays, anniversaries, services and everything else the church has a date for — in one diary."
        action={
          canAdd && (
            <ActionButton onClick={() => openAdd()} glyph={<span aria-hidden="true">+</span>}>
              Add event
            </ActionButton>
          )
        }
      />

      {error && (
        <p className="mt-4 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      <QueryState isLoading={isLoading} error={loadError}>
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
                className={`bg-surface-lowest px-1 py-2 text-center font-mono text-label-sm uppercase tracking-wide ${
                  d === 'Sun' ? 'text-secondary' : 'text-on-surface-variant'
                }`}
              >
                {d}
              </div>
            ))}
            {weeks.flat().map((cell) => {
              const onThisDay = byDate.get(cell.iso) ?? []
              return (
                <div
                  key={cell.iso}
                  className={`relative min-h-14 bg-surface-lowest p-1 sm:min-h-20 ${cell.inMonth ? '' : 'opacity-40'}`}
                >
                  {/* Tapping a square adds an event on that day. A real
                      button behind the square rather than a handler on it,
                      so it can be tabbed to and says which day it means. */}
                  {canAdd && (
                    <button
                      type="button"
                      onClick={() => openAdd(cell.iso)}
                      aria-label={`Add an event on ${formatServiceDay(cell.iso)}`}
                      title={`Add an event on ${formatServiceDay(cell.iso)}`}
                      className="absolute inset-0 z-0 rounded-sm transition-colors duration-300 hover:bg-surface-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary"
                    />
                  )}
                  <div
                    className={`pointer-events-none relative z-10 mx-auto flex h-6 w-6 items-center justify-center rounded-full font-mono text-label-sm ${
                      cell.iso === today ? 'bg-primary text-on-primary' : 'text-on-surface-variant'
                    }`}
                  >
                    {cell.day}
                  </div>
                  {/* A seventh of a phone cannot hold a name, so the calendar
                      says which days have something on and the list below
                      says what. One dot per kind, not per entry: five
                      birthdays are still "birthdays on this day". */}
                  <div className="pointer-events-none relative z-10 mt-1 flex flex-wrap justify-center gap-0.5">
                    {[...new Set(onThisDay.map((e) => e.kind))].map((kind) => (
                      <span
                        key={kind}
                        title={KIND_LABEL[kind]}
                        className={`h-1.5 w-1.5 rounded-full ${KIND_TONE[kind].dot}`}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
            {(Object.keys(KIND_LABEL) as DiaryKind[]).map((kind) => (
              <li key={kind} className="flex items-center gap-1.5 text-label-md text-on-surface-variant">
                <span className={`h-1.5 w-1.5 rounded-full ${KIND_TONE[kind].dot}`} />
                {KIND_LABEL[kind]}
              </li>
            ))}
          </ul>
        </section>

        {days.length === 0 ? (
          <p className="mt-6 text-body-sm text-on-surface-variant">
            Nothing in the diary yet.
          </p>
        ) : (
          <section className="mt-8">
            <div className="text-headline-md">Coming up</div>
            <div className="mt-3 flex flex-col gap-5">
              {days.map(([date, entries]) => (
                <div key={date}>
                  <div className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
                    {date === today ? 'Today' : formatServiceDay(date)}
                  </div>
                  <ul className="mt-2 flex flex-col gap-2">
                    {entries.map((entry) => {
                      const body = (
                        <div className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1">
                          {entry.color && <TeamMark color={entry.color} />}
                          <span className="min-w-0 break-words text-body-md font-medium text-on-surface">
                            {entry.title}
                          </span>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-label-sm uppercase tracking-wide ${KIND_TONE[entry.kind].chip}`}
                          >
                            {KIND_LABEL[entry.kind]}
                          </span>
                          {entry.detail && (
                            <span className="min-w-0 break-words text-body-sm text-on-surface-variant">
                              {entry.detail}
                            </span>
                          )}
                        </div>
                      )
                      return (
                        <li
                          key={entry.id}
                          className="rounded-[var(--radius-row)] bg-surface-lowest p-3.5 hairline"
                        >
                          {entry.href ? (
                            <Link to={entry.href} className="block hover:opacity-90">
                              {body}
                            </Link>
                          ) : (
                            body
                          )}
                          {/* Whose idea it was, said quietly — an event with
                              no name on it invites "who put this here?"
                              every time somebody reads it. */}
                          {(entry.addedBy || mayEdit(entry)) && (
                            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                              <span className="font-mono text-label-sm text-on-surface-faint">
                                {entry.addedBy ? `Added by ${entry.addedBy}` : ''}
                              </span>
                              {mayEdit(entry) && (
                                <button
                                  type="button"
                                  onClick={() => removeEvent.mutate(entry.id.replace('event:', ''))}
                                  className="tap text-label-md text-on-surface-faint hover:text-error hover:underline"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}
      </QueryState>

      {adding && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-event-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8 backdrop-blur-sm"
        >
          <form
            onSubmit={handleAdd}
            className="max-h-full w-full max-w-lg overflow-y-auto rounded-[var(--radius-shell)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12"
          >
            <h2 id="add-event-title" className="text-headline-md">
              Add an event
            </h2>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              It appears in everyone&rsquo;s diary, with your name on it.
            </p>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="What is it" className="sm:col-span-2">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Members' meeting, baptism, workday…"
                  autoFocus
                  className={inputClasses}
                />
              </Field>
              <Field label="Date">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={`${inputClasses} [color-scheme:dark]`}
                />
              </Field>
              <Field label="Start time (optional)">
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className={`${inputClasses} [color-scheme:dark]`}
                />
              </Field>
              <Field label="Where (optional)" className="sm:col-span-2">
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Main hall"
                  className={inputClasses}
                />
              </Field>
              <Field label="Whose event" className="sm:col-span-2">
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className={inputClasses}
                >
                  {isAdmin && <option value="">The whole church</option>}
                  {myTeams.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Anything else (optional)" className="sm:col-span-2">
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  rows={3}
                  className={`${inputClasses} resize-y`}
                />
              </Field>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="rounded-full px-4 py-2.5 text-body-sm font-medium text-on-surface ring-1 ring-black/8 hover:ring-black/20 dark:ring-white/10"
              >
                Cancel
              </button>
              <ActionButton type="submit" disabled={addEvent.isPending || !title.trim() || !date} glyph="+">
                {addEvent.isPending ? 'Adding' : 'Add event'}
              </ActionButton>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
