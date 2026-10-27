import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabaseClient'
import { PRAYER_KEY } from './prayer'
import { IDLE_DISCONNECT_MS } from './useLiveData'

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
 * Only while the page is open and on screen: a phone elsewhere in the app
 * is not listening, and one put down on this page stops after the same
 * minute as the rest of the app's socket (useLiveData), then catches up
 * with a refetch when it is looked at again.
 */
export function usePrayerLive() {
  const queryClient = useQueryClient()
  useEffect(() => {
    let timer: number | undefined
    let idleTimer: number | undefined
    let channel: ReturnType<typeof supabase.channel> | null = null

    const stale = () => {
      if (timer !== undefined) return
      timer = window.setTimeout(() => {
        timer = undefined
        void queryClient.invalidateQueries({ queryKey: PRAYER_KEY })
      }, SETTLE_MS)
    }

    const open = () => {
      if (channel) return
      channel = supabase
        .channel('prayer', { config: { private: true } })
        .on('broadcast', { event: 'changed' }, stale)
        .subscribe()
    }

    const close = () => {
      idleTimer = undefined
      if (timer !== undefined) {
        window.clearTimeout(timer)
        timer = undefined
      }
      if (!channel) return
      void supabase.removeChannel(channel)
      channel = null
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (idleTimer !== undefined) {
          window.clearTimeout(idleTimer)
          idleTimer = undefined
        }
        // Deaf for a while: whatever changed meanwhile is fetched now.
        if (!channel) {
          open()
          void queryClient.invalidateQueries({ queryKey: PRAYER_KEY })
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
      if (idleTimer !== undefined) window.clearTimeout(idleTimer)
      close()
    }
  }, [queryClient])
}
