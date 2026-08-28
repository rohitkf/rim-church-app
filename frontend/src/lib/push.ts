import { notificationHref, notificationLabel } from './notificationLink'

/**
 * System notifications, in the two forms a web app can have them.
 *
 * **While the app is running** — including a backgrounded tab or a
 * minimised installed app — a notification that arrives over Realtime can
 * be shown straight from the page. This needs nothing but permission, and
 * it is what most people will actually experience.
 *
 * **While the app is closed** — the phone in a pocket on a Saturday night —
 * needs Web Push: a subscription registered with the browser's push
 * service, stored server-side, and a server that signs a message with a
 * VAPID key. That half is only available when `VITE_VAPID_PUBLIC_KEY` is
 * configured; without it the app quietly offers the first form alone
 * rather than a button that cannot work.
 */

export type PushPermission = 'unsupported' | 'default' | 'granted' | 'denied'

/** The public half of the server's VAPID key pair, if this build has one. */
export const VAPID_PUBLIC_KEY: string | undefined = import.meta.env.VITE_VAPID_PUBLIC_KEY

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator
}

/** Whether the closed-app half is available: needs a key and PushManager. */
export function webPushSupported(): boolean {
  return notificationsSupported() && 'PushManager' in window && !!VAPID_PUBLIC_KEY
}

export function permissionState(): PushPermission {
  if (!notificationsSupported()) return 'unsupported'
  return Notification.permission as PushPermission
}

/**
 * Ask for permission.
 *
 * Browsers only honour this from a user gesture, and iOS only honours it at
 * all in an installed app — so this is called from a button, never on load.
 */
export async function requestPermission(): Promise<PushPermission> {
  if (!notificationsSupported()) return 'unsupported'
  try {
    return (await Notification.requestPermission()) as PushPermission
  } catch {
    // Older Safari's callback-style API rejects the promise form.
    return permissionState()
  }
}

/** VAPID keys travel as base64url; PushManager wants the bytes. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Subscribe this browser to push, returning what the server needs to reach
 * it. Null when push isn't available — permission refused, no VAPID key, a
 * browser without PushManager — which callers treat as "in-app only".
 */
export async function subscribeToPush(): Promise<PushSubscriptionJSON | null> {
  if (!webPushSupported() || permissionState() !== 'granted') return null
  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  if (existing) return existing.toJSON()
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!) as BufferSource,
  })
  return subscription.toJSON()
}

/** Stop this browser receiving push. Returns the endpoint that was dropped. */
export async function unsubscribeFromPush(): Promise<string | null> {
  if (!notificationsSupported() || !('PushManager' in window)) return null
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return null
  const { endpoint } = subscription
  await subscription.unsubscribe()
  return endpoint
}

/**
 * Show a notification for something that arrived while the app was running.
 *
 * Through the service worker rather than `new Notification()`, because that
 * constructor does nothing on Android and the worker's notification is the
 * one whose click the worker can act on.
 */
export async function showLocalNotification(type: string, referenceId?: string | null) {
  if (permissionState() !== 'granted') return
  try {
    const registration = await navigator.serviceWorker.ready
    await registration.showNotification('Rehoboth International Ministries', {
      body: notificationLabel(type),
      icon: '/icon-192.png',
      badge: '/badge-96.png',
      // One notification per kind, so ten new posts are one line rather
      // than ten — a phone that buzzes ten times gets silenced.
      tag: type,
      data: { href: notificationHref(type, referenceId) },
    })
  } catch {
    // A worker that isn't ready costs a notification, not the app.
  }
}
