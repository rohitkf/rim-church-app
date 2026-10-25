import { useMemo } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useAppSettings } from './appSettings'
import { controlsHeld, type PlannerControl } from './plannerControls'
import { useMyTeams } from './useMyTeams'

/**
 * The planner buttons the church gave this person beyond what their
 * profile plans (0184): on their own name, or through a team they are on
 * or head. While an Admin views the app as somebody else, only the team
 * they picked counts — their own name is not the previewed person's.
 */
export function usePlannerControls(): Set<PlannerControl> {
  const { planner_controls } = useAppSettings()
  const { session, ledDepartmentIds, viewAs } = useAuth()
  const { teamIds } = useMyTeams()
  const myId = viewAs ? null : session?.user.id
  const led = ledDepartmentIds ?? []
  const key = [...teamIds, ...led].join('|')
  return useMemo(
    () => controlsHeld(planner_controls, { id: myId, teamIds: key ? key.split('|') : [] }),
    [planner_controls, myId, key],
  )
}
