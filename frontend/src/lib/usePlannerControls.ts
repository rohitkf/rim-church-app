import { useMemo } from 'react'
import { CONTROL_KEYS, type PlannerControl } from './plannerControls'
import { usePermissions } from './usePermissions'
import type { CapabilityKey } from './permissions'

/**
 * The planner buttons this person may press on their own (0211): each is
 * a capability in the grid — given to a profile, a team they are on or
 * head, or them by name — beyond what planning the running order or
 * running the service already gives. A preview counts the previewed
 * team's grants, not the Admin's own name.
 */
export function usePlannerControls(): Set<PlannerControl> {
  const { can } = usePermissions()
  const held = CONTROL_KEYS.filter((c) => can(`planner.${c}` as CapabilityKey))
  const key = held.join('|')
  return useMemo(() => new Set(key ? (key.split('|') as PlannerControl[]) : []), [key])
}
