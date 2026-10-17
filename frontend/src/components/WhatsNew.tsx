import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { usePageAccess } from '../lib/usePageAccess'
import { usePwa } from '../lib/usePwa'
import { ONBOARDING_KEY, fetchMyOnboarding, markReleaseSeen } from '../lib/onboarding'
import { nextUnseenRelease } from '../lib/releases'
import { subscribeTour } from '../lib/tour'
import { ReleaseDialog } from './ReleaseDialog'

/**
 * Says what is new, once per person.
 *
 * Waits its turn: not while the tour is running (a new account meets the
 * app before it meets the changelog), not for somebody still on the
 * joining form, not for an Admin previewing as somebody else, and not
 * while a new version is waiting to be reloaded into: that door has no
 * way round it, so the card would only sit behind or over it. It is not
 * marked seen until it is closed, so it comes back after the reload.
 */
export function WhatsNew() {
  const { profile, viewAs } = useAuth()
  const { canOpen, settled } = usePageAccess()
  const { updateReady } = usePwa()
  const queryClient = useQueryClient()
  const [touring, setTouring] = useState(false)
  const [dismissed, setDismissed] = useState<string | null>(null)
  useEffect(() => subscribeTour((run) => setTouring(run !== null)), [])

  const myId = profile?.id
  const query = useQuery({
    queryKey: [...ONBOARDING_KEY, myId],
    queryFn: () => fetchMyOnboarding(myId!),
    enabled: !!myId,
  })
  const seen = useMutation({
    mutationFn: markReleaseSeen,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ONBOARDING_KEY }),
  })

  if (!profile || !profile.onboarded_at || viewAs || touring || updateReady || !settled || !query.isSuccess) return null
  const release = nextUnseenRelease(query.data?.releases_seen ?? {}, canOpen)
  if (!release || release.key === dismissed) return null

  const close = () => {
    setDismissed(release.key)
    seen.mutate(release.key)
  }
  return <ReleaseDialog release={release} onClose={close} />
}
