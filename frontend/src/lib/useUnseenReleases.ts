import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { usePageAccess } from './usePageAccess'
import { usePermissions } from './usePermissions'
import type { CapabilityKey } from './permissions'
import { ONBOARDING_KEY, fetchMyOnboarding, markReleaseSeen } from './onboarding'
import { unseenReleases, type Release } from './releases'

/**
 * What this account has not been told is new, and a way to say it has.
 *
 * The two notices that offer release notes read it: the "new version"
 * notice before a reload, and the "what's new" notice after one. Once per
 * account (`onboarding.releases_seen`, 0156), only pages the person may
 * open and only what they have the right to do there (`holds`), and never for somebody still joining or an Admin previewing as
 * somebody else — `ready` is false then, and nothing is unseen.
 */
export function useUnseenReleases() {
  const { profile, viewAs } = useAuth()
  const { canOpen, settled } = usePageAccess()
  const { can } = usePermissions()
  const queryClient = useQueryClient()
  const myId = profile?.id
  const query = useQuery({
    queryKey: [...ONBOARDING_KEY, myId],
    queryFn: () => fetchMyOnboarding(myId!),
    enabled: !!myId,
  })
  const mark = useMutation({
    mutationFn: (keys: string[]) => Promise.all(keys.map((key) => markReleaseSeen(key))),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ONBOARDING_KEY }),
  })

  const ready = !!profile && !!profile.onboarded_at && !viewAs && settled && query.isSuccess
  /** Of these releases (this build's, unless given), the ones still to tell them about. */
  const unseenOf = (releases?: Release[]): Release[] =>
    ready ? unseenReleases(query.data?.releases_seen ?? {}, canOpen, releases, (cap) => can(cap as CapabilityKey)) : []
  /** They have been told: remember it on the account. */
  const markSeen = (keys: string[]) => {
    if (ready && keys.length > 0) mark.mutate(keys)
  }
  return { ready, signedIn: !!profile, unseenOf, markSeen }
}
