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
 */
export function useFinishedServices(serviceIds: string[]) {
  const ids = useMemo(() => [...serviceIds].sort(), [serviceIds])

  const sessionsQuery = useQuery({
    queryKey: ['finished-service-sessions', ids],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_sessions')
        .select('id, service_id, start_time, duration_minutes')
        .in('service_id', ids)
      if (error) throw error
      return z
        .array(
          z.object({
            id: z.string(),
            service_id: z.string(),
            start_time: z.string(),
            duration_minutes: z.number().nullable(),
          }),
        )
        .parse(data)
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
    for (const row of sessionsQuery.data ?? []) {
      byService.set(row.service_id, [...(byService.get(row.service_id) ?? []), row])
    }

    const finished = new Set<string>()
    for (const [serviceId, sessions] of byService) {
      if (serviceStanding(sessions, clock).state === 'done') finished.add(serviceId)
    }
    return {
      finished,
      isFinished: (serviceId: string) => finished.has(serviceId),
      isLoading: sessionsQuery.isLoading,
    }
  }, [sessionsQuery.data, sessionsQuery.isLoading, clock])
}
