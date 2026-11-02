import { Link } from 'react-router-dom'
import type { EventToday } from '../lib/churchEvents'
import { linkLabel } from '../lib/churchDiary'

/**
 * What is on today, across the top of the dashboard.
 *
 * Everything else on this page is a service: weekly, expected, and quiet
 * about it. An event is the opposite — it happens once, half the church
 * has forgotten it, and the morning it lands is the last useful moment to
 * be told. So it goes above the services and wears a night sky, which is
 * the one thing on the page that cannot be mistaken for another card.
 *
 * Absent on every other day. A banner that says "no events today" is a
 * banner that trains people to skip the place events appear.
 */
export function TodayEvents({
  events,
  className = '',
}: {
  events: EventToday[]
  className?: string
}) {
  if (events.length === 0) return null

  return (
    <section
      aria-label={events.length === 1 ? 'On today' : `${events.length} things on today`}
      className={`galaxy rounded-[var(--radius-tile)] p-6 shadow-[var(--shadow-lifted)] sm:p-7 ${className}`}
    >
      {/* The sky. Three layers, no pointer, no meaning — see index.css. */}
      <span aria-hidden="true" className="galaxy-glow" />
      <span aria-hidden="true" className="galaxy-stars" />
      <span aria-hidden="true" className="galaxy-stars galaxy-stars-far" />

      {/* Everything readable rides above the sky and carries its own
          colour: the card is dark in a light room too. */}
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <span className="font-mono text-eyebrow uppercase text-white/60">
            {events.length === 1 ? 'On today' : `On today · ${events.length}`}
          </span>
          <Link
            to="/events"
            className="tap inline-flex items-center gap-1 text-label-md text-white/80 hover:text-white"
          >
            Church diary <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>

        <ul className="mt-3 flex flex-col gap-5">
          {events.map((event) => {
            const line = [event.time, event.location, event.team].filter(Boolean).join(' · ')
            return (
              <li key={event.id}>
                <h2 className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-headline-lg text-white">
                  {event.color && (
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: event.color }}
                    />
                  )}
                  {event.title}
                  {/* Day three of a conference is not a third conference. */}
                  {event.day && (
                    <span className="rounded-full bg-white/15 px-2.5 py-1 font-mono text-label-sm uppercase tracking-wide text-white/85">
                      Day {event.day.nth} of {event.day.of}
                    </span>
                  )}
                </h2>
                {line && <p className="mt-1.5 text-body-md text-white/75">{line}</p>}
                {event.details && (
                  <p className="mt-1.5 max-w-prose whitespace-pre-line break-words text-body-sm text-white/60">
                    {event.details}
                  </p>
                )}
                {/* Straight to the meeting, and to the event itself (its card,
                    open, on the Events page). */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {event.links.map((link, i) => (
                    <a
                      key={`${link.url}-${i}`}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="tap inline-flex items-center gap-1.5 rounded-full bg-white px-4 text-label-md font-semibold text-[#14143a] transition-transform active:scale-[0.97]"
                    >
                      {linkLabel(link)} <span aria-hidden="true">↗</span>
                    </a>
                  ))}
                  <Link
                    to={`/events?event=${encodeURIComponent(event.id)}`}
                    aria-label={`View ${event.title}`}
                    className="tap inline-flex items-center rounded-full bg-white/15 px-4 text-label-md font-medium text-white ring-1 ring-white/25 transition-transform hover:bg-white/20 active:scale-[0.97]"
                  >
                    View event
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
