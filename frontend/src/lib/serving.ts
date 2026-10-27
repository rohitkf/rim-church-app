/**
 * Availability, the rota and the checklists are one job done in order.
 *
 * You say whether you can serve; a head builds the rota out of those
 * answers; and only somebody the rota put on has a checklist to tick. Three
 * pages in the menu made that look like three unrelated things, so they
 * are one destination now — Serving — with a tab for each step.
 *
 * Each tab keeps its own address. A notification that says "your team is
 * waiting on you" still lands on /availability, a link to the rota is
 * still /rota, and each page keeps its own rule in Settings › Access &
 * privileges, because the three are not open to the same people: the
 * rota can be opened to Church Members, the other two need a team.
 */
export const SERVING_PATH = '/serving'

export const SERVING_TABS: { to: string; label: string; hint: string }[] = [
  { to: '/availability', label: 'Availability', hint: 'Who can serve' },
  { to: '/rota', label: 'Team Rota', hint: 'Who is on' },
  { to: '/call-times', label: 'Call Times', hint: 'When to be there' },
  { to: '/checklists', label: 'Checklists', hint: 'What to do on the day' },
]

/** Whether this address is one of the Serving tabs (or somewhere inside one). */
export function isServingPath(pathname: string): boolean {
  return (
    pathname === SERVING_PATH ||
    SERVING_TABS.some((tab) => pathname === tab.to || pathname.startsWith(`${tab.to}/`))
  )
}

/**
 * Which step Serving opens on: the one that is waiting for you.
 *
 * Judged on the next service day (the soonest with services, today
 * included), because that is the Sunday in front of everybody:
 *
 *   - put on the rota for it      → Checklists: the rota has spoken, and
 *                                   what is left is your list for the day
 *   - not yet answered for it     → Availability: every team you are on
 *                                   or lead, for every service that day
 *   - answered, not on the rota   → Team Rota: see who was put on
 *
 * Somebody on no team has nothing to answer, so they start on the rota.
 * A step this person may not open is passed over for the next one that
 * they may.
 */
export function servingStep({
  canOpen,
  nextDayServiceIds,
  myTeamIds,
  answered,
  onRota,
}: {
  canOpen: (path: string) => boolean
  /** The services on the next service day. */
  nextDayServiceIds: string[]
  /** Teams this person answers for: their roster and the ones they lead. */
  myTeamIds: string[]
  /** Their answers, as (service, team) pairs. */
  answered: { service_id: string; department_id: string }[]
  /** Services they are on the rota for. */
  onRota: string[]
}): string {
  const order = (preferred: string) => {
    const at = SERVING_TABS.findIndex((t) => t.to === preferred)
    const pick = [...SERVING_TABS.slice(at), ...SERVING_TABS.slice(0, at)].find((t) => canOpen(t.to))
    return pick?.to ?? '/'
  }

  const day = new Set(nextDayServiceIds)
  if (onRota.some((id) => day.has(id))) return order('/checklists')

  const given = new Set(answered.map((a) => `${a.service_id}:${a.department_id}`))
  const stillToAnswer = nextDayServiceIds.some((s) => myTeamIds.some((t) => !given.has(`${s}:${t}`)))
  if (stillToAnswer) return order('/availability')

  return order('/rota')
}
