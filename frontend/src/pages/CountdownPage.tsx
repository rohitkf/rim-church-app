import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { PageHeader, Tile, Eyebrow } from '../components/Surface'
import { QueryState } from '../components/QueryState'
import { todayIso } from '../lib/monthGrid'
import { useNow } from '../lib/useNow'
import { formatTime } from '../lib/time'
import { serviceStanding } from '../lib/serviceState'
import { clockFace, clockSize, clockTone, countdownFace, minutesWords, serviceClock, type ClockTone } from '../lib/serviceClock'
import { nextServiceToStart, startDay, startFace, startWords } from '../lib/serviceStart'
import { combinedClock, namesJoined, type CombinedClock } from '../lib/combinedClock'
import { namesOn } from '../lib/sessionAssignees'
import { sessionAssigneeSchema } from '../lib/types'

/*
 * The service's clock, large, for whoever is keeping time.
 *
 * Read-only. It is the countdown on the Service Planner's running order —
 * the same function (lib/serviceClock) over the same rows — so time added
 * to a session, a session marked not started, one started early or one
 * dropped all move it the moment the planner saves them: both pages hear
 * service_sessions change (lib/liveTables) and read it again.
 *
 * Past zero it keeps counting, with a minus: the number somebody watching
 * wants then is how far over the service is running, and on this page it
 * is one number counting down, so below nothing it is a negative one
 * (lib/serviceClock `countdownFace`). Everywhere else an overrun keeps its
 * plus.
 *
 * Sessions one after another that the same people take are counted as
 * one (lib/combinedClock): a speaker with "Message" and then "Message 1"
 * sees the time they have for both, not the first one's clock running
 * out halfway through. On this page only — the planner and the Dashboard
 * keep each session's own clock.
 *
 * The number is green while there is plenty of time, amber as the end
 * comes close and red for the last of it and past zero (clockTone). The
 * line under it says the same in words, so the colour is never the only
 * thing telling anybody. Past zero the number also blinks (`blink-over`,
 * index.css), steady for anybody who has asked for less motion.
 *
 * Under the sessions is a second section, for the service itself: how
 * long until the next one starts (lib/serviceStart). Before today's first
 * service that is the service about to begin, so the page says something
 * while the first section's clock is still blank; once a service is under
 * way it is whichever comes after, later today or next Sunday. It is a
 * plain number, in blue and never red: nothing is running late there.
 */

/** The big number's colour for each state of the clock: the app's green, amber and red. */
const TONE_CLASS: Record<ClockTone, string> = {
  plenty: 'text-accent-green-soft',
  close: 'text-accent-orange-soft',
  out: 'text-error',
}

const serviceRowSchema = z.object({
  id: z.string(),
  date: z.string(),
  service_type: z.string(),
  ended_at: z.string().nullable().optional(),
  /** "Not ended" (0292): the last session is still on past its time. */
  end_held_at: z.string().nullable().optional(),
})
type ServiceRow = z.infer<typeof serviceRowSchema>

const sessionRowSchema = z.object({
  id: z.string(),
  service_id: z.string(),
  order_index: z.number(),
  session_name: z.string(),
  start_time: z.string(),
  duration_minutes: z.number().nullable(),
  added_minutes: z.number().nullable().optional(),
  skipped_at: z.string().nullable().optional(),
  held_at: z.string().nullable().optional(),
  /** Who is on it: sessions in a row taken by the same people are counted as one (lib/combinedClock). */
  assignees: z.array(sessionAssigneeSchema).optional(),
})
type SessionRow = z.infer<typeof sessionRowSchema>

/** How many services ahead are read: enough to find the next one that has a running order. */
const SERVICES_AHEAD = 30

/**
 * Today's services and the ones after them, soonest first. Today's are
 * what the session clocks run on; the rest are read to find the service
 * that starts next.
 */
async function fetchServicesFrom(today: string): Promise<ServiceRow[]> {
  const { data, error } = await supabase
    .from('services')
    .select('id, date, service_type, ended_at, end_held_at')
    .gte('date', today)
    .order('date')
    .limit(SERVICES_AHEAD)
  if (error) throw error
  return z.array(serviceRowSchema).parse(data)
}

async function fetchSessionsFor(serviceIds: string[]): Promise<SessionRow[]> {
  if (serviceIds.length === 0) return []
  const { data, error } = await supabase
    .from('service_sessions')
    .select(
      'id, service_id, order_index, session_name, start_time, duration_minutes, added_minutes, skipped_at, held_at, assignees:service_session_assignees(id, user_id, guest_id, order_index, is_substitute, is_translator, profile:profiles(id, first_name, last_name), guest:guests(id, name, title))',
    )
    .in('service_id', serviceIds)
    .order('order_index')
  if (error) throw error
  return z.array(sessionRowSchema).parse(data)
}

export function CountdownPage() {
  // A second hand: this page is the clock.
  const now = useNow(1000)
  const today = todayIso()

  // Keys under the planner's own, so every change to a service or its
  // running order reaches this page as it reaches the planner.
  const servicesQuery = useQuery({
    queryKey: ['services', 'countdown', today],
    queryFn: () => fetchServicesFrom(today),
  })
  const serviceIds = useMemo(() => (servicesQuery.data ?? []).map((s) => s.id), [servicesQuery.data])
  const sessionsQuery = useQuery({
    queryKey: ['service-sessions', 'countdown', serviceIds],
    queryFn: () => fetchSessionsFor(serviceIds),
    enabled: serviceIds.length > 0,
  })

  const { live, next } = useMemo(() => {
    const sessions = sessionsQuery.data ?? []
    const rows = (servicesQuery.data ?? []).map((service) => {
      const own = sessions.filter((s) => s.service_id === service.id)
      const endHeld = !!service.end_held_at
      const clock = serviceClock(own, now, service.ended_at, { gaps: true, endHeld })
      return {
        service,
        sessions: own,
        standing: serviceStanding(own, now, service.ended_at, service.end_held_at),
        // The service's clock, counting on through sessions the same people take next.
        clock: clock ? combinedClock(own, clock, endHeld) : null,
      }
    })
    return {
      // Only a service that is on: its clock is running. Earliest first.
      live: rows.filter((r) => r.clock).sort((a, b) => (a.standing.from ?? 0) - (b.standing.from ?? 0)),
      // The earliest that has not begun: today's before it starts, the one after once it has.
      next: nextServiceToStart(rows, now),
    }
  }, [servicesQuery.data, sessionsQuery.data, now])

  const loading = servicesQuery.isLoading || (serviceIds.length > 0 && sessionsQuery.isLoading)

  return (
    <div>
      <PageHeader
        // Said only while something is running: it used to read "Sunday · Live" on a Tuesday with nothing on.
        live={live.length > 0}
        context={live.length > 0 ? 'Live now' : undefined}
        title="Countdown"
        description="The running order’s clock, as the Service Planner keeps it. Past zero it counts on, so you can see how far over it is running. Under it, how long until the next service starts."
      />

      <QueryState isLoading={loading} error={servicesQuery.error ?? sessionsQuery.error}>
        <div className="flex flex-col gap-5">
          {live.map(({ service, clock }) => (
            <ClockTile key={service.id} service={service} counting={clock!} now={now} />
          ))}

          {/* Nothing on: a blank clock, not a countdown to something else. */}
          {live.length === 0 && (
            <Tile className="@container text-center">
              <Eyebrow>No service running</Eyebrow>
              <p
                aria-label="No service is running"
                className="mt-4 whitespace-nowrap font-mono tabular font-semibold leading-none tracking-tight text-on-surface-faint"
                style={{ fontSize: clockSize('--:--:--', 'clamp(3.5rem, 16vw, 10rem)') }}
              >
                --:--:--
              </p>
            </Tile>
          )}

          {/* The second section: the service itself, under its sessions. */}
          <NextServiceTile next={next} now={now} running={live.length > 0} />
        </div>
      </QueryState>
    </div>
  )
}

/**
 * How long until the next service starts.
 *
 * Before a service begins this is the one about to; once one is running
 * it is the one after. Smaller than the session clock above it and in
 * blue, so the two are never read as the same kind of number: that one
 * says how the service is running, this one says when the next begins.
 */
function NextServiceTile({ next, now, running }: { next: { service: ServiceRow; at: number } | null; now: number; running: boolean }) {
  // With a service on, what follows it is "next"; with none on, it is simply the service that is coming.
  const title = running ? 'Next service' : 'Service'
  if (!next) {
    return (
      // The card takes no label of its own, so the section around it carries the name.
      <section aria-label={title}>
        <Tile className="text-center">
          <Eyebrow>{title}</Eyebrow>
          <p className="mt-3 text-body-md text-on-surface-variant">
            {running ? 'Nothing is planned after this one yet.' : 'No service with a running order is planned yet.'}
          </p>
        </Tile>
      </section>
    )
  }
  const left = next.at - now
  const face = startFace(left)
  // The time as every other time on this page is written, and the day when it is not today.
  const day = startDay(next.at, now)
  return (
    <section aria-label={title}>
      <Tile className="@container text-center">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-left">
          <Eyebrow>{title}</Eyebrow>
          <Link to={`/service-planner/${next.service.id}`} className="text-body-sm text-accent-blue-soft hover:underline">
            Running order
          </Link>
        </div>

        <p className="mt-4 text-body-md text-on-surface-variant">
          <span className="font-medium text-on-surface [overflow-wrap:anywhere]">{next.service.service_type}</span> starts in
        </p>

        <p
          role="timer"
          aria-live="off"
          aria-label={`${startWords(left)} until ${next.service.service_type} starts`}
          className="mt-2 whitespace-nowrap font-mono tabular font-semibold leading-none tracking-tight text-accent-blue-soft"
          // A size down from the session clock, and never wider than the card (clockSize).
          style={{ fontSize: clockSize(face, 'clamp(3rem, 15vw, 8.5rem)') }}
        >
          {face}
        </p>

        <p className="mt-3 text-body-lg text-on-surface">
          Starts{day ? ` ${day}` : ''}
          <span className="font-mono tabular text-on-surface-variant"> · {formatTime(new Date(next.at).toISOString())}</span>
        </p>
      </Tile>
    </section>
  )
}

function ClockTile({ service, counting, now }: { service: ServiceRow; counting: CombinedClock<SessionRow>; now: number }) {
  const { clock, joined, from } = counting
  const remaining = clock.target - now
  const over = remaining < 0
  const due = formatTime(new Date(clock.target).toISOString())
  const what = clock.to === 'end' ? 'The end of the service' : clock.next ? clock.next.session_name : 'The next session'
  // How long the thing being counted runs in all: from where these people
  // began (the session that is on, or the first of the ones they take in a
  // row) to the moment the clock is counting to. In a gap there is no
  // session, and the colour goes by minutes alone.
  const span = from === null ? null : clock.target - from
  const tone = clockTone(remaining, span)
  // The sessions counted with the one that is on, and whose they are.
  const also = joined.slice(1).map((s) => s.session_name)
  const takers = clock.current ? namesOn(clock.current) : []

  return (
    <Tile as="section" className="@container text-center" tone={over ? 'danger' : 'plain'}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-left">
        <Eyebrow>{service.service_type}</Eyebrow>
        <Link to={`/service-planner/${service.id}`} className="text-body-sm text-accent-blue-soft hover:underline">
          Running order
        </Link>
      </div>

      <p className="mt-4 text-body-md text-on-surface-variant">
        {clock.current ? (
          <>
            Now: <span className="font-medium text-on-surface">{clock.current.session_name}</span>
          </>
        ) : (
          'Between sessions'
        )}
      </p>

      {/* The number itself, as large as the screen allows: read from
          across a room, not from a hand. */}
      <p
        role="timer"
        aria-live="off"
        aria-label={over ? `Running ${clockFace(remaining).slice(1)} over` : `${clockFace(remaining)} until ${what}`}
        data-tone={tone}
        // Past zero it fades out and back, about once a second: an overrun
        // has to be seen from the stage without anybody reading it.
        className={`mt-2 whitespace-nowrap font-mono tabular font-semibold leading-none tracking-tight ${TONE_CLASS[tone]} ${over ? 'blink-over' : ''}`}
        // As large as the screen allows, and never wider than the card (clockSize).
        style={{ fontSize: clockSize(countdownFace(remaining), 'clamp(4.5rem, 22vw, 13rem)') }}
      >
        {/* Past zero with a minus, on this page only (countdownFace). */}
        {countdownFace(remaining)}
      </p>

      {/* The same, as one number of minutes: what gets held up on a card
          at the back, with no hour to work out first (clockMinutes). */}
      <p className="mt-3 text-headline-sm text-on-surface">{minutesWords(remaining)}</p>

      <p className="mt-3 text-body-lg text-on-surface">
        {over ? (clock.to === 'end' ? 'Over the planned end' : `Over — ${what} was due`) : clock.to === 'end' ? 'Until the end of the service' : `Until ${what}`}
        <span className="font-mono tabular text-on-surface-variant"> · {due}</span>
      </p>
      {also.length > 0 && (
        <p className="mt-2 text-body-sm text-on-surface-variant [overflow-wrap:anywhere]">
          Counting on through {namesJoined(also)}: {takers.length > 0 ? namesJoined(takers) : 'the same people'}{' '}
          {takers.length === 1 ? 'takes' : 'take'} {joined.length === 2 ? 'both' : `all ${joined.length}`}.
        </p>
      )}
      {clock.holding && clock.next && (
        <p className="mt-2 text-body-sm text-error">{clock.next.session_name} has not started yet.</p>
      )}
      {clock.holding && clock.to === 'end' && over && (
        <p className="mt-2 text-body-sm text-error">
          The service has not ended yet{clock.current ? ` — ${clock.current.session_name} is still running` : ''}.
        </p>
      )}
      {!over && tone !== 'plenty' && (
        <p className="mt-2 text-body-sm text-on-surface-variant">{tone === 'out' ? 'Time is nearly up.' : 'Coming to the end.'}</p>
      )}
    </Tile>
  )
}
