import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabaseClient'
import { PRAYER_KEY } from './prayer'

/** Collect a burst — a request deleted with its responses — into one refetch. */
const SETTLE_MS = 250

/**
 * Prayer Requests, live (0199).
 *
 * The prayer tables cannot be watched the way the rest of the app is
 * (lib/useLiveData): Realtime passes a row on only to somebody its
 * policies let read it, and nobody may read these row by row — that is
 * how an anonymous author is kept back. So the database broadcasts that
 * something changed, with nothing in the message, on a private topic for
 * the signed-in; the page asks prayer_board() again, which answers with
 * what this person may see.
 *
 * Only while the page is open: a phone elsewhere in the app is not
 * listening, and the page refetches anyway when it is opened again.
 */
export function usePrayerLive() {
  const queryClient = useQueryClient()
  useEffect(() => {
    let timer: number | undefined
    const stale = () => {
      if (timer !== undefined) return
      timer = window.setTimeout(() => {
        timer = undefined
        void queryClient.invalidateQueries({ queryKey: PRAYER_KEY })
      }, SETTLE_MS)
    }
    const channel = supabase
      .channel('prayer', { config: { private: true } })
      .on('broadcast', { event: 'changed' }, stale)
      .subscribe()
    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [queryClient])
}
