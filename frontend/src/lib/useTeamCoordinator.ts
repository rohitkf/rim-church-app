import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'

/**
 * Whether the signed-in user is coordinating this team at this service.
 *
 * Every team carries a role called Coordinator, and whoever the rota puts
 * in it holds the team that morning — which is why this is a question
 * about one service rather than a standing rank like Head. Verifying a
 * team's checklist is theirs as well as the Head's, so a Sunday doesn't
 * stall on whoever happens to be in the building.
 *
 * Mirrors the SQL function is_rota_coordinator(), which is what actually
 * enforces it; this only decides whether the button is worth showing.
 */
export function useTeamCoordinator(
  serviceId: string | null | undefined,
  departmentId: string | null | undefined,
): boolean {
  const { session, isAdmin } = useAuth()
  const myId = session?.user.id

  const query = useQuery({
    queryKey: ['team-coordinator', serviceId, departmentId, myId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rota_assignments')
        .select('role_label')
        .eq('service_id', serviceId!)
        .eq('department_id', departmentId!)
        .eq('user_id', myId!)
      if (error) throw error
      // Matched case-insensitively, like the SQL side: the rota stores the
      // role as free text, so "coordinator" is the same job.
      return (data ?? []).some((r) => r.role_label.trim().toLowerCase() === 'coordinator')
    },
    // Nothing to ask when the answer cannot matter.
    enabled: !!serviceId && !!departmentId && !!myId && !isAdmin,
  })

  return query.data === true
}

/**
 * The built-in role name, matched the way the database matches it.
 *
 * Kept beside the hook so the UI and is_rota_coordinator() cannot disagree
 * about what counts as coordinating.
 */
export const COORDINATOR_ROLE = 'Coordinator'

export function isCoordinatorRole(name: string): boolean {
  return name.trim().toLowerCase() === COORDINATOR_ROLE.toLowerCase()
}
