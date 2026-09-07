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
 *
 * ## Only while somebody is looking
 *
 * Realtime is billed per message per listening client, and a phone in a
 * pocket with the app still open is a listening client: it collects every
 * change the church makes all Sunday afternoon, and reads none of them.
 * Multiply that by everybody who never closed the tab and the largest
 * part of the bill is for messages nobody saw.
 *
 * So the socket follows the screen. Hidden for a minute, it closes;
 * visible again, it opens and asks every query to check itself, which
 * catches whatever moved while it was shut. Nothing is lost by that —
 * the queries would have refetched on focus anyway — and it takes the
 * common case, an app left open for hours, down to nothing.
 *
 * The minute of grace matters: switching tabs, answering a message and
 * coming back is the normal rhythm of using a phone, and a socket that
 * tore itself down and rebuilt each time would spend its life rejoining.
 * Realtime rate-limits channel joins as strictly as messages.
 */

/** Collect a burst into one invalidation rather than twenty. */
const SETTLE_MS = 120

/**
 * How long the app may be out of sight before the socket closes.
 *
 * Long enough to cover a glance at something else, short enough that a
 * phone put down for a service is quiet for nearly all of it.
 */
export const IDLE_DISCONNECT_MS = 60 * 1000

export function useLiveData() {
  const queryClient = useQueryClient()

  useEffect(() => {
    // Keys waiting to be invalidated, and the timer that will do it.
    // Saving a plan writes a dozen sessions in one go; without this each
    // row would start its own refetch of the same query.
    let pending = new Set<string>()
    let settleTimer: number | undefined
    let idleTimer: number | undefined
    let channel: ReturnType<typeof supabase.channel> | null = null

    const flush = () => {
      settleTimer = undefined
      const keys = [...pending]
      pending = new Set()
      for (const key of keys) void queryClient.invalidateQueries({ queryKey: [key] })
    }

    const stale = (table: string) => {
      const keys = keysFor(table)
      if (keys.length === 0) return
      for (const key of keys) pending.add(key)
      if (settleTimer === undefined) settleTimer = window.setTimeout(flush, SETTLE_MS)
    }

    const open = () => {
      if (channel) return
      const opening = supabase.channel('live-data')
      for (const { table } of LIVE_TABLES) {
        opening.on(
          // The client's types describe the filtered form of this call;
          // the unfiltered one is just as valid and is what "any change
          // to this table" means.
          'postgres_changes' as never,
          { event: '*', schema: 'public', table } as never,
          (() => stale(table)) as never,
        )
      }
      opening.subscribe()
      channel = opening
    }

    const close = () => {
      idleTimer = undefined
      if (!channel) return
      void supabase.removeChannel(channel)
      channel = null
      // Anything queued belongs to a socket that is going; the catch-up
      // on the way back in is what covers it.
      pending = new Set()
      if (settleTimer !== undefined) {
        window.clearTimeout(settleTimer)
        settleTimer = undefined
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (idleTimer !== undefined) {
          window.clearTimeout(idleTimer)
          idleTimer = undefined
        }
        // Reopening means we were deaf for a while: ask everything to
        // check itself rather than trusting a page that has been asleep.
        if (!channel) {
          open()
          void queryClient.invalidateQueries()
        }
        return
      }
      if (idleTimer === undefined) idleTimer = window.setTimeout(close, IDLE_DISCONNECT_MS)
    }

    if (document.visibilityState === 'visible') open()
    else idleTimer = window.setTimeout(close, IDLE_DISCONNECT_MS)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      if (settleTimer !== undefined) window.clearTimeout(settleTimer)
      if (idleTimer !== undefined) window.clearTimeout(idleTimer)
      close()
    }
  }, [queryClient])
}
