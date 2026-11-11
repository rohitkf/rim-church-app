import { supabase } from './supabaseClient'
import { subscribeToPush } from './push'

/**
 * Remember this browser so the server can reach it while the app is shut.
 *
 * Permission alone only buys notifications while the app is open; this is
 * the half that makes a phone buzz in a pocket. Safe to call again: the
 * browser hands back the subscription it already has, and the write is an
 * upsert keyed on the endpoint. False when this browser has no push to
 * register (no key in this build, or no PushManager).
 */
export async function registerPushDevice(): Promise<boolean> {
  const subscription = await subscribeToPush()
  if (!subscription?.endpoint) return false
  const { error } = await supabase.rpc('register_push_device', {
    p_endpoint: subscription.endpoint,
    p_p256dh: subscription.keys?.p256dh ?? '',
    p_auth: subscription.keys?.auth ?? '',
  })
  if (error) throw error
  return true
}
