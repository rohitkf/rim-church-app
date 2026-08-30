/**
 * Which services the rota puts in front of you.
 *
 * An Admin is planning, so they want the next few. Everyone else is asking
 * one question — "what am I on?" — and the answer has to include it however
 * far out it is.
 *
 * This used to show a member only the nearest day, on the reasoning that the
 * rota is about the service in front of you. It reads well on a screen
 * backstage and fails the person it is for: a volunteer told on Sunday that
 * they are on next Sunday opened this page, saw two services they were not
 * on, and concluded the app had lost their assignment.
 */

export interface WindowedService {
  id: string
  date: string
  service_type: string
}

export function servicesToShow<T extends WindowedService>(
  services: T[],
  today: string,
  {
    limit,
    /** Services this person is actually on, which are never left out. */
    mine = new Set<string>(),
  }: { limit: number; mine?: ReadonlySet<string> },
): T[] {
  const ahead = services
    .filter((s) => s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.service_type.localeCompare(b.service_type))

  const shown = ahead.slice(0, limit)
  const inWindow = new Set(shown.map((s) => s.id))

  // Anything further out that this person is on gets added back. It stays in
  // date order, so "what is next" still reads down the page.
  const alsoMine = ahead.filter((s) => !inWindow.has(s.id) && mine.has(s.id))
  return alsoMine.length === 0 ? shown : [...shown, ...alsoMine]
}
