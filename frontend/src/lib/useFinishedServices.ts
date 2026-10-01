import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from './supabaseClient'
import { serviceStanding } from './serviceState'

/**
 * Which of these services are over.
 *
 * Three pages now need the same answer — the planner, the checklists and
 * the availability tracker — and they must not each work it out slightly
 * differently, or a service could be closed on one screen and open on the
 * next. One query, one clock, one rule: the last session's end has passed.
 *
 * A service with no running order is never finished. There is no end time
 * to have passed, and guessing one from the date would close a service
 * nobody has planned yet.
 *
 * The same query already knows when each service *starts*, which is a
 * second question worth answering from one place rather than two: it is
 * the moment a volunteer's own answer stops being a plan and becomes a
 * note about the past, so the availability page needs it to close the
 * question and to count down to it.
 */
export function useFinishedServices(serviceIds: string[]) {
  const ids = useMemo(() => [...serviceIds].sort(), [serviceIds])

  const sessionsQuery = useQuery({
    queryKey: ['finished-service-sessions', ids],
    queryFn: async () => {
      // The running order says when a service is due to end; End service,
      // when somebody pressed it, says when it did. Both are read here so
      // every page closes a service at the same moment the planner does
      // and the database starts locking it — not at the planned end.
      const [sessions, ended] = await Promise.all([
        supabase
          .from('service_sessions')
          .select('id, service_id, start_time, duration_minutes')
          .in('service_id', ids),
        supabase.from('services').select('id, ended_at').in('id', ids),
      ])
      if (sessions.error) throw sessions.error
      if (ended.error) throw ended.error
      return {
        sessions: z
          .array(
            z.object({
              id: z.string(),
              service_id: z.string(),
              start_time: z.string(),
              duration_minutes: z.number().nullable(),
            }),
          )
          .parse(sessions.data),
        endedAt: new Map(
          z
            .array(z.object({ id: z.string(), ended_at: z.string().nullable().optional() }))
            .parse(ended.data ?? [])
            .map((s) => [s.id, s.ended_at ?? null] as const),
        ),
      }
    },
    enabled: ids.length > 0,
  })

  // Re-read on a timer, so a service that ends while somebody has the page
  // open closes itself rather than waiting for a reload.
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  return useMemo(() => {
    const byService = new Map<
      string,
      { id: string; start_time: string; duration_minutes: number | null }[]
    >()
    for (const row of sessionsQuery.data?.sessions ?? []) {
      byService.set(row.service_id, [...(byService.get(row.service_id) ?? []), row])
    }

    const finished = new Set<string>()
    const startsAt = new Map<string, string>()
    const endedAt = new Map<string, number>()
    const endsAt = new Map<string, number>()
    // Every service asked about, not only those with sessions: one that was
    // ended by hand without a running order is still over.
    for (const serviceId of ids) {
      const sessions = byService.get(serviceId) ?? []
      const standing = serviceStanding(sessions, clock, sessionsQuery.data?.endedAt.get(serviceId))
      if (standing.state === 'done') {
        finished.add(serviceId)
        if (standing.to !== null) endedAt.set(serviceId, standing.to)
      }
      if (standing.from !== null) startsAt.set(serviceId, new Date(standing.from).toISOString())
      if (standing.to !== null) endsAt.set(serviceId, standing.to)
    }
    return {
      finished,
      isFinished: (serviceId: string) => finished.has(serviceId),
      /**
       * When this service begins, ISO — null when nothing is planned, so a
       * caller can tell "not yet started" from "no start to speak of".
       */
      startsAt: (serviceId: string) => startsAt.get(serviceId) ?? null,
      /**
       * When it ends or is due to, epoch ms: End service if it was
       * pressed, otherwise the planned end of the last session — the same
       * moment as the database's service_ended_at. Null when unplanned.
       */
      endsAt: (serviceId: string) => endsAt.get(serviceId) ?? null,
      /** The clock these answers were worked out against, epoch ms. */
      now: clock,
      /**
       * When a finished service's "After the service" checklist closes —
       * `minutes` past its end — while that is still to come, else null.
       * The same clock as `isFinished`, so the two cannot disagree.
       */
      afterServiceOpenUntil: (serviceId: string, minutes: number): number | null => {
        const ended = endedAt.get(serviceId)
        if (ended === undefined) return null
        const until = ended + minutes * 60_000
        return clock < until ? until : null
      },
      /** Whether the first session's start has passed. */
      hasStarted: (serviceId: string) => {
        const at = startsAt.get(serviceId)
        return at !== undefined && clock >= new Date(at).getTime()
      },
      isLoading: sessionsQuery.isLoading,
    }
  }, [sessionsQuery.data, sessionsQuery.isLoading, clock, ids])
}
