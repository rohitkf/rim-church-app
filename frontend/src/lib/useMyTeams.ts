import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { fetchOwnDepartmentIds } from './queries'

/**
 * Whether this person is part of anything yet.
 *
 * An account exists before anybody has put the person on a team: they sign
 * up, and a head adds them afterwards. In between, the app had nothing to
 * say to them and said all of it anyway — every team's call times, the
 * register, the notice board, a readiness ring for teams they are not on.
 * A wall of other people's arrangements is a strange first impression, and
 * the call times in particular are not a new account's business.
 *
 * So the pages ask this first. Being on a team means a place on its roster
 * — or heading one, which attaches you whether or not somebody also listed
 * you as a member, or being an Admin, who runs all of it.
 *
 * `settled` is the important part. Until the roster has come back, nobody
 * knows which of the two views is the right one, and guessing shows a
 * member the newcomer's page for a second or a newcomer the whole church.
 * Callers wait for it before deciding anything that would flicker.
 */
export function useMyTeams() {
  const { session, isAdmin, ledDepartmentIds } = useAuth()
  const myId = session?.user.id

  const query = useQuery({
    queryKey: ['own-departments', myId],
    queryFn: () => fetchOwnDepartmentIds(myId!),
    enabled: !!myId,
  })

  const teamIds = query.data ?? []
  // An Admin and a head are attached without a roster row, and neither
  // answer needs the query to have come back.
  const attachedByRole = isAdmin || ledDepartmentIds.length > 0
  const settled = attachedByRole || !myId || query.isSuccess || query.isError

  return {
    teamIds,
    /** On at least one team — or over them all. */
    onATeam: attachedByRole || teamIds.length > 0,
    /** True once the answer above is worth acting on. */
    settled,
  }
}
