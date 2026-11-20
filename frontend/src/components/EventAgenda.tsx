import { formatDateValue, formatTimeValue } from '../lib/dateTimeFormat'
import { agendaDays, type PublicAgendaItem, type PublicDate } from '../lib/registrations'

/*
 * An event's agenda, as it is read (0303): the running order of the day,
 * the way the Service Planner sets out a service — the time down the left
 * where there is one, what happens beside it, and a line of detail under
 * that.
 *
 * A time is the venue's own clock, said as it was written: 09:30 is 09:30
 * whoever is reading and from wherever, so nothing here is converted to
 * the reader's time zone. Items with no time keep the column, so the
 * titles still line up down the page.
 */

/** The day a block of the agenda is on, in words: its date, and its label when it has one. */
function dayWords(date: PublicDate): string {
  const day = formatDateValue(localDay(date.starts_at))
  return date.label ? `${day} · ${date.label}` : day
}

/** The calendar day a moment falls on, in the reader's clock — the same day `whenWords` names for it. */
function localDay(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function EventAgenda({
  agenda,
  dates,
  className = '',
}: {
  agenda: readonly PublicAgendaItem[]
  dates: readonly PublicDate[]
  className?: string
}) {
  const days = agendaDays(agenda, dates)
  if (days.length === 0) return null
  // Whether any item anywhere has a time: without one the column is not drawn at all.
  const timed = agenda.some((a) => a.starts)
  // A heading only where there is more than one block to tell apart.
  const headed = days.some((d) => d.date !== null)

  return (
    <div className={className}>
      <p className="font-mono text-label-sm text-on-surface-faint">Agenda</p>
      <div className="mt-2 flex flex-col gap-5">
        {days.map((day) => (
          <section key={day.date?.id ?? 'each-day'} aria-label={day.date ? `Agenda for ${dayWords(day.date)}` : 'Agenda'}>
            {headed && (
              <h3 className="mb-2 text-body-md font-semibold text-on-surface">{day.date ? dayWords(day.date) : 'Each day'}</h3>
            )}
            <ol className="flex flex-col divide-y divide-border-subtle rounded-[var(--radius-card)] bg-surface-lowest hairline">
              {day.items.map((item) => (
                <li key={item.id} className="flex items-baseline gap-3 px-4 py-3 sm:gap-4">
                  {timed && (
                    <span className="w-[5.25rem] shrink-0 font-mono text-label-md tabular text-on-surface-variant sm:w-44">
                      {/* On a phone the end goes under the start, so the title keeps its width. */}
                      {item.starts && (
                        <>
                          <time className="block sm:inline">{formatTimeValue(item.starts)}</time>
                          {item.ends && (
                            <>
                              <span className="hidden sm:inline"> – </span>
                              <time className="block text-on-surface-faint sm:inline sm:text-on-surface-variant">
                                <span className="sr-only sm:hidden">to </span>
                                {formatTimeValue(item.ends)}
                              </time>
                            </>
                          )}
                        </>
                      )}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-body-md font-medium text-on-surface">{item.title}</span>
                    {item.details && (
                      <span className="mt-0.5 block whitespace-pre-line break-words text-body-sm text-on-surface-variant">{item.details}</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  )
}
