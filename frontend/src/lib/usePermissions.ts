import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from './supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { useMyTeams } from './useMyTeams'
import {
  decide,
  overridesFrom,
  teamOverridesFrom,
  type CapabilityKey,
  type Holder,
  type Overrides,
  type TeamOverrides,
  type Where,
} from './permissions'

export const PERMISSIONS_KEY = ['role-permissions'] as const

const rowSchema = z.object({ role_key: z.string(), capability: z.string(), reach: z.string() })
const teamRowSchema = rowSchema.extend({ department_id: z.string() })

/** The cells the church changed, and the teams' own (0162). Everybody may read them; only set_permissions() writes. */
export async function fetchOverrides(): Promise<{ church: Overrides; teams: TeamOverrides }> {
  const [church, teams] = await Promise.all([
    supabase.from('role_permissions').select('role_key, capability, reach'),
    supabase.from('department_permissions').select('department_id, role_key, capability, reach'),
  ])
  if (church.error) throw church.error
  if (teams.error) throw teams.error
  return {
    church: overridesFrom(z.array(rowSchema).parse(church.data ?? [])),
    teams: teamOverridesFrom(z.array(teamRowSchema).parse(teams.data ?? [])),
  }
}

const NONE: { church: Overrides; teams: TeamOverrides } = { church: {}, teams: {} }

/**
 * The church's permissions, and `can()` for the signed-in person.
 *
 * Until the changes have loaded, `can()` answers from the defaults — which
 * are what the database does too until somebody changes a cell, so a
 * button never flashes in that the database would refuse.
 *
 * An Admin previewing the app as somebody else gets that somebody's
 * answers: the preview narrows roles and teams, and this reads them.
 */
export function usePermissions() {
  const { session, isSuperAdmin, isAdmin, ledDepartmentIds, isDepartmentHead, roles } = useAuth()
  const { teamIds } = useMyTeams()
  const myId = session?.user.id ?? null

  const query = useQuery({
    queryKey: PERMISSIONS_KEY,
    queryFn: fetchOverrides,
    enabled: !!myId,
    staleTime: 60_000,
  })
  const loaded = query.data ?? NONE
  const overrides = loaded.church
  const teams = loaded.teams

  // Both lists are rebuilt every render; what they hold is what matters.
  const led = (ledDepartmentIds ?? []).join('|')
  const member = (teamIds ?? []).join('|')
  // Head and Assisting Head are two profiles (0162): which teams are which.
  // Without the roles themselves (a caller that only says which teams are
  // led), every led team is read as headed, as before 0162.
  const known = Array.isArray(roles)
  const headed = (roles ?? [])
    .filter((r) => r.role_type === 'department_head' && r.department_id)
    .map((r) => r.department_id as string)
    .join('|')
  const assisted = (roles ?? [])
    .filter((r) => r.role_type === 'assisting_head' && r.department_id)
    .map((r) => r.department_id as string)
    .join('|')
  const holder: Holder = useMemo(
    () => ({
      myId,
      owner: isSuperAdmin,
      admin: isAdmin,
      ledTeams: led ? led.split('|') : [],
      headTeams: known ? (headed ? headed.split('|') : []) : undefined,
      assistTeams: known ? (assisted ? assisted.split('|') : []) : undefined,
      leads: isDepartmentHead,
      memberTeams: member ? member.split('|') : [],
    }),
    [myId, isSuperAdmin, isAdmin, led, known, headed, assisted, member, isDepartmentHead],
  )

  const can = useCallback(
    (cap: CapabilityKey, where?: Where) => decide(overrides, holder, cap, where, teams),
    [overrides, teams, holder],
  )

  return { can, overrides, teams, query, holder }
}
