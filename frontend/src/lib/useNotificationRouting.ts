import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Clicking a system notification lands you on the page it came from.
 *
 * The service worker focuses an open window and posts the destination
 * here rather than navigating it itself: routing through the router keeps
 * the app's history and its loaded state, where a worker-side navigate
 * would reload the whole thing to reach a page it is already on.
 */
export function useNotificationRouting() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; href?: string } | undefined
      // Only same-origin paths: a message is not a reason to send someone
      // to an address the app didn't choose.
      if (data?.type === 'NOTIFICATION_CLICK' && data.href?.startsWith('/')) {
        navigate(data.href)
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    // Required by the spec and by Safari: a container's message queue stays
    // shut until this is called or `onmessage` is assigned, and a queue
    // that never opens is a notification whose click goes nowhere. Chrome
    // is lenient about it; iOS — the platform this feature is for — is not.
    navigator.serviceWorker.startMessages?.()
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [navigate])
}
