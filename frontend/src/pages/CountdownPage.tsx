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
import { clockFace, clockTone, serviceClock, type ClockTone, type ServiceClock } from '../lib/serviceClock'

/*
 * The service's clock, large, for whoever is keeping time.
 *
 * Read-only. It is the countdown on the Service Planner's running order —
 * the same function (lib/serviceClock) over the same rows — so time added
 * to a session, a session marked not started, one started early or one
 * dropped all move it the moment the planner saves them: both pages hear
 * service_sessions change (lib/liveTables) and read it again.
 *
 * Past zero it keeps counting, with a plus: the number somebody watching
 * wants then is how far over the service is running.
 *
 * The number is green while there is plenty of time, amber as the end
 * comes close and red for the last of it and past zero (clockTone). The
 * line under it says the same in words, so the colour is never the only
 * thing telling anybody. Past zero the number also blinks (`blink-over`,
 * index.css), steady for anybody who has asked for less motion.
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
})
type SessionRow = z.infer<typeof sessionRowSchema>

async function fetchTodaysServices(today: string): Promise<ServiceRow[]> {
  const { data, error } = await supabase
    .from('services')
    .select('id, date, service_type, ended_at, end_held_at')
    .eq('date', today)
  if (error) throw error
  return z.array(serviceRowSchema).parse(data)
}

async function fetchSessionsFor(serviceIds: string[]): Promise<SessionRow[]> {
  if (serviceIds.length === 0) return []
  const { data, error } = await supabase
    .from('service_sessions')
    .select('id, service_id, order_index, session_name, start_time, duration_minutes, added_minutes, skipped_at, held_at')
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
    queryFn: () => fetchTodaysServices(today),
  })
  const serviceIds = useMemo(() => (servicesQuery.data ?? []).map((s) => s.id), [servicesQuery.data])
  const sessionsQuery = useQuery({
    queryKey: ['service-sessions', 'countdown', serviceIds],
    queryFn: () => fetchSessionsFor(serviceIds),
    enabled: serviceIds.length > 0,
  })

  const live = useMemo(() => {
    const sessions = sessionsQuery.data ?? []
    const rows = (servicesQuery.data ?? []).map((service) => {
      const own = sessions.filter((s) => s.service_id === service.id)
      return {
        service,
        sessions: own,
        standing: serviceStanding(own, now, service.ended_at, service.end_held_at),
        clock: serviceClock(own, now, service.ended_at, { gaps: true, endHeld: !!service.end_held_at }),
      }
    })
    // Only a service that is on: its clock is running. Earliest first.
    return rows.filter((r) => r.clock).sort((a, b) => (a.standing.from ?? 0) - (b.standing.from ?? 0))
  }, [servicesQuery.data, sessionsQuery.data, now])

  const loading = servicesQuery.isLoading || (serviceIds.length > 0 && sessionsQuery.isLoading)

  return (
    <div>
      <PageHeader
        eyebrow="Sunday · Live"
        live={live.length > 0}
        title="Countdown"
        description="The running order’s clock, as the Service Planner keeps it. Past zero it counts on, so you can see how far over it is running."
      />

      <QueryState isLoading={loading} error={servicesQuery.error ?? sessionsQuery.error}>
        <div className="flex flex-col gap-5">
          {live.map(({ service, clock }) => (
            <ClockTile key={service.id} service={service} clock={clock!} now={now} />
          ))}

          {/* Nothing on: a blank clock, not a countdown to something else. */}
          {live.length === 0 && (
            <Tile className="text-center">
              <Eyebrow>No service running</Eyebrow>
              <p
                aria-label="No service is running"
                className="mt-4 font-mono tabular font-semibold leading-none tracking-tight text-[clamp(3.5rem,16vw,10rem)] text-on-surface-faint"
              >
                --:--:--
              </p>
            </Tile>
          )}
        </div>
      </QueryState>
    </div>
  )
}

function ClockTile({ service, clock, now }: { service: ServiceRow; clock: ServiceClock<SessionRow>; now: number }) {
  const remaining = clock.target - now
  const over = remaining < 0
  const due = formatTime(new Date(clock.target).toISOString())
  const what = clock.to === 'end' ? 'The end of the service' : clock.next ? clock.next.session_name : 'The next session'
  // How long the thing being counted runs in all: the session that is on,
  // from its start to the moment the clock is counting to. In a gap there
  // is no session, and the colour goes by minutes alone.
  const span = clock.current ? clock.target - new Date(clock.current.start_time).getTime() : null
  const tone = clockTone(remaining, span)

  return (
    <Tile as="section" className="text-center" tone={over ? 'danger' : 'plain'}>
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
        className={`mt-2 font-mono tabular font-semibold leading-none tracking-tight text-[clamp(4.5rem,22vw,13rem)] ${TONE_CLASS[tone]} ${over ? 'blink-over' : ''}`}
      >
        {clockFace(remaining)}
      </p>

      <p className="mt-4 text-body-lg text-on-surface">
        {over ? (clock.to === 'end' ? 'Over the planned end' : `Over — ${what} was due`) : clock.to === 'end' ? 'Until the end of the service' : `Until ${what}`}
        <span className="font-mono tabular text-on-surface-variant"> · {due}</span>
      </p>
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
