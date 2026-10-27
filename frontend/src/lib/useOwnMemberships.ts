import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { isTeamPreview } from './viewAs'
import { fetchOwnMemberships } from './queries'

export type OwnMembership = { department_id: string; member_type: 'core' | 'guest' }

const NONE: OwnMembership[] = []

/**
 * The teams this person is on — or, in a preview, the teams the person
 * being previewed is on.
 *
 * Each page used to read the roster for itself, by the signed-in id, and
 * a preview narrows roles but not rows: an Admin previewing a Church
 * Member was still on Media as far as the Dashboard could tell, and was
 * offered "3 still to answer" for a team a Church Member is not on. A
 * preview is on exactly the team it picked, or on none, so that answer
 * is given here once rather than remembered on every page.
 */
export function useOwnMemberships(): {
  memberships: OwnMembership[]
  teamIds: string[]
  isLoading: boolean
  isSuccess: boolean
  isError: boolean
  error: Error | null
} {
  const { session, viewAs } = useAuth()
  const myId = session?.user.id
  const query = useQuery({
    queryKey: ['own-memberships', myId],
    queryFn: () => fetchOwnMemberships(myId!),
    enabled: !!myId && !viewAs,
  })

  const previewTeam = isTeamPreview(viewAs) ? viewAs.departmentId : null
  const memberships = useMemo<OwnMembership[]>(
    () =>
      viewAs
        ? previewTeam
          ? [{ department_id: previewTeam, member_type: 'core' }]
          : NONE
        : (query.data ?? NONE),
    [viewAs, previewTeam, query.data],
  )
  const teamIds = useMemo(() => memberships.map((m) => m.department_id), [memberships])

  if (viewAs) return { memberships, teamIds, isLoading: false, isSuccess: true, isError: false, error: null }
  return {
    memberships,
    teamIds,
    isLoading: query.isLoading,
    isSuccess: query.isSuccess,
    isError: query.isError,
    error: query.error,
  }
}
