import { useQuery } from '@tanstack/react-query'
import { ROLE_PERMANENTS_KEY, fetchRolePermanents } from './rolePermanents'

/**
 * Who is permanent on which of a team's roles (0282). One read for the
 * whole team, shared by every role's row; off until asked for, so a card
 * that does not show permanent people does not fetch them.
 */
export function useRolePermanents(departmentId: string, enabled = true) {
  return useQuery({
    queryKey: [...ROLE_PERMANENTS_KEY, [departmentId]],
    queryFn: () => fetchRolePermanents([departmentId]),
    enabled,
  })
}
