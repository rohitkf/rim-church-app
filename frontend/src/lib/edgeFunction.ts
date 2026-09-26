import { supabase } from './supabaseClient'
import { EdgeFunctionRefusal } from './edgeFunctionRefusal'

export { EdgeFunctionRefusal }

/** The `{ error }` a function answered with, if its answer carried one. */
async function refusalIn(context: unknown): Promise<{ message: string; status: number | null } | null> {
  if (!(context instanceof Response)) return null
  try {
    const body: unknown = await context.clone().json()
    const message = (body as { error?: unknown } | null)?.error
    return typeof message === 'string' && message.trim()
      ? { message, status: context.status }
      : null
  } catch {
    return null
  }
}

/**
 * Call an edge function and get its reason when it says no.
 *
 * Our functions refuse with a status (409 for an address that already has
 * an account) and `{ error }` in the body. supabase-js turns any non-2xx
 * into "Edge Function returned a non-2xx status code" and leaves the body
 * on `error.context` unread — so that sentence, which names no cause, is
 * what the invite form was showing.
 */
export async function invokeEdgeFunction<T = unknown>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    const refusal = await refusalIn((error as { context?: unknown }).context)
    if (refusal) throw new EdgeFunctionRefusal(refusal.message, refusal.status)
    throw error
  }
  // A 200 carrying an error is still a refusal.
  const inBody = (data as { error?: unknown } | null)?.error
  if (typeof inBody === 'string' && inBody.trim()) throw new EdgeFunctionRefusal(inBody)
  return data as T
}
