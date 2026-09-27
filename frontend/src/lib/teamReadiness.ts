import { z } from 'zod'
import { supabase } from './supabaseClient'
import { isCoordinatorRole } from './useTeamCoordinator'

/**
 * Each serving team's "ready for service" light (0110).
 *
 * Red until somebody who runs the team on the day turns it green — an
 * Admin, the team's Head or Assisting Head, or whoever the rota puts in
 * Team Coordinator for that team at that service. No row is red.
 */
export const readinessRowSchema = z.object({
  service_id: z.string(),
  department_id: z.string(),
  ready: z.boolean(),
  marked_at: z.string(),
  marker: z.object({ first_name: z.string(), last_name: z.string() }).nullable(),
})
export type ReadinessRow = z.infer<typeof readinessRowSchema>

export const READINESS_KEY = ['team-readiness']

export async function fetchTeamReadiness(serviceIds: string[]): Promise<ReadinessRow[]> {
  if (serviceIds.length === 0) return []
  const { data, error } = await supabase
    .from('service_team_readiness')
    .select(
      'service_id, department_id, ready, marked_at, marker:profiles!service_team_readiness_marked_by_fkey(first_name, last_name)',
    )
    .in('service_id', serviceIds)
  if (error) throw error
  return z.array(readinessRowSchema).parse(data)
}

export async function setTeamReady(serviceId: string, departmentId: string, ready: boolean) {
  const { error } = await supabase.rpc('set_team_ready', {
    service: serviceId,
    department: departmentId,
    is_ready: ready,
  })
  if (error) throw error
}

export interface TeamLight {
  departmentId: string
  ready: boolean
  /** "Santhi Chennamsetti", when somebody has touched it. */
  by: string | null
  at: string | null
}

/**
 * One light per team serving the service — a team is serving when the
 * rota has put somebody from it on this service — in the order given.
 */
export function teamLights(
  serviceId: string,
  servingTeamIds: string[],
  rows: ReadinessRow[],
): { lights: TeamLight[]; allReady: boolean } {
  const lights = servingTeamIds.map((departmentId) => {
    const row = rows.find((r) => r.service_id === serviceId && r.department_id === departmentId)
    return {
      departmentId,
      ready: !!row?.ready,
      by: row?.marker ? `${row.marker.first_name} ${row.marker.last_name}`.trim() : null,
      at: row ? row.marked_at : null,
    }
  })
  return { lights, allReady: lights.length > 0 && lights.every((l) => l.ready) }
}

/** The teams the rota has put somebody on, for this service. */
export function servingTeams(
  serviceId: string,
  assignments: { service_id: string; department_id: string }[],
): string[] {
  return [...new Set(assignments.filter((a) => a.service_id === serviceId).map((a) => a.department_id))]
}

/**
 * Whether the viewer may turn this team's light — the same rule the
 * database holds, asked first so the switch is only offered to them.
 */
export function mayMarkReady(opts: {
  isAdmin: boolean
  isHead: boolean
  myId: string | undefined
  serviceId: string
  departmentId: string
  assignments: { service_id: string; department_id: string; user_id: string; role_label: string }[]
}): boolean {
  if (opts.isAdmin || opts.isHead) return true
  return opts.assignments.some(
    (a) =>
      a.service_id === opts.serviceId &&
      a.department_id === opts.departmentId &&
      a.user_id === opts.myId &&
      isCoordinatorRole(a.role_label),
  )
}
