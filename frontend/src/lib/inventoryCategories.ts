/**
 * The shelves a team files its inventory on.
 *
 * A flat register is fine at four items and useless at forty: Media alone
 * runs cameras, cables, audio, storage and stands, and finding the memory
 * cards means reading past all of it. A category is a heading a team names
 * for itself — what Media needs to separate is not what Hospitality does.
 *
 * Not to be confused with an item's `category` text, which is a different
 * thing wearing the same word: that one is asked for once when an item is
 * added, three letters of it become the middle of the asset tag, and it is
 * never seen again. This is the shelf, and it can be changed whenever the
 * team rearranges.
 */
import type { InventoryCategory } from './types'

/** What the items nobody has filed are gathered under. */
export const UNCATEGORISED_LABEL = 'Uncategorised'

export interface CategoryGroup<T> {
  /** Null for the run of items that are on no shelf. */
  id: string | null
  name: string
  items: T[]
}

interface Filed {
  category_id?: string | null
}

/**
 * The register, in the order it should be read.
 *
 * Named shelves first, in the order the team put them in; whatever is on
 * no shelf last, under its own heading. Last rather than first because an
 * uncategorised pile is the leftovers — a team that has bothered to sort
 * its cables should not have to scroll past the unsorted to reach them.
 *
 * An empty shelf still comes back, so a team can see that it exists and
 * file something onto it. A caller that would rather not show empty ones
 * to somebody who cannot fill them can drop them; that is a question about
 * who is looking, which this does not know.
 */
export function groupByCategory<T extends Filed>(
  items: T[],
  categories: InventoryCategory[],
): CategoryGroup<T>[] {
  const inOrder = [...categories].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
  )
  const known = new Set(inOrder.map((c) => c.id))

  const groups: CategoryGroup<T>[] = inOrder.map((category) => ({
    id: category.id,
    name: category.name,
    items: items.filter((item) => item.category_id === category.id),
  }))

  // Anything with no shelf, and anything pointing at a shelf this team can
  // no longer see — a category deleted in another tab leaves the id behind
  // on the row until the page reloads, and those items must not vanish.
  const loose = items.filter((item) => !item.category_id || !known.has(item.category_id))
  if (loose.length > 0) {
    groups.push({ id: null, name: UNCATEGORISED_LABEL, items: loose })
  }
  return groups
}

/**
 * Whether the page is worth splitting into headings at all.
 *
 * A team that has named no shelves gets the plain list it has always had.
 * A single heading over the only group on the page labels a distinction
 * that does not exist.
 */
export function worthGrouping(categories: InventoryCategory[]): boolean {
  return categories.length > 0
}

/** The picker's options: every shelf, plus the way back off one. */
export function categoryOptions(categories: InventoryCategory[]) {
  const inOrder = [...categories].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
  )
  return [
    { value: '', label: UNCATEGORISED_LABEL },
    ...inOrder.map((c) => ({ value: c.id, label: c.name })),
  ]
}

/** The next shelf goes on the end. */
export function nextCategoryOrder(categories: InventoryCategory[]): number {
  return categories.reduce((top, c) => Math.max(top, c.sort_order), -1) + 1
}

/**
 * A heading or an item, in the order they are drawn.
 *
 * The register is rendered twice — cards on a phone, a table on a desk —
 * and both had one loop over a flat list. Flattening the groups back into
 * a single stream with headings in it keeps that shape, so grouping did
 * not mean rewriting two hundred lines of markup that were working.
 *
 * `groups` of null means the team has named no shelves: the stream is then
 * exactly the flat list it always was, with no headings at all.
 */
export type Row<T> =
  | { kind: 'heading'; id: string | null; name: string; count: number }
  | { kind: 'item'; item: T }

export function rowsForGroups<T>(groups: CategoryGroup<T>[] | null, flat: T[]): Row<T>[] {
  if (!groups) return flat.map((item) => ({ kind: 'item', item }))
  return groups.flatMap((group) => [
    { kind: 'heading' as const, id: group.id, name: group.name, count: group.items.length },
    ...group.items.map((item) => ({ kind: 'item' as const, item })),
  ])
}
