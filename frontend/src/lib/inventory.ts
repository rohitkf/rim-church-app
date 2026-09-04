import type { InventoryItem, InventoryStatus } from './types'

export const STATUS_LABEL: Record<InventoryStatus, string> = {
  in_service: 'In service',
  on_loan: 'Signed out',
  in_repair: 'In repair',
  missing: 'Missing',
  retired: 'Retired',
}

export const STATUS_TONE: Record<InventoryStatus, 'good' | 'warn' | 'bad' | 'neutral'> = {
  in_service: 'good',
  on_loan: 'warn',
  in_repair: 'warn',
  missing: 'bad',
  retired: 'neutral',
}

export const statusOf = (item: InventoryItem): InventoryStatus => item.item_status ?? 'in_service'
export const kindOf = (item: InventoryItem) => item.kind ?? 'asset'

/** A consumable at or below the level someone set to reorder at. */
export function isLowStock(item: InventoryItem): boolean {
  return (
    kindOf(item) === 'consumable' &&
    typeof item.reorder_level === 'number' &&
    item.quantity <= item.reorder_level
  )
}

/** Signed out and past the date it was due back. */
export function isOverdue(item: InventoryItem, todayIso: string): boolean {
  return statusOf(item) === 'on_loan' && !!item.due_back && item.due_back < todayIso
}

/** Anything a head should look at: lost, broken, overdue or running out. */
export function needsAttention(item: InventoryItem, todayIso: string): boolean {
  const status = statusOf(item)
  return status === 'missing' || status === 'in_repair' || isOverdue(item, todayIso) || isLowStock(item)
}

/**
 * What one line of the register is worth: the cost of one, times how many
 * there are. Ten screws at a pound each is ten pounds; one camera at nine
 * hundred is nine hundred.
 *
 * The cost recorded is always the cost of one. This used to multiply only
 * for consumables, which was right for every row that existed and quietly
 * wrong for the first asset anybody entered a pair of.
 *
 * Only kit in service counts. Something retired, missing or on the repair
 * bench is not value the church can rely on, and counting it quietly turns
 * the total into a comfort rather than a fact.
 */
export function itemValue(item: InventoryItem): number {
  const cost = typeof item.estimated_cost === 'string' ? Number(item.estimated_cost) : item.estimated_cost
  if (!cost || Number.isNaN(cost)) return 0
  if (statusOf(item) !== 'in_service') return 0
  // A row with no count is one of the thing, not none of it.
  return cost * Math.max(item.quantity ?? 1, 1)
}

export function totalValue(items: InventoryItem[]): number {
  return items.reduce((sum, item) => sum + itemValue(item), 0)
}

/**
 * What one of a thing costs: "£249.99 each". To the penny, because a cost
 * rounded to the pound turns 75p into £1 and a count of forty into a lie.
 *
 * There used to be a free-text unit beside it — "per screw", "per box" —
 * which asked everybody adding an item to name what one of it was before
 * they could price it. It bought nothing the count did not already say, so
 * a line is now simply a cost and a number of units, and the total is the
 * two multiplied.
 */
export function unitCostLabel(item: InventoryItem): string | null {
  const cost = typeof item.estimated_cost === 'string' ? Number(item.estimated_cost) : item.estimated_cost
  if (!cost || Number.isNaN(cost)) return null
  const money = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: Number.isInteger(cost) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cost)
  return `${money} each`
}

/** Money, rounded to whole units — nobody budgets a PA system in pence. */
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(amount)
}

export interface InventorySummary {
  assets: number
  consumables: number
  /** In the building and working — what the first tile counts. */
  inService: number
  onLoan: number
  attention: number
  value: number
}

export function summarise(items: InventoryItem[], todayIso: string): InventorySummary {
  return {
    // Counted exactly as the Assets chip counts them, retired kit
    // included, so the tiles and the chips cannot disagree.
    assets: items.filter((i) => kindOf(i) === 'asset').length,
    consumables: items.filter((i) => kindOf(i) === 'consumable').length,
    // From the status itself. The tile used to work this out as
    // assets + consumables − attention, which called a signed-out camera
    // in service and subtracted a low-stock consumable that was.
    inService: items.filter((i) => statusOf(i) === 'in_service').length,
    onLoan: items.filter((i) => statusOf(i) === 'on_loan').length,
    attention: items.filter((i) => needsAttention(i, todayIso)).length,
    value: totalValue(items),
  }
}

/**
 * Free-text search over the fields someone would actually search by: the
 * tag they read off the label, the name they call it, the brand and
 * model, the manufacturer's serial, and where it lives.
 */
export function matchesSearch(item: InventoryItem, term: string): boolean {
  const q = term.trim().toLowerCase()
  if (!q) return true
  return [
    item.asset_tag,
    item.name,
    item.brand,
    item.model,
    item.serial_number,
    item.location,
    item.category,
  ]
    .filter((v): v is string => !!v)
    .some((v) => v.toLowerCase().includes(q))
}

/**
 * What the register will actually count for a line being typed in, said
 * back as arithmetic. "3 at £249.99 each — £749.97 on the register" is the
 * whole point of the count and the cost sitting next to each other, and a
 * form that shows the sum is one nobody has to take on trust.
 */
export function valueHint(quantity: string, cost: string): string {
  const count = Math.max(Number(quantity) || 0, 0)
  const each = Number(cost)
  if (!cost.trim() || Number.isNaN(each) || each <= 0) {
    return 'The cost of one, not of all of them.'
  }
  const money = (n: number) =>
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(n)
  return `${count} at ${money(each)} each — ${money(count * each)} on the register.`
}

/* ------------------------------------------------------------------ *
 * The five chips above the register
 * ------------------------------------------------------------------ */

export type InventoryFilter = 'all' | 'assets' | 'consumables' | 'out' | 'attention'

export const FILTER_ORDER: InventoryFilter[] = ['all', 'assets', 'consumables', 'out', 'attention']

export const FILTER_LABEL: Record<InventoryFilter, string> = {
  all: 'Everything',
  assets: 'Assets',
  consumables: 'Consumables',
  out: 'Signed out',
  attention: 'Needs attention',
}

/**
 * What each chip means, in one sentence.
 *
 * The chips were five words and five numbers with nothing saying what put
 * an item in one pile rather than another — and "Assets 4, Consumables 0"
 * is unreadable to somebody who has never been told that the register
 * calls a camera one thing and a roll of gaffer tape another.
 */
export const FILTER_MEANING: Record<InventoryFilter, string> = {
  all: 'Everything on this team\u2019s register.',
  assets:
    'Things kept and reused — a camera, a cable, a stand. Each carries its own tag and its own history.',
  consumables:
    'Things used up and restocked — batteries, gaffer tape. Counted rather than tagged, with a level to reorder at.',
  out: 'Signed out to somebody, and not in the building.',
  attention:
    'Missing, on the repair bench, overdue back, or a consumable at or below its reorder level.',
}

/**
 * The one place that decides which chip an item belongs under.
 *
 * The counts and the filtering used to be written separately and had
 * drifted: the Assets chip counted assets that were not retired, and then
 * pressing it showed the retired ones as well. Both read this now, so a
 * chip cannot say four and show five.
 */
export function matchesFilter(
  item: InventoryItem,
  filter: InventoryFilter,
  todayIso: string,
): boolean {
  if (filter === 'assets') return kindOf(item) === 'asset'
  if (filter === 'consumables') return kindOf(item) === 'consumable'
  if (filter === 'out') return statusOf(item) === 'on_loan'
  if (filter === 'attention') return needsAttention(item, todayIso)
  return true
}

/** The number on each chip: how many rows pressing it would show. */
export function filterCounts(
  items: InventoryItem[],
  todayIso: string,
): Record<InventoryFilter, number> {
  const counts = {} as Record<InventoryFilter, number>
  for (const filter of FILTER_ORDER) {
    counts[filter] = items.filter((item) => matchesFilter(item, filter, todayIso)).length
  }
  return counts
}
