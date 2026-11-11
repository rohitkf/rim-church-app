import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { STANDING_KEY, fetchStanding, isShutOut, type Standing } from './standing'

/** How long the app waits to hear where somebody stands before it opens anyway. */
const PATIENCE_MS = 1_500

/**
 * Whether the signed-in person may use the app right now (lib/standing).
 *
 * Asked as soon as there is a session, again whenever a request is refused
 * because the app is closed (App.tsx invalidates the key), and every
 * minute while somebody is shut out, so the closed page lifts by itself
 * when the app opens again.
 *
 * `deciding` is the moment before the first answer. The app waits through
 * it rather than drawing a shell full of refused requests, but only
 * briefly: on a bad connection the answer may never come, and "we could
 * not ask" must never keep anybody out. Failing to ask is the same as
 * being told the app is open; the database still decides every request.
 */
export function useStanding(userId: string | null): {
  standing: Standing | null
  deciding: boolean
  checking: boolean
  recheck: () => void
} {
  const query = useQuery({
    queryKey: [...STANDING_KEY, userId],
    queryFn: fetchStanding,
    enabled: !!userId,
    retry: 0,
    staleTime: 30_000,
    refetchInterval: (q) => (isShutOut(q.state.data) ? 60_000 : false),
  })

  // Whose patience has run out. Keyed by person, so signing in as somebody
  // else starts the wait again without resetting state in an effect.
  const [patienceSpentFor, setPatienceSpentFor] = useState<string | null>(null)
  useEffect(() => {
    if (!userId) return
    const timer = window.setTimeout(() => setPatienceSpentFor(userId), PATIENCE_MS)
    return () => window.clearTimeout(timer)
  }, [userId])

  return {
    standing: query.data ?? null,
    deciding: !!userId && query.isPending && patienceSpentFor !== userId,
    checking: query.isFetching,
    recheck: () => void query.refetch(),
  }
}
