/**
 * Which service is happening right now.
 *
 * The rota lists several services at once, and during a service the one on
 * the platform is the only one anybody cares about. A service's window is
 * its running order: from the first session's start to the end of the last,
 * plus a little either side — people arrive before the first item and the
 * room does not empty on the last second.
 *
 * A service with no running order planned has no window and is never
 * "live": guessing one from the date alone would light up every service on
 * a Sunday, which is worse than lighting up none.
 */

/** Doors open this long before the first session. */
export const LEAD_IN_MINUTES = 30
/** And it is still "now" this long after the last one ends. */
export const RUN_OUT_MINUTES = 15

export interface SessionLike {
  service_id: string
  start_time: string
  duration_minutes?: number | null
}

export interface ServiceWindow {
  from: number
  to: number
}

/** The live window per service, keyed by service id. */
export function serviceWindows(sessions: SessionLike[]): Map<string, ServiceWindow> {
  const windows = new Map<string, ServiceWindow>()

  for (const session of sessions) {
    const start = new Date(session.start_time).getTime()
    if (Number.isNaN(start)) continue
    const end = start + (session.duration_minutes ?? 0) * 60_000
    const current = windows.get(session.service_id)
    windows.set(session.service_id, {
      from: Math.min(current?.from ?? start, start),
      to: Math.max(current?.to ?? end, end),
    })
  }

  for (const [id, w] of windows) {
    windows.set(id, { from: w.from - LEAD_IN_MINUTES * 60_000, to: w.to + RUN_OUT_MINUTES * 60_000 })
  }
  return windows
}

/** Whether a service is on right now. */
export function isLiveNow(
  serviceId: string,
  windows: Map<string, ServiceWindow>,
  now: number = Date.now(),
): boolean {
  const window = windows.get(serviceId)
  return !!window && now >= window.from && now <= window.to
}
