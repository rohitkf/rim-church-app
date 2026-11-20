import { checkedInToday, type OrderRow } from './registrations'

/**
 * Reception's list of registrations, sorted into what the door is looking
 * for and what it has finished with.
 *
 * It was one list by name. By the middle of an evening most of it was
 * people already inside, and whoever was standing at the desk had to be
 * found among them. So: whoever is still to check in comes first and is
 * the list; today's check-ins and the cancelled are kept under it, shut,
 * for the times one is wanted — to undo a slip, to answer "did she come?".
 *
 * "Checked in" means today (`checkedInToday`): on the second day of an
 * event somebody who came on the first is still to check in.
 *
 * Today's check-ins are latest first, so the one just pressed is the first
 * thing under the heading when it is opened to take it back.
 */
export function doorGroups<T extends Pick<OrderRow, 'name' | 'status' | 'checked_in_at'>>(
  orders: T[],
  now = new Date(),
): { waiting: T[]; checkedIn: T[]; cancelled: T[] } {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name)
  const live = orders.filter((o) => o.status !== 'cancelled')
  return {
    waiting: live.filter((o) => !checkedInToday(o, now)).sort(byName),
    checkedIn: live.filter((o) => checkedInToday(o, now)).sort((a, b) => b.checked_in_at!.localeCompare(a.checked_in_at!) || byName(a, b)),
    cancelled: orders.filter((o) => o.status === 'cancelled').sort(byName),
  }
}
