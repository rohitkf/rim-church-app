import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SECOND_STEP_KEY, fetchSecondStep, type SecondStep } from './secondStep'

/**
 * Whether the signed-in person still owes the code from their
 * authenticator app (lib/secondStep).
 *
 * Asked as soon as there is a session, and again whenever the database
 * refuses a request for want of it (App.tsx invalidates the key). For an
 * account with no authenticator the answer comes from what the browser
 * already holds, with no request made, so nobody waits on it.
 *
 * Failing to ask is the same as "nothing owed": the database still
 * refuses every request of a half signed-in account, and a page that
 * could not ask must never be what keeps somebody out. So the wait for
 * the first answer has an end, as the wait for standing has (useStanding).
 */

/** How long the app waits to hear before it opens anyway. */
const PATIENCE_MS = 1_500

export function useSecondStep(userId: string | null): { step: SecondStep | null; deciding: boolean } {
  const query = useQuery({
    queryKey: [...SECOND_STEP_KEY, userId],
    queryFn: fetchSecondStep,
    enabled: !!userId,
    retry: 0,
    staleTime: Infinity,
  })
  const [patienceSpentFor, setPatienceSpentFor] = useState<string | null>(null)
  useEffect(() => {
    if (!userId) return
    const timer = window.setTimeout(() => setPatienceSpentFor(userId), PATIENCE_MS)
    return () => window.clearTimeout(timer)
  }, [userId])

  return { step: query.data ?? null, deciding: !!userId && query.isPending && patienceSpentFor !== userId }
}
