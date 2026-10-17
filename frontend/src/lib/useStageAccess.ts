import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { useMyTeams } from './useMyTeams'
import { STAGE_KEY, fetchStageTeamAccess, stageMay, type StagePrivilege } from './stage'

/**
 * What this person may do to a stage layout, for drawing the buttons.
 *
 * The database decides for real (`stage_may`, 0155); this reads the same
 * table so a button is drawn only where pressing it would work. Admins
 * and the Owner always may; everybody else through a team they are on or
 * lead that the church has given it to.
 */
export function useStageAccess() {
  const { isAdmin, ledDepartmentIds, session } = useAuth()
  const { teamIds } = useMyTeams()
  const query = useQuery({
    queryKey: [...STAGE_KEY, 'team-access'],
    queryFn: fetchStageTeamAccess,
    enabled: !!session,
    staleTime: 60_000,
  })
  const mine = [...new Set([...teamIds, ...(ledDepartmentIds ?? [])])]
  const may = (priv: StagePrivilege) => stageMay(priv, { isAdmin, teamIds: mine }, query.data ?? [])
  return {
    may,
    settled: isAdmin || query.isSuccess || query.isError,
    access: query.data ?? [],
  }
}
