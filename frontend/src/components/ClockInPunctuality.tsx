import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAppSettings } from '../lib/appSettings'
import { churchClock, fetchArrivals } from '../lib/clockIn'
import {
  againstCallWords,
  punctualityByPerson,
  recordWords,
  typicalWords,
  windowStart,
  windowWords,
  type PersonRecord,
} from '../lib/clockInPunctuality'
import { todayIso } from '../lib/monthGrid'
import { ArrivalChart, ArrivalStrip } from './ArrivalChart'
import { Chevron } from './Collapsible'
import { QueryState } from './QueryState'

/** How many people are listed before "Show everybody". */
const FIRST = 12

/** The same key lib/liveTables names for clock_ins, so a new clock-in redraws this. */
const ARRIVALS_KEY = ['clock-in-arrivals'] as const

/**
 * How each person's clock-ins have gone over the weeks kept (0280).
 *
 * The Owner asked to see, person by person, their clock-in times over the
 * past four weeks. This is that: everybody who has clocked in inside the
 * window the church keeps (Settings › Clock in, four weeks out of the
 * box), each with how many clock-ins, how many were late, what is usual
 * for them, and a strip of the arrivals themselves. Opening a person
 * draws the chart and lists every day.
 *
 * Whoever is late most often comes first: that is who this is opened to
 * find. It reads the same rows the page already may (the watchers' read
 * policy), and only the time and the call time — where somebody was is
 * the day's list's to show.
 */
export function ClockInPunctuality() {
  const settings = useAppSettings()
  const days = settings.clock_in_retention_days
  const lateAfter = settings.clock_in_late_minutes
  const since = windowStart(todayIso(), days)
  const query = useQuery({ queryKey: [...ARRIVALS_KEY, since], queryFn: () => fetchArrivals(since) })
  const [open, setOpen] = useState<string | null>(null)
  const [all, setAll] = useState(false)

  const people = punctualityByPerson(query.data ?? [], lateAfter)
  const shown = all ? people : people.slice(0, FIRST)
  const everLate = people.filter((p) => p.late > 0).length

  return (
    <QueryState
      isLoading={query.isLoading}
      error={query.error}
      isEmpty={people.length === 0}
      emptyMessage={`Nobody has clocked in in the last ${windowWords(days)}.`}
    >
      <p className="text-body-sm text-on-surface-variant">
        {people.length} {people.length === 1 ? 'person has' : 'people have'} clocked in over the last {windowWords(days)}
        {everLate > 0 ? `; ${everLate} ${everLate === 1 ? 'was' : 'were'} late at least once` : '; nobody was late'}. Late is{' '}
        {lateAfter} min or more after that person&rsquo;s call time. Anything older is deleted.
      </p>
      <ul aria-label="Arrivals, person by person" className="mt-3 flex flex-col divide-y divide-border-subtle">
        {shown.map((person) => (
          <Person
            key={person.userId}
            person={person}
            open={open === person.userId}
            onToggle={() => setOpen(open === person.userId ? null : person.userId)}
            lateAfter={lateAfter}
            timeZone={settings.timezone}
          />
        ))}
      </ul>
      {!all && people.length > FIRST && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="tap mt-3 rounded-full px-4 py-2 text-body-sm font-medium text-accent-blue-soft hairline hover:text-on-surface"
        >
          Show everybody ({people.length})
        </button>
      )}
    </QueryState>
  )
}

function Person({
  person,
  open,
  onToggle,
  lateAfter,
  timeZone,
}: {
  person: PersonRecord
  open: boolean
  onToggle: () => void
  lateAfter: number
  timeZone: string
}) {
  const usual = typicalWords(person.typical)
  const panel = `arrivals-${person.userId}`
  return (
    <li className="py-2.5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={onToggle}
        className="tap flex w-full items-center gap-3 rounded-[var(--radius-row)] text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block break-words text-body-sm font-medium text-on-surface">{person.name}</span>
          <span className="block text-label-md text-on-surface-variant">
            {/* Late said in words and in colour, never in colour alone. */}
            <span className={person.late > 0 ? 'font-semibold text-error' : ''}>{recordWords(person)}</span>
            {usual && <span> · {usual}</span>}
          </span>
        </span>
        <ArrivalStrip arrivals={person.arrivals} />
        <Chevron open={open} />
      </button>
      {open && (
        <div id={panel} className="mt-3 flex flex-col gap-3">
          <ArrivalChart arrivals={person.arrivals} lateAfter={lateAfter} timeZone={timeZone} name={person.name} />
          {/* The same figures as a list: every day, nothing left to a hover. */}
          <details className="rounded-[var(--radius-row)] bg-surface-lowest/60 px-3 py-2 hairline">
            <summary className="cursor-pointer text-label-md font-medium text-on-surface-variant">
              Every clock-in ({person.count})
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[18rem] text-left text-body-sm">
                <thead className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
                  <tr>
                    <th scope="col" className="py-1 pr-3 font-normal">Day</th>
                    <th scope="col" className="py-1 pr-3 font-normal">Call</th>
                    <th scope="col" className="py-1 pr-3 font-normal">Clocked in</th>
                    <th scope="col" className="py-1 font-normal">Against call</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {[...person.arrivals].reverse().map((a) => (
                    <tr key={`${a.on_date}-${a.clocked_at}`}>
                      <th scope="row" className="whitespace-nowrap py-1.5 pr-3 font-normal text-on-surface">
                        {new Date(`${a.on_date}T12:00:00Z`).toLocaleDateString(undefined, {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          timeZone: 'UTC',
                        })}
                      </th>
                      <td className="py-1.5 pr-3 font-mono tabular-nums text-on-surface-variant">
                        {a.call_at ? churchClock(a.call_at, timeZone) : '–'}
                      </td>
                      <td className="py-1.5 pr-3 font-mono tabular-nums text-on-surface">{churchClock(a.clocked_at, timeZone)}</td>
                      <td className={`py-1.5 ${a.late ? 'font-semibold text-error' : 'text-on-surface-variant'}`}>
                        {againstCallWords(a.minutes)}
                        {a.late && ' — late'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </li>
  )
}
