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
  diaryTime,
  type DiaryEntry,
  type DiaryEvent,
  type DiaryKind,
} from '../lib/churchDiary'
import { fetchEvents } from '../lib/churchEvents'
import { Select } from '../components/Select'
import { DateRangePicker } from '../components/DateRangePicker'
import { dayCount, formatRange } from '../lib/dateRange'
import { useConfirmAction } from '../components/ConfirmAction'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const personSchema = z.object({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  dob: z.string().nullable(),
  anniversary: z.string().nullable(),
})

async function fetchPeople() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, dob, anniversary')
  if (error) throw error
  return z.array(personSchema).parse(data)
}

/**
 * The dot a day wears in the calendar, and the chip a row wears in the list.
 *
 * Four kinds, four hues, and no two of them the same one: an anniversary
 * used to wear the secondary blue and a service the primary blue, which
 * are a shade apart and read as one colour in a list — so the legend
 * claimed a distinction the rows did not make. Anniversaries are indigo
 * now, leaving blue to mean "a service" alone.
 */
const KIND_TONE: Record<DiaryKind, { dot: string; chip: string }> = {
  birthday: { dot: 'bg-accent-orange', chip: 'bg-accent-orange/15 text-accent-orange' },
  anniversary: {
    dot: 'bg-accent-indigo',
    chip: 'bg-[color-mix(in_oklab,var(--color-accent-indigo)_18%,transparent)] text-accent-indigo-soft',
  },
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
  /**
   * The event being changed, or null when the form is adding a new one.
   *
   * One form for both: an edit that looked different from an add would be
   * a second place for the same eight fields to drift apart.
   */
  const [editing, setEditing] = useState<DiaryEvent | null>(null)
  /*
   * The event somebody has opened to read.
   *
   * A diary row is one line — a name, a chip, a time — because a list of
   * twenty of them has to be scannable. Everything else an event carries
   * (where it is, whose it is, what was written under "anything else") had
   * nowhere to be read, so it was typed in and never seen again.
   */
  const [reading, setReading] = useState<DiaryEvent | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  /** The last day, when it runs on. Null is the single-day majority. */
  const [endDate, setEndDate] = useState<string | null>(null)
  const [startTime, setStartTime] = useState('')
  const [location, setLocation] = useState('')
  const [details, setDetails] = useState('')
  const [departmentId, setDepartmentId] = useState('')

  const { ask, dialog } = useConfirmAction()

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

  const saveEvent = useMutation({
    mutationFn: async () => {
      const fields = {
        title: title.trim(),
        event_date: date,
        ends_on: endDate,
        start_time: startTime || null,
        location: location.trim() || null,
        details: details.trim() || null,
        department_id: departmentId || null,
      }
      // `created_by` belongs to whoever put it in the diary and is not
      // rewritten by whoever corrects it later: the name on the row is a
      // fact about who decided, not about who last touched a field.
      const { error: writeError } = editing
        ? await supabase.from('church_events').update(fields).eq('id', editing.id)
        : await supabase
            .from('church_events')
            .insert({ ...fields, created_by: session!.user.id })
      if (writeError) throw writeError
    },
    onSuccess: () => {
      closeForm()
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['church-events'] })
    },
    onError: (err: unknown) =>
      setError(errorText(err, editing ? 'Could not save that change.' : 'Could not add that event.')),
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

  function closeForm() {
    setAdding(false)
    setEditing(null)
    setTitle(''); setDate(''); setEndDate(null); setStartTime('')
    setLocation(''); setDetails(''); setDepartmentId('')
  }

  // Opening the form with a day already chosen. Tapping the 14th is
  // somebody saying which day they mean; asking again in the form is the
  // app not listening.
  function openAdd(on?: string) {
    closeForm()
    setDate(on ?? today)
    setAdding(true)
  }

  /** The same form, holding what the event already says. */
  function openEdit(row: DiaryEvent) {
    setEditing(row)
    setTitle(row.title)
    setDate(row.event_date)
    setEndDate(row.ends_on && row.ends_on > row.event_date ? row.ends_on : null)
    // "19:30:00" in the database; the time field wants "19:30".
    setStartTime(row.start_time ? row.start_time.slice(0, 5) : '')
    setLocation(row.location ?? '')
    setDetails(row.details ?? '')
    setDepartmentId(row.department_id ?? '')
    setAdding(true)
  }

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !date) return
    saveEvent.mutate()
  }

  /**
   * The row an entry came from.
   *
   * An event that runs over several days is one row drawn on each of them,
   * so its entry id carries the day as well: `event:<id>:<date>`. The id
   * in the middle is the row.
   */
  const eventIdOf = (entry: DiaryEntry) =>
    entry.kind === 'event' ? entry.id.split(':')[1] ?? null : null

  const mayEdit = (entry: DiaryEntry) => {
    const id = eventIdOf(entry)
    const row = id ? (eventsQuery.data ?? []).find((ev) => ev.id === id) : null
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
                          {/* A run says which day of itself this is, or
                              the same name on five days reads as five
                              events somebody entered by mistake. */}
                          {entry.span && (
                            <span className="shrink-0 rounded-full bg-raised-strong px-2 py-0.5 font-mono text-label-sm text-on-surface-variant">
                              Day {entry.span.day} of {entry.span.of} ·{' '}
                              {formatRange(entry.span.from, entry.span.to, today)}
                            </span>
                          )}
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
                          ) : eventIdOf(entry) ? (
                            <button
                              type="button"
                              onClick={() => {
                                const id = eventIdOf(entry)
                                const row = (eventsQuery.data ?? []).find((ev) => ev.id === id)
                                if (row) setReading(row)
                              }}
                              aria-label={`${entry.title} — see the details`}
                              className="block w-full text-left hover:opacity-90"
                            >
                              {body}
                            </button>
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
                                <span className="flex items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const id = eventIdOf(entry)
                                      const row = (eventsQuery.data ?? []).find((ev) => ev.id === id)
                                      if (row) openEdit(row)
                                    }}
                                    className="tap text-label-md text-on-surface-faint hover:text-secondary hover:underline"
                                  >
                                    Edit
                                  </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    ask({
                                      title: `Remove ${entry.title} from the diary?`,
                                      body: 'It disappears from the calendar for everybody.',
                                      confirmLabel: 'Remove',
                                      onConfirm: () => {
                                        const id = eventIdOf(entry)
                                        if (id) removeEvent.mutate(id)
                                      },
                                    })
                                  }
                                  className="tap text-label-md text-on-surface-faint hover:text-error hover:underline"
                                >
                                  Remove
                                </button>
                                </span>
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
              {editing ? 'Edit this event' : 'Add an event'}
            </h2>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              {editing
                ? 'Everyone sees the change, wherever it appears in the diary.'
                : 'It appears in everyone’s diary, with your name on it.'}
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
              {/* The app's own calendar rather than the browser's wheel:
                  a church diary is full of things that run over several
                  days, and the native field cannot say so. */}
              <Field label="When" className="sm:col-span-2">
                <DateRangePicker
                  from={date || today}
                  to={endDate}
                  today={today}
                  label="When the event runs"
                  onChange={({ from, to }) => {
                    setDate(from)
                    setEndDate(to)
                  }}
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
                <Select
                  value={departmentId}
                  onChange={setDepartmentId}
                  options={[
                    ...(isAdmin ? [{ value: '', label: 'The whole church' }] : []),
                    ...myTeams.map((d) => ({ value: d.id, label: d.name })),
                  ]}
                />
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
                onClick={closeForm}
                className="rounded-full px-4 py-2.5 text-body-sm font-medium text-on-surface ring-1 ring-black/8 hover:ring-black/20 dark:ring-white/10"
              >
                Cancel
              </button>
              <ActionButton
                type="submit"
                disabled={saveEvent.isPending || !title.trim() || !date}
                glyph={editing ? undefined : '+'}
              >
                {saveEvent.isPending
                  ? editing
                    ? 'Saving'
                    : 'Adding'
                  : editing
                    ? 'Save changes'
                    : 'Add event'}
              </ActionButton>
            </div>
          </form>
        </div>
      )}

      {/*
        An event, read rather than scanned.

        The row in the list is one line on purpose — twenty of them have to
        be scannable — so everything else an event carries had nowhere to
        be seen: where it is, whose it is, and whatever was typed under
        "anything else", which is usually the part that matters.
       */}
      {reading && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="event-detail-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setReading(null)
          }}
        >
          <div className="max-h-full w-full max-w-md overflow-y-auto rounded-[var(--radius-shell)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12">
            <div className="flex flex-wrap items-center gap-2">
              {reading.department?.color && <TeamMark color={reading.department.color} />}
              <span
                className={`rounded-full px-2 py-0.5 font-mono text-label-sm uppercase tracking-wide ${KIND_TONE.event.chip}`}
              >
                {KIND_LABEL.event}
              </span>
            </div>
            <h2 id="event-detail-title" className="mt-2 text-headline-md">
              {reading.title}
            </h2>

            <dl className="mt-4 flex flex-col gap-3">
              <div>
                <dt className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
                  When
                </dt>
                <dd className="mt-0.5 text-body-md text-on-surface">
                  {formatRange(reading.event_date, reading.ends_on, today)}
                  {reading.ends_on && reading.ends_on > reading.event_date && (
                    <span className="text-on-surface-variant">
                      {' '}
                      · {dayCount(reading.event_date, reading.ends_on)} days
                    </span>
                  )}
                  {diaryTime(reading.start_time) && (
                    <span className="text-on-surface-variant">
                      {' '}
                      · from {diaryTime(reading.start_time)}
                    </span>
                  )}
                </dd>
              </div>

              {reading.location && (
                <div>
                  <dt className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
                    Where
                  </dt>
                  <dd className="mt-0.5 break-words text-body-md text-on-surface">
                    {reading.location}
                  </dd>
                </div>
              )}

              <div>
                <dt className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
                  Whose event
                </dt>
                <dd className="mt-0.5 text-body-md text-on-surface">
                  {reading.department?.name ?? 'The whole church'}
                </dd>
              </div>

              {reading.details && (
                <div>
                  <dt className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
                    Anything else
                  </dt>
                  {/* Kept as it was typed: people write these as a few
                      lines, and running them together is a different note. */}
                  <dd className="mt-0.5 whitespace-pre-wrap break-words text-body-md text-on-surface">
                    {reading.details}
                  </dd>
                </div>
              )}

              {reading.creator && (
                <div>
                  <dt className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
                    Added by
                  </dt>
                  <dd className="mt-0.5 text-body-md text-on-surface-variant">
                    {reading.creator.first_name} {reading.creator.last_name}
                  </dd>
                </div>
              )}
            </dl>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              {(isAdmin || (!!reading.department_id && isDepartmentHead(reading.department_id))) && (
                <button
                  type="button"
                  onClick={() => {
                    const row = reading
                    setReading(null)
                    openEdit(row)
                  }}
                  className="rounded-full px-4 py-2.5 text-body-sm font-medium text-on-surface ring-1 ring-black/8 hover:ring-black/20 dark:ring-white/10"
                >
                  Edit
                </button>
              )}
              <ActionButton onClick={() => setReading(null)}>Close</ActionButton>
            </div>
          </div>
        </div>
      )}

      {dialog}
    </div>
  )
}
