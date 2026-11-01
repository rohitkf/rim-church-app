import { type FormEvent, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { usePermissions } from '../lib/usePermissions'
import { QueryState } from '../components/QueryState'
import { ActionButton, Eyebrow, Field, Overlay, PageHeader, inputClasses } from '../components/Surface'
import { fetchDepartments, fetchServices } from '../lib/queries'
import { monthGrid, monthTitle, todayIso } from '../lib/monthGrid'
import { formatServiceDay } from '../lib/sunday'
import { useErrorText } from '../lib/useErrorText'
import { TeamMark } from '../components/TeamMark'
import { LinkedText } from '../components/LinkedText'
import { webAddress } from '../lib/links'
import {
  KIND_LABEL,
  buildDiary,
  byDay,
  diaryTime,
  diaryTimes,
  type DiaryEntry,
  teamsOf,
  type DiaryEvent,
  type DiaryKind,
} from '../lib/churchDiary'
import { fetchEvents, pastDiaryEntries } from '../lib/churchEvents'
import { useDisplay } from '../lib/appSettings'
import { Select } from '../components/Select'
import { DateRangePicker } from '../components/DateRangePicker'
import { DateField, TimeField } from '../components/DateTimeFields'
import { defaultUntil, occurrences, rangeIsRepeatPeriod, repeatChoices, repeatWords, shiftRun, type RepeatRule } from '../lib/eventRepeat'
import { dayCount, formatRange } from '../lib/dateRange'
import { useConfirmAction } from '../components/ConfirmAction'
import { FinishedServices } from '../components/FinishedServices'
import { Lifespan } from '../components/Lifespan'

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

const coupleSchema = z.object({ a: z.string(), b: z.string() })

/**
 * Who is married to whom (0152), so a couple's anniversary is drawn once.
 *
 * Until that migration is on the database the call fails; the diary then
 * draws each person's anniversary on its own, as it always did, rather
 * than losing the whole page over a nicety.
 */
async function fetchCouples() {
  const { data, error } = await supabase.rpc('married_couples')
  if (error) return []
  return z.array(coupleSchema).parse(data ?? [])
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
/*
 * Repeating events are a category of their own on this page (0234): a
 * weekly prayer meeting is a different thing to look for from a one-off
 * workday. Underneath they are still events — read, edited and removed as
 * events — so the category is worked out from the entry, not stored.
 */
type Category = DiaryKind | 'repeating'

const categoryOf = (entry: DiaryEntry): Category => (entry.kind === 'event' && entry.repeats ? 'repeating' : entry.kind)

// Called Meetings, as people call them: a weekly prayer meeting, the monthly members' meeting.
const CATEGORY_LABEL: Record<Category, string> = { ...KIND_LABEL, repeating: 'Meeting' }

const PLURAL: Record<Category, string> = {
  service: 'Services',
  birthday: 'Birthdays',
  anniversary: 'Anniversaries',
  event: 'Events',
  repeating: 'Meetings',
}

const KIND_TONE: Record<Category, { dot: string; chip: string }> = {
  repeating: { dot: 'bg-accent-teal', chip: 'bg-accent-teal/15 text-accent-teal-soft' },
  birthday: { dot: 'bg-accent-orange', chip: 'bg-accent-orange/15 text-accent-orange-soft' },
  anniversary: {
    dot: 'bg-accent-indigo',
    chip: 'bg-[color-mix(in_oklab,var(--color-accent-indigo)_18%,transparent)] text-accent-indigo-soft',
  },
  service: { dot: 'bg-primary', chip: 'bg-primary/15 text-accent-blue-soft' },
  event: { dot: 'bg-accent-green', chip: 'bg-accent-green/15 text-accent-green-soft' },
}

/**
 * One line of the diary.
 *
 * The same row draws what is coming and what has been: a past event is
 * still an event somebody added, can still be corrected, and still has to
 * say whose it was. Two renderings of it would have drifted the first time
 * one of them gained a chip.
 */
function DiaryRow({
  entry,
  today,
  past = false,
  canEdit,
  onRead,
  onEdit,
  onRemove,
}: {
  entry: DiaryEntry
  today: string
  /** Over, rather than coming: changes what the run chip can truthfully say. */
  past?: boolean
  canEdit: (entry: DiaryEntry) => boolean
  onRead: (entry: DiaryEntry) => void
  onEdit: (entry: DiaryEntry) => void
  onRemove: (entry: DiaryEntry) => void
}) {
  const body = entry.couple ? (
    // A couple's anniversary is one occasion with two people in it: the
    // occasion as the title, and the two of them underneath.
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-label-sm uppercase tracking-wide ${KIND_TONE.anniversary.chip}`}
        >
          Wedding anniversary
        </span>
        {entry.detail && (
          <span className="min-w-0 break-words text-body-sm text-on-surface-variant">
            {entry.detail}
          </span>
        )}
      </div>
      <span className="min-w-0 break-words text-body-md font-medium text-on-surface">
        {entry.couple[0]} <span className="text-on-surface-variant">&amp;</span> {entry.couple[1]}
      </span>
    </div>
  ) : (
    <div className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="min-w-0 break-words text-body-md font-medium text-on-surface">
        {entry.title}
      </span>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-label-sm uppercase tracking-wide ${KIND_TONE[categoryOf(entry)].chip}`}
      >
        {CATEGORY_LABEL[categoryOf(entry)]}
      </span>
      {/* A run says which day of itself this is, or the same name on five
          days reads as five events somebody entered by mistake. Once it is
          over there is no day of it to be on, so it says how long it ran. */}
      {/* One of a repeating series says so, rather than which day of a
          run it is: "Day 3 of 29" on a weekly meeting read as one long one. */}
      {entry.repeats && (
        <span className="shrink-0 rounded-full bg-raised-strong px-2 py-0.5 font-mono text-label-sm text-on-surface-variant">
          {entry.repeats.charAt(0).toUpperCase() + entry.repeats.slice(1)}
        </span>
      )}
      {entry.span && !entry.repeats && (
        <span className="shrink-0 rounded-full bg-raised-strong px-2 py-0.5 font-mono text-label-sm text-on-surface-variant">
          {past ? `${entry.span.of} days` : `Day ${entry.span.day} of ${entry.span.of}`} ·{' '}
          {formatRange(entry.span.from, entry.span.to, today)}
        </span>
      )}
      {/* A team's colour is a dot by the words, not a bar before the
          title: the bar pushed a team's events out of line with the rest. */}
      {entry.detail && (
        <span className="min-w-0 break-words text-body-sm text-on-surface-variant">
          {entry.color && (
            <span
              aria-hidden="true"
              className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
              style={{ backgroundColor: entry.color }}
            />
          )}
          {entry.detail}
        </span>
      )}
    </div>
  )

  return (
    <li className="rounded-[var(--radius-row)] bg-surface-lowest p-3.5 hairline">
      {entry.href ? (
        <Link to={entry.href} className="block hover:opacity-90">
          {body}
        </Link>
      ) : entry.kind === 'event' ? (
        <button
          type="button"
          onClick={() => onRead(entry)}
          aria-label={`${entry.title} — see the details`}
          className="block w-full text-left hover:opacity-90"
        >
          {body}
        </button>
      ) : (
        body
      )}
      {/* Whose idea it was, said quietly — an event with no name on it
          invites "who put this here?" every time somebody reads it. */}
      {(entry.addedBy || canEdit(entry) || entry.link) && (
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-label-sm text-on-surface-faint">
            {entry.addedBy ? `Added by ${entry.addedBy}` : ''}
          </span>
          {(canEdit(entry) || entry.link) && (
            <span className="flex items-center gap-3">
              {/* Straight to the meeting, without opening the event first. */}
              {entry.link && (
                <a
                  href={entry.link}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="tap inline-flex items-center text-label-md font-medium text-accent-blue-soft hover:underline"
                >
                  Open link
                </a>
              )}
              {canEdit(entry) && (
                <>
                  <button
                    type="button"
                    onClick={() => onEdit(entry)}
                    className="tap text-label-md text-on-surface-faint hover:text-accent-blue-soft hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(entry)}
                    className="tap text-label-md text-on-surface-faint hover:text-error hover:underline"
                  >
                    Remove
                  </button>
                </>
              )}
            </span>
          )}
        </div>
      )}
    </li>
  )
}

/** Days of the diary, each saying its date once and then what is on it. */
function DiaryDays({
  days,
  today,
  past = false,
  ...row
}: {
  days: [string, DiaryEntry[]][]
  today: string
  past?: boolean
  canEdit: (entry: DiaryEntry) => boolean
  onRead: (entry: DiaryEntry) => void
  onEdit: (entry: DiaryEntry) => void
  onRemove: (entry: DiaryEntry) => void
}) {
  return (
    <div className="mt-3 flex flex-col gap-5">
      {days.map(([date, entries]) => (
        <div key={date}>
          <div className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
            {date === today ? 'Today' : formatServiceDay(date)}
          </div>
          <ul className="mt-2 flex flex-col gap-2">
            {entries.map((entry) => (
              <DiaryRow key={entry.id} entry={entry} today={today} past={past} {...row} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
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
  const { session } = useAuth()
  // Whose events somebody may add, change or remove is the church's to say
  // (Settings › Access & Privileges): a team's, or — "Everywhere" — any,
  // including the church's own, which belong to no team.
  const { can } = usePermissions()
  const everywhere = can('svc.events')
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const today = todayIso()
  const keepPastDays = useDisplay().windows.diaryPastDays
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
  /** When it finishes (0236) — on its last day, for a run. */
  const [endTime, setEndTime] = useState('')
  const [location, setLocation] = useState('')
  /** Its link (0239): the Zoom meeting, the sign-up form. */
  const [link, setLink] = useState('')
  const [details, setDetails] = useState('')
  /** Which teams it is for (0237); none is all teams. */
  const [departmentIds, setDepartmentIds] = useState<string[]>([])
  /** How a new event repeats (0234), and its last date; '' for a one-off. */
  const [repeat, setRepeat] = useState<RepeatRule | ''>('')
  const [until, setUntil] = useState('')
  /** No end date (0235): a series row keeps it going, six months ahead. */
  const [noEnd, setNoEnd] = useState(false)
  /** A range picked under When for a repeat, taken as how long it repeats for. */
  const [rangeAsUntil, setRangeAsUntil] = useState(false)
  /** Changing one of a series: just it, or it and every one after. */
  const [scope, setScope] = useState<'one' | 'following'>('one')
  /** A series event somebody asked to remove: which ones. */
  const [removing, setRemoving] = useState<DiaryEvent | null>(null)

  const { ask, dialog } = useConfirmAction()
  // One day, an end at or before the start: the database refuses it (0236), so the form says so first.
  const linkTyped = webAddress(link)
  const badLink = linkTyped === false
  const endsBeforeItStarts = !!startTime && !!endTime && !(endDate && endDate > date) && endTime <= startTime

  const peopleQuery = useQuery({ queryKey: ['diary-people'], queryFn: fetchPeople })
  const couplesQuery = useQuery({ queryKey: ['married-couples'], queryFn: fetchCouples })
  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: fetchServices })
  const eventsQuery = useQuery({ queryKey: ['church-events'], queryFn: fetchEvents })
  // Series that go on with no end date (0235), still running.
  const openSeriesQuery = useQuery({
    queryKey: ['church-events', 'open-series'],
    queryFn: async () => {
      const { data, error } = await supabase.from('church_event_series').select('id').is('stopped_at', null)
      if (error) throw error
      return new Set((data ?? []).map((r: { id: string }) => r.id))
    },
  })
  const isOpenSeries = (seriesId: string | null | undefined) => !!seriesId && !!openSeriesQuery.data?.has(seriesId)
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })

  // Which teams this person may file an event under. Somebody who reaches
  // everywhere may use any, including none — a church event belongs to the church.
  const myTeams = useMemo(
    () => (departmentsQuery.data ?? []).filter((d) => can('svc.events', { departmentId: d.id })),
    [departmentsQuery.data, can],
  )
  const canAdd = everywhere || myTeams.length > 0
  // Changing one is for whoever may add events for every team on it (0237).
  const mayChange = (row: Pick<DiaryEvent, 'department_id' | 'department_ids'>) => {
    const ids = row.department_ids?.length ? row.department_ids : row.department_id ? [row.department_id] : []
    return ids.length === 0
      ? can('svc.events', { departmentId: null })
      : ids.every((departmentId) => can('svc.events', { departmentId }))
  }
  // Somebody who may not add for the whole church has to say whose it is.
  const noTeamChosen = !everywhere && departmentIds.length === 0

  const diary = useMemo(
    () =>
      buildDiary({
        people: peopleQuery.data ?? [],
        couples: couplesQuery.data ?? [],
        services: servicesQuery.data ?? [],
        events: eventsQuery.data ?? [],
        today,
        // The calendar dots the days something was on as well as the days
        // something is on: a month you can page back into that shows
        // nothing ever happened in it is a calendar lying by omission.
        includePast: true,
      }),
    [peopleQuery.data, couplesQuery.data, servicesQuery.data, eventsQuery.data, today],
  )

  // One kind only, when somebody asks (?show=birthday): the calendar's
  // dots and both lists follow it, and the choice lives in the address so
  // a link to "the birthdays" opens on the birthdays.
  const [params, setParams] = useSearchParams()
  const showParam = params.get('show')
  // The address says ?show=meetings; inside, the category is 'repeating'.
  const asParam = (c: Category) => (c === 'repeating' ? 'meetings' : c)
  const fromParam = (p: string | null): Category | null =>
    p === 'meetings' ? 'repeating' : p && p in CATEGORY_LABEL && p !== 'repeating' ? (p as Category) : null
  const show = fromParam(showParam)
  const choose = (kind: Category | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (kind) next.set('show', asParam(kind))
        else next.delete('show')
        return next
      },
      { replace: true },
    )
  const shown = useMemo(() => (show ? diary.filter((entry) => categoryOf(entry) === show) : diary), [diary, show])

  const byDate = useMemo(() => {
    const map = new Map<string, DiaryEntry[]>()
    for (const entry of shown) map.set(entry.date, [...(map.get(entry.date) ?? []), entry])
    return map
  }, [shown])

  const days = useMemo(() => byDay(shown.filter((entry) => entry.date >= today)), [shown, today])

  /*
   * What has been, newest first.
   *
   * Drawn from the rows rather than from the diary above, because a run
   * that is over is one thing that happened and not seven: the diary
   * spreads it across every day it covered so the calendar can dot them,
   * and a list that did the same would read as seven identical events.
   */
  // Only events have a past here, so another kind on its own shows none.
  const pastDays = useMemo(
    () =>
      show && show !== 'event' && show !== 'repeating'
        ? []
        : byDay(
            pastDiaryEntries(eventsQuery.data ?? [], today, keepPastDays).filter((e) => !show || categoryOf(e) === show),
          ).reverse(),
    [eventsQuery.data, today, keepPastDays, show],
  )

  const saveEvent = useMutation({
    mutationFn: async () => {
      const fields = {
        title: title.trim(),
        event_date: date,
        ends_on: endDate,
        start_time: startTime || null,
        end_time: endTime || null,
        location: location.trim() || null,
        link: linkTyped || null,
        details: details.trim() || null,
        department_id: departmentIds[0] ?? null,
        department_ids: departmentIds,
      }
      // `created_by` belongs to whoever put it in the diary and is not
      // rewritten by whoever corrects it later: the name on the row is a
      // fact about who decided, not about who last touched a field.
      const runDays = endDate && endDate > date ? Math.round((Date.parse(endDate) - Date.parse(date)) / 86_400_000) : 0
      const dayBefore = (iso: string) => new Date(Date.parse(iso) - 86_400_000).toISOString().slice(0, 10)
      if (!editing && repeat && noEnd) {
        // No end date (0235): the series says what each time is, and the
        // database makes them six months ahead and keeps them that far.
        const id = crypto.randomUUID()
        const { error: seriesError } = await supabase.from('church_event_series').insert({
          id,
          title: fields.title,
          details: fields.details,
          start_time: fields.start_time,
          end_time: fields.end_time,
          location: fields.location,
          link: fields.link,
          department_id: fields.department_id,
          department_ids: fields.department_ids,
          created_by: session!.user.id,
          anchor_date: date,
          run_days: runDays,
          rule: repeat,
          generated_through: dayBefore(date),
        })
        if (seriesError) throw seriesError
        const { error: extendError } = await supabase.rpc('extend_event_series', { only_series: id })
        if (extendError) throw extendError
        return
      }
      if (!editing && repeat) {
        // One row a time it happens (0234), joined by the series.
        const series = crypto.randomUUID()
        const rows = occurrences(date, repeat, until || defaultUntil(date, repeat)).map((d) => ({
          ...fields,
          ...shiftRun(date, endDate, d),
          series_id: series,
          repeat_rule: repeat,
          created_by: session!.user.id,
        }))
        const { error: writeError } = await supabase.from('church_events').insert(rows)
        if (writeError) throw writeError
        return
      }
      if (editing && editing.series_id && scope === 'following') {
        // This one and every one after it: the same words on each, and a
        // moved date moves them all by the same number of days.
        const later = (eventsQuery.data ?? []).filter(
          (ev) => ev.series_id === editing.series_id && ev.event_date >= editing.event_date,
        )
        const moved = Math.round((Date.parse(date) - Date.parse(editing.event_date)) / 86_400_000)
        const { event_date: _d, ends_on: _e, ...same } = fields
        void _d
        void _e
        const results = await Promise.all(
          later.map((ev) => {
            const start = new Date(Date.parse(ev.event_date) + moved * 86_400_000).toISOString().slice(0, 10)
            const run = shiftRun(editing.event_date, endDate, start)
            return supabase.from('church_events').update({ ...same, ...run }).eq('id', ev.id)
          }),
        )
        const failed = results.find((r) => r.error)
        if (failed?.error) throw failed.error
        const seriesId = editing.series_id
        if (isOpenSeries(seriesId)) {
          // What it makes from now on says the same.
          const { error: seriesError } = await supabase
            .from('church_event_series')
            .update({ ...same, anchor_date: date, run_days: runDays })
            .eq('id', seriesId)
          if (seriesError) throw seriesError
        } else if (noEnd) {
          const lastMade = later.map((ev) => ev.event_date).sort().pop() ?? editing.event_date
          const shifted = new Date(Date.parse(lastMade) + moved * 86_400_000).toISOString().slice(0, 10)
          const { error: seriesError } = await supabase.from('church_event_series').insert({
            id: seriesId,
            ...same,
            created_by: session!.user.id,
            anchor_date: date,
            run_days: runDays,
            rule: editing.repeat_rule,
            generated_through: shifted,
          })
          if (seriesError) throw seriesError
        }
        if (isOpenSeries(seriesId) || noEnd) {
          const { error: extendError } = await supabase.rpc('extend_event_series', { only_series: seriesId })
          if (extendError) throw extendError
        }
        return
      }
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
    mutationFn: async (target: string | { series: string; from: string }) => {
      const { error: deleteError } =
        typeof target === 'string'
          ? await supabase.from('church_events').delete().eq('id', target)
          : // This one and every one after it in the series.
            await supabase.from('church_events').delete().eq('series_id', target.series).gte('event_date', target.from)
      if (deleteError) throw deleteError
      // And an open-ended one makes no more (0235).
      if (typeof target !== 'string' && isOpenSeries(target.series)) {
        const { error: stopError } = await supabase
          .from('church_event_series')
          .update({ stopped_at: new Date().toISOString() })
          .eq('id', target.series)
        if (stopError) throw stopError
      }
    },
    onSuccess: () => {
      setRemoving(null)
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['church-events'] })
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not remove that event.')),
  })

  /*
   * A repeat with a range under When longer than the repeat itself — a
   * weekly meeting "from 5 Oct to 2 Nov" — means it repeats over that range,
   * not that each meeting lasts four weeks. So the range's end becomes the
   * Until and each time is one day; a weekend camp every month keeps its
   * two days.
   */
  function foldRange(from: string, to: string | null, rule: RepeatRule | '') {
    if (!rule || !rangeIsRepeatPeriod(from, to, rule)) return
    setUntil(to ?? '')
    setEndDate(null)
    setNoEnd(false)
    setRangeAsUntil(true)
  }

  function closeForm() {
    setAdding(false)
    setEditing(null)
    setTitle(''); setDate(''); setEndDate(null); setStartTime(''); setEndTime('')
    setLocation(''); setLink(''); setDetails(''); setDepartmentIds([])
    setRepeat(''); setUntil(''); setScope('one'); setNoEnd(false); setRangeAsUntil(false)
  }

  // Opening the form with a day already chosen. Tapping the 14th is
  // somebody saying which day they mean; asking again in the form is the
  // app not listening.
  function openAdd(on?: string) {
    closeForm()
    setDate(on ?? today)
    // Somebody who may only add their own team's events starts on their
    // team, not on "the whole church" they are not offered.
    if (!everywhere && myTeams[0]) setDepartmentIds([myTeams[0].id])
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
    setEndTime(row.end_time ? row.end_time.slice(0, 5) : '')
    setLocation(row.location ?? '')
    setLink(row.link ?? '')
    setDetails(row.details ?? '')
    setDepartmentIds(row.department_ids?.length ? row.department_ids : row.department_id ? [row.department_id] : [])
    setAdding(true)
  }

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !date || noTeamChosen || badLink) return
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
    return mayChange(row)
  }

  /** The event row an entry was drawn from, when it was drawn from one. */
  const rowOf = (entry: DiaryEntry) => {
    const id = eventIdOf(entry)
    return id ? ((eventsQuery.data ?? []).find((ev) => ev.id === id) ?? null) : null
  }

  // What a row can do, in one object: the same four wherever it is drawn.
  const rowActions = {
    canEdit: mayEdit,
    onRead: (entry: DiaryEntry) => {
      const row = rowOf(entry)
      if (row) setReading(row)
    },
    onEdit: (entry: DiaryEntry) => {
      const row = rowOf(entry)
      if (row) openEdit(row)
    },
    onRemove: (entry: DiaryEntry) => {
      const row = rowOf(entry)
      // One of a series: which ones is a question of its own.
      if (row?.series_id) return setRemoving(row)
      return ask({
        title: `Remove ${entry.title} from the diary?`,
        body: 'It disappears from the calendar for everybody.',
        confirmLabel: 'Remove',
        onConfirm: () => {
          const id = eventIdOf(entry)
          if (id) removeEvent.mutate(id)
        },
      })
    },
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
      {/* Not "what is coming up" any more: the page keeps what has been as
          well, and an eyebrow that said otherwise would be the page
          describing a version of itself that no longer exists. */}
      <PageHeader
        eyebrow="The church diary"
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
      <Lifespan page="events" className="mb-4" />

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
                  d === 'Sun' ? 'text-accent-blue-soft' : 'text-on-surface-variant'
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
                      className="absolute inset-0 z-0 rounded-sm transition-colors duration-200 hover:bg-surface-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary"
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
                    {[...new Set(onThisDay.map(categoryOf))].map((kind) => (
                      <span
                        key={kind}
                        title={CATEGORY_LABEL[kind]}
                        className={`h-1.5 w-1.5 rounded-full ${KIND_TONE[kind].dot}`}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* The legend is the filter: each kind's dot and name, pressed
              to show that kind alone, and Everything to show them all. */}
          <div role="group" aria-label="Show" className="mt-4 flex flex-wrap gap-1.5">
            {([null, 'service', 'birthday', 'anniversary', 'event', 'repeating'] as (Category | null)[]).map((kind) => {
              const on = show === kind
              return (
                <button
                  key={kind ?? 'all'}
                  type="button"
                  aria-pressed={on}
                  onClick={() => choose(kind)}
                  className={`tap inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-label-md transition-colors duration-200 ${
                    on ? 'bg-primary text-on-primary' : 'bg-raised text-on-surface-variant hairline hover:text-on-surface'
                  }`}
                >
                  {kind && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${KIND_TONE[kind].dot}`} />}
                  {kind ? PLURAL[kind] : 'Everything'}
                </button>
              )
            })}
          </div>
        </section>

        {days.length === 0 && pastDays.length === 0 ? (
          <p className="mt-6 text-body-sm text-on-surface-variant">
            {show ? `No ${PLURAL[show].toLowerCase()} coming up.` : 'Nothing in the diary yet.'}
          </p>
        ) : (
          <>
            {days.length > 0 && (
              <section className="mt-8">
                <h2 className="text-headline-md">Coming up</h2>
                <DiaryDays days={days} today={today} {...rowActions} />
              </section>
            )}

            {/*
              What has already happened, newest first.
              An event is the only thing in this diary that leaves no other
              record — a birthday comes round again and a service has the
              planner — so dropping it on the stroke of midnight meant the
              church had no way to say what it had done.
            */}
            {pastDays.length > 0 && (
              /* Folded, like every page's finished services: the record
                 is a real question — "when was the last workday?" — but
                 never the one this page is opened for. */
              <FinishedServices
                label="Past events"
                count={pastDays.reduce((n, [, entries]) => n + entries.length, 0)}
                id="past-events"
                aside={
                  <span className="text-label-md text-on-surface-faint">
                    The last 12 months, most recent first
                  </span>
                }
              >
                <DiaryDays days={pastDays} today={today} past {...rowActions} />
              </FinishedServices>
            )}
          </>
        )}
      </QueryState>

      {adding && (
        <Overlay onDismiss={closeForm} label={editing ? 'Edit this event' : 'Add an event'}>
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
                    if (!editing) foldRange(from, to, repeat)
                  }}
                />
              </Field>
              {/* Repeats (0234): only when adding — an existing one-off
                  stays one, and a series is changed one or onward. */}
              {!editing && (
                <Field label="Repeats" className="sm:col-span-2">
                  <Select
                    value={repeat}
                    onChange={(v) => {
                      setRepeat(v as RepeatRule | '')
                      if (v) setUntil(defaultUntil(date || today, v as RepeatRule))
                      foldRange(date || today, endDate, v as RepeatRule | '')
                    }}
                    options={repeatChoices(date || today)}
                    aria-label="Repeats"
                  />
                </Field>
              )}
              {!editing && repeat && (
                <FieldGroup label="Until" className="sm:col-span-2">
                  {rangeAsUntil && !noEnd && (
                    <p className="mb-1 text-label-md text-on-surface-variant">
                      The dates under When are taken as how long it repeats for: each one is a single day.
                    </p>
                  )}
                  <NoEndToggle checked={noEnd} onChange={setNoEnd} />
                  {noEnd ? (
                    <p className="mt-1 text-label-md text-on-surface-variant">
                      It goes on until you stop it. The next six months are in the diary, and it keeps that far ahead.
                    </p>
                  ) : (
                    <>
                      <DateField value={until} onChange={(v) => setUntil(v ?? '')} min={date || today} label="Repeats until" />
                      <p className="mt-1 text-label-md text-on-surface-variant">
                        {(() => {
                          const n = occurrences(date || today, repeat, until || defaultUntil(date || today, repeat)).length
                          return `${n} ${n === 1 ? 'event' : 'events'}, each its own in the diary.`
                        })()}
                      </p>
                    </>
                  )}
                </FieldGroup>
              )}
              {editing?.series_id && (
                <FieldGroup label="Change" className="sm:col-span-2">
                  <div role="radiogroup" aria-label="Which to change" className="flex flex-col gap-1.5 text-body-sm text-on-surface">
                    {(
                      [
                        ['one', 'Only this one'],
                        ['following', 'This one and every one after it'],
                      ] as const
                    ).map(([value, label]) => (
                      <label key={value} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="event-scope"
                          checked={scope === value}
                          onChange={() => setScope(value)}
                          className="accent-[var(--color-primary)]"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  {scope === 'following' && !isOpenSeries(editing.series_id) && (
                    <div className="mt-2">
                      <NoEndToggle checked={noEnd} onChange={setNoEnd} label="And keep it going, with no end date" />
                    </div>
                  )}
                  {isOpenSeries(editing.series_id) && (
                    <p className="mt-2 text-label-md text-on-surface-variant">
                      It has no end date. Changing this one and every one after it also changes the ones still to be made.
                    </p>
                  )}
                </FieldGroup>
              )}
              <Field label="Start time (optional)">
                <TimeField value={startTime} onChange={setStartTime} label="Start time" clearable />
              </Field>
              <Field label={endDate && endDate > date ? 'End time on the last day (optional)' : 'End time (optional)'}>
                <TimeField value={endTime} onChange={setEndTime} label="End time" clearable />
              </Field>
              {endsBeforeItStarts && (
                <p role="alert" className="text-body-sm text-accent-red-soft sm:col-span-2">
                  It ends before it starts. Change one of the times.
                </p>
              )}
              <Field label="Where (optional)" className="sm:col-span-2">
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Main hall"
                  className={inputClasses}
                />
              </Field>
              <Field label="Link (optional)" className="sm:col-span-2">
                <input
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  type="url"
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  placeholder="https://zoom.us/j/…"
                  aria-invalid={badLink || undefined}
                  className={inputClasses}
                />
              </Field>
              {badLink && (
                <p role="alert" className="-mt-2 text-body-sm text-accent-red-soft sm:col-span-2">
                  That isn’t a web address. It should start with https://
                </p>
              )}
              <FieldGroup label="Who is it for" className="sm:col-span-2">
                <TeamChecklist
                  teams={myTeams}
                  // The teams it already has that this person can't change stay on it.
                  extra={departmentIds.filter((id) => !myTeams.some((d) => d.id === id))}
                  allNames={departmentsQuery.data ?? []}
                  chosen={departmentIds}
                  onChange={setDepartmentIds}
                  allTeams={everywhere}
                />
                {/* Who sees it, too (0238). */}
                <p className="text-label-md text-on-surface-variant">
                  {noTeamChosen
                    ? 'Tick at least one team.'
                    : departmentIds.length === 0
                      ? 'Everybody sees it.'
                      : 'Only people on the teams ticked see it, with their heads, Admins and you.'}
                </p>
              </FieldGroup>
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
                disabled={saveEvent.isPending || !title.trim() || !date || endsBeforeItStarts || noTeamChosen || badLink}
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
        </Overlay>
      )}

      {/*
        An event, read rather than scanned.

        The row in the list is one line on purpose — twenty of them have to
        be scannable — so everything else an event carries had nowhere to
        be seen: where it is, whose it is, and whatever was typed under
        "anything else", which is usually the part that matters.
       */}
      {reading && (
        <Overlay closable={false} onDismiss={() => setReading(null)} label={reading.title}>
          <div className="max-h-full w-full max-w-md overflow-y-auto rounded-[var(--radius-shell)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12">
            <div className="flex flex-wrap items-center gap-2">
              {reading.department?.color && <TeamMark color={reading.department.color} />}
              <span
                className={`rounded-full px-2 py-0.5 font-mono text-label-sm uppercase tracking-wide ${KIND_TONE[reading.repeat_rule ? 'repeating' : 'event'].chip}`}
              >
                {CATEGORY_LABEL[reading.repeat_rule ? 'repeating' : 'event']}
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
                  {repeatWords(reading.event_date, reading.repeat_rule) && (
                    <span className="block text-label-md text-on-surface-variant">
                      {repeatWords(reading.event_date, reading.repeat_rule)}
                      {isOpenSeries(reading.series_id) && ', with no end date'}
                    </span>
                  )}
                  {reading.ends_on && reading.ends_on > reading.event_date && (
                    <span className="text-on-surface-variant">
                      {' '}
                      · {dayCount(reading.event_date, reading.ends_on)} days
                    </span>
                  )}
                  {diaryTimes(reading.start_time, reading.end_time) && (
                    <span className="text-on-surface-variant">
                      {' '}
                      · {reading.end_time ? diaryTimes(reading.start_time, reading.end_time) : `from ${diaryTime(reading.start_time)}`}
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
                    <LinkedText text={reading.location} />
                  </dd>
                </div>
              )}

              <div>
                <dt className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
                  {reading.teams && reading.teams.length > 1 && !reading.allTeams ? 'Teams' : 'Whose event'}
                </dt>
                <dd className="mt-0.5 text-body-md text-on-surface">
                  {teamsOf(reading) ?? 'Whole church'}
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
                    {/* A Zoom link or a sign-up form, tappable (lib/links). */}
                    <LinkedText text={reading.details} />
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

            {reading.link && (
              <a
                href={reading.link}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-body-sm font-semibold text-on-primary transition-transform active:scale-[0.97]"
              >
                Open link <span aria-hidden="true">↗</span>
              </a>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              {mayChange(reading) && (
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
        </Overlay>
      )}

      {removing && (
        <Overlay onDismiss={() => setRemoving(null)} label={`Remove ${removing.title}?`}>
          <div className="w-full max-w-sm rounded-[var(--radius-card)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)]">
            <h2 className="text-headline-md">Remove {removing.title}?</h2>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              It repeats. Take away just {formatServiceDay(removing.event_date)}, or this one and every one after it. Earlier ones stay.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <ActionButton tone="danger" onClick={() => removeEvent.mutate(removing.id)} disabled={removeEvent.isPending}>
                Only this one
              </ActionButton>
              <ActionButton
                tone="danger"
                onClick={() => removeEvent.mutate({ series: removing.series_id!, from: removing.event_date })}
                disabled={removeEvent.isPending}
              >
                This one and every one after it
              </ActionButton>
              <ActionButton tone="quiet" onClick={() => setRemoving(null)} disabled={removeEvent.isPending}>
                Keep them
              </ActionButton>
            </div>
          </div>
        </Overlay>
      )}
      {dialog}
    </div>
  )
}

/** "No end date" — a repeating event that goes on until somebody stops it (0235). */
function NoEndToggle({
  checked,
  onChange,
  label = 'No end date',
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label?: string
}) {
  return (
    <label className="mb-2 flex items-center gap-2 text-body-sm text-on-surface">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[var(--color-primary)]"
      />
      {label}
    </label>
  )
}

/**
 * Field's look for a group that holds its own checkboxes or radios: Field
 * is a <label>, and one wrapped round them would toggle the first of them
 * whenever its heading was tapped.
 */
function FieldGroup({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className={`flex flex-col gap-2 ${className}`}>
      <Eyebrow>{label}</Eyebrow>
      {children}
    </div>
  )
}

/**
 * Who an event is for (0237): the whole church (no team), every team, or
 * any of them ticked. Whole church and All teams are offered only to
 * whoever may add events for the whole church; All teams is a shortcut
 * that ticks every team, and Whole church is ticked exactly when none is.
 */
function TeamChecklist({
  teams,
  extra,
  allNames,
  chosen,
  onChange,
  allTeams,
}: {
  teams: { id: string; name: string }[]
  extra: string[]
  allNames: { id: string; name: string }[]
  chosen: string[]
  onChange: (next: string[]) => void
  allTeams: boolean
}) {
  const toggle = (id: string) =>
    onChange(chosen.includes(id) ? chosen.filter((d) => d !== id) : [...chosen, id])
  const box = 'h-4 w-4 shrink-0 accent-[var(--color-primary)]'
  const everyTeam = teams.length > 1 && teams.every((d) => chosen.includes(d.id))
  return (
    <div className="flex flex-col gap-2">
      {allTeams && (
        <>
          <label className="flex items-center gap-2 text-body-sm font-medium text-on-surface">
            <input type="checkbox" checked={chosen.length === 0} onChange={() => onChange([])} className={box} />
            Whole church
          </label>
          {teams.length > 1 && (
            <label className="flex items-center gap-2 text-body-sm font-medium text-on-surface">
              <input
                type="checkbox"
                checked={everyTeam}
                onChange={() => onChange(everyTeam ? [] : teams.map((d) => d.id))}
                className={box}
              />
              All teams
            </label>
          )}
        </>
      )}
      <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
        {teams.map((d) => (
          <label key={d.id} className="flex min-w-0 items-center gap-2 text-body-sm text-on-surface">
            <input type="checkbox" checked={chosen.includes(d.id)} onChange={() => toggle(d.id)} className={box} />
            <span className="break-words">{d.name}</span>
          </label>
        ))}
        {extra.map((id) => (
          <label key={id} className="flex min-w-0 items-center gap-2 text-body-sm text-on-surface-variant">
            <input type="checkbox" checked disabled className={box} />
            <span className="break-words">{allNames.find((d) => d.id === id)?.name ?? 'Another team'}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
