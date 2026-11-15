/**
 * The parts of sending a batch that are only arithmetic: which
 * notifications a call is about, what goes to which device and in what
 * order, how many sends are out at once, and how a refusal is put into
 * words for App Health.
 *
 * Kept apart from index.ts, and free of anything only Deno has, so the
 * app's tests can run it (frontend/src/lib/pushBatch.test.ts).
 */

/** One phone or browser somebody has allowed notifications on. */
export interface Device {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

/** A notification and the devices it goes to, as `push_batch()` answers it (0290). */
export interface Waiting {
  id: string
  user_id: string
  type: string
  body: string | null
  reference_id: string | null
  devices: Device[]
}

/** The database sends a hundred ids to a call (0291); more than this in one is not the database. */
export const MOST_IDS = 500

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Which notifications a call is about.
 *
 * Two callers, both the database. Since 0291 it posts `{ ids: [...] }`,
 * everything one transaction wrote. Before it, a webhook posted one row as
 * `{ type, table, record }`; that is still read, so the function can be
 * deployed first and the webhook replaced after, with no push lost in
 * between. Anything else is nothing to do — and is answered 200, not an
 * error: a caller that passed the key check and sent nothing useful is
 * not a failure worth a line in App Health.
 */
export function idsFrom(body: unknown): string[] {
  if (typeof body !== 'object' || body === null) return []
  const { ids, record } = body as { ids?: unknown; record?: unknown }
  const given: unknown[] = Array.isArray(ids)
    ? ids
    : typeof record === 'object' && record !== null
      ? [(record as { id?: unknown }).id]
      : []
  const out = new Set<string>()
  for (const id of given) {
    if (typeof id === 'string' && UUID.test(id)) out.add(id.toLowerCase())
    if (out.size === MOST_IDS) break
  }
  return [...out]
}

/**
 * The batch turned round: each device once, with what is going to it, in
 * the order the database gave (oldest first).
 *
 * A device's own messages go one after another, because two of the same
 * kind share a tag and the later replaces the earlier on the lock screen:
 * sent side by side, which one stays would be chance.
 */
export function byDevice(batch: Waiting[]): { device: Device; rows: Waiting[] }[] {
  const parcels = new Map<string, { device: Device; rows: Waiting[] }>()
  for (const row of batch) {
    for (const device of row.devices ?? []) {
      const parcel = parcels.get(device.id)
      if (parcel) parcel.rows.push(row)
      else parcels.set(device.id, { device, rows: [row] })
    }
  }
  return [...parcels.values()]
}

/**
 * Do `work` for every item, no more than `limit` at a time.
 *
 * A batch can be a few hundred devices. All at once is what the old
 * one-call-a-person arrangement amounted to, and is what was slow.
 * `work` is expected to catch its own errors; one that does not stops
 * the rest and rejects.
 */
export async function inPool<T>(items: T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const lane = async () => {
    while (next < items.length) {
      const item = items[next]
      next += 1
      await work(item)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane))
}

/** What a failed send is counted under: the push service's status, or that it never answered. */
export function reasonFor(err: unknown): string {
  const status = (err as { statusCode?: unknown } | null)?.statusCode
  return typeof status === 'number' ? String(status) : 'no answer'
}

/** A subscription the browser has thrown away — an uninstalled app, a cleared profile. Not a failure. */
export const isGone = (err: unknown): boolean => {
  const status = (err as { statusCode?: unknown } | null)?.statusCode
  return status === 404 || status === 410
}

/**
 * One line for App Health, or null when nothing was refused:
 * "3 of 41 pushes did not reach a phone: 403 ×2, no answer ×1".
 */
export function failureLine(failed: Record<string, number>, attempted: number): string | null {
  const kinds = Object.entries(failed)
    .filter(([, n]) => n > 0)
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
  if (kinds.length === 0) return null
  const total = kinds.reduce((sum, [, n]) => sum + n, 0)
  const said = kinds.map(([reason, n]) => `${reason} ×${n}`).join(', ')
  return `${total} of ${attempted} ${attempted === 1 ? 'push' : 'pushes'} did not reach a phone: ${said}`
}
