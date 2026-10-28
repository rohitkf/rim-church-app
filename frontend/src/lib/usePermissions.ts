import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from './supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { useMyTeams } from './useMyTeams'
import { useAppSettings } from './appSettings'
import { overwatchActOf, overwatchMay, type OverwatchAct } from './overwatch'
import {
  decide,
  overridesFrom,
  teamOverridesFrom,
  type CapabilityKey,
  type Holder,
  type Overrides,
  type PermissionGrant,
  type TeamOverrides,
  type Where,
} from './permissions'

export const PERMISSIONS_KEY = ['role-permissions'] as const

const rowSchema = z.object({ role_key: z.string(), capability: z.string(), reach: z.string() })
const teamRowSchema = rowSchema.extend({ department_id: z.string() })
const grantRowSchema = z.object({
  id: z.string(),
  capability: z.string(),
  user_id: z.string().nullable(),
  department_id: z.string().nullable(),
  reach: z.enum(['team', 'all']),
  leads_only: z.boolean().default(false),
})

export interface StoredPermissions {
  church: Overrides
  teams: TeamOverrides
  /** One thing more, for a person or a team (0208). */
  grants: PermissionGrant[]
}

/**
 * The cells the church changed, the teams' own (0162), and the grants
 * (0208). Everybody may read them; only set_permissions() and
 * set_permission_grants() write.
 */
export async function fetchOverrides(): Promise<StoredPermissions> {
  const [church, teams, grants] = await Promise.all([
    supabase.from('role_permissions').select('role_key, capability, reach'),
    supabase.from('department_permissions').select('department_id, role_key, capability, reach'),
    supabase.from('permission_grants').select('id, capability, user_id, department_id, reach, leads_only'),
  ])
  if (church.error) throw church.error
  if (teams.error) throw teams.error
  if (grants.error) throw grants.error
  return {
    church: overridesFrom(z.array(rowSchema).parse(church.data ?? [])),
    teams: teamOverridesFrom(z.array(teamRowSchema).parse(teams.data ?? [])),
    grants: z
      .array(grantRowSchema)
      .parse(grants.data ?? [])
      .map((g) => ({
        id: g.id,
        capability: g.capability,
        userId: g.user_id,
        departmentId: g.department_id,
        reach: g.reach,
        leadsOnly: g.leads_only,
      })),
  }
}

const NONE: StoredPermissions = { church: {}, teams: {}, grants: [] }

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
  const { session, isSuperAdmin, isAdmin, isOverwatch, ledDepartmentIds, isDepartmentHead, roles, previewCoordinates, viewAs } =
    useAuth()
  const settings = useAppSettings()
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
  // A preview is of a profile on a team, not of somebody: its team's grants
  // come with it, nobody's own name does.
  const all = loaded.grants ?? NONE.grants
  const previewing = !!viewAs
  const grants = useMemo(() => (previewing ? all.filter((g) => !!g.departmentId) : all), [all, previewing])

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
  const pastor = (roles ?? []).some((r) => r.role_type === 'pastor')
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
      // A Team Coordinator preview is coordinating somewhere; a real one
      // is told so where it matters, by `where.coordinating`.
      coordinatesAnywhere: !!previewCoordinates,
      pastor,
      grants,
    }),
    [myId, isSuperAdmin, isAdmin, led, known, headed, assisted, member, isDepartmentHead, previewCoordinates, pastor, grants],
  )

  /*
   * One of the five things Overwatch may do (0214): its cell in the grid,
   * which may() does not read — the same `overwatch_may` the policies ask.
   */
  const pages = settings.overwatch_pages
  const watches = useCallback(
    (act: OverwatchAct) => isOverwatch && overwatchMay(overrides, pages, act),
    [isOverwatch, overrides, pages],
  )

  /* Overwatch's three on the grid's own rows. Posting on the board is as themselves, never as a team. */
  const watching = useCallback(
    (cap: CapabilityKey, where?: Where) => {
      const act = overwatchActOf(cap)
      if (act !== 'board' && act !== 'chat' && act !== 'polls') return false
      if (act === 'board' && where?.departmentId) return false
      return watches(act)
    },
    [watches],
  )

  const can = useCallback(
    (cap: CapabilityKey, where?: Where) => decide(overrides, holder, cap, where, teams) || watching(cap, where),
    [overrides, teams, holder, watching],
  )

  return { can, watches, overrides, teams, grants, query, holder }
}
