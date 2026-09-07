import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabaseClient'
import { LIVE_TABLES, keysFor } from './liveTables'

/**
 * One socket, and the whole app stops going stale.
 *
 * Every list in the app was fetched when its page mounted and then left
 * alone. Coming back to the tab refreshed it — `refetchOnWindowFocus` —
 * which is why it sometimes appeared to fix itself, and why the times it
 * did not were so confusing. A page you are looking at is exactly the
 * page that never refetches.
 *
 * So the database says when. Postgres publishes its changes, Realtime
 * passes on the ones this person is allowed to see, and each one marks
 * the queries that were reading that table as stale. TanStack does the
 * rest: what is on screen refetches immediately, what is not is refetched
 * whenever it is next needed.
 *
 * One channel with a binding per table, rather than a subscription per
 * component. Three components already had their own — the activity feed,
 * the bell, team chat — and each is filtered to one service, one person
 * or one team, which is worth keeping. This is for everything else, where
 * the question is only "has this table moved".
 */

/** Collect a burst into one invalidation rather than twenty. */
const SETTLE_MS = 120

export function useLiveData() {
  const queryClient = useQueryClient()

  useEffect(() => {
    // Keys waiting to be invalidated, and the timer that will do it.
    // Saving a plan writes a dozen sessions in one go; without this each
    // row would start its own refetch of the same query.
    let pending = new Set<string>()
    let timer: number | undefined

    const flush = () => {
      timer = undefined
      const keys = [...pending]
      pending = new Set()
      for (const key of keys) void queryClient.invalidateQueries({ queryKey: [key] })
    }

    const stale = (table: string) => {
      const keys = keysFor(table)
      if (keys.length === 0) return
      for (const key of keys) pending.add(key)
      if (timer === undefined) timer = window.setTimeout(flush, SETTLE_MS)
    }

    const channel = supabase.channel('live-data')
    for (const { table } of LIVE_TABLES) {
      channel.on(
        // The client's types describe the filtered form of this call; the
        // unfiltered one is just as valid and is what "any change to this
        // table" means.
        'postgres_changes' as never,
        { event: '*', schema: 'public', table } as never,
        (() => stale(table)) as never,
      )
    }
    channel.subscribe()

    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [queryClient])
}
