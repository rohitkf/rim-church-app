import { usePermissions } from './usePermissions'
import type { CapabilityKey } from './permissions'
import type { StagePrivilege } from './stage'

/**
 * What this person may do to a stage layout, for drawing the buttons.
 *
 * The database decides for real (`stage_may`, which asks the grid since
 * 0212); this asks the app's copy of the same grid, so a button is drawn
 * only where pressing it would work. Admins and the Owner always may;
 * everybody else as the church gives `stage.<key>` — to a profile, a team
 * they are on or lead, or them by name.
 */
export function useStageAccess() {
  const { can, query } = usePermissions()
  const may = (priv: StagePrivilege) => can(`stage.${priv}` as CapabilityKey)
  return { may, settled: !query || !query.isLoading }
}
