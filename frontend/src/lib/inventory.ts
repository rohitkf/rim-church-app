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
 * The cost recorded is always the cost of one — that is what the `unit`
 * beside it names. This used to multiply only for consumables, which was
 * right for every row that existed and quietly wrong for the first asset
 * anybody entered a pair of.
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
 * What one of a thing costs, said in its own units: "£1 per screw", "£249.99
 * each". To the penny, because a unit cost rounded to the pound turns 75p
 * into £1 and a count of forty into a lie.
 */
export function unitCostLabel(item: InventoryItem): string | null {
  const cost = typeof item.estimated_cost === 'string' ? Number(item.estimated_cost) : item.estimated_cost
  if (!cost || Number.isNaN(cost)) return null
  const unit = item.unit?.trim()
  const money = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: Number.isInteger(cost) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cost)
  return unit ? `${money} per ${unit}` : `${money} each`
}

/**
 * How many there are, in the words the register uses: "10 × screw".
 *
 * Multiplied rather than pluralised — the unit is stored as somebody typed
 * it, and an app that turns "box" into "boxs" is worse than one that does
 * not try.
 */
export function countLabel(item: InventoryItem): string {
  const unit = item.unit?.trim()
  return unit ? `${item.quantity} × ${unit}` : String(item.quantity)
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
  onLoan: number
  attention: number
  value: number
}

export function summarise(items: InventoryItem[], todayIso: string): InventorySummary {
  return {
    assets: items.filter((i) => kindOf(i) === 'asset' && statusOf(i) !== 'retired').length,
    consumables: items.filter((i) => kindOf(i) === 'consumable').length,
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
 * back as arithmetic. "10 screws at £1 each" is the whole point of the
 * count and the cost sitting next to each other, and a form that shows the
 * sum is one nobody has to take on trust.
 */
export function valueHint(quantity: string, cost: string, unit: string): string {
  const count = Math.max(Number(quantity) || 0, 0)
  const each = Number(cost)
  const named = unit.trim()
  if (!cost.trim() || Number.isNaN(each) || each <= 0) {
    return named ? `The cost of one ${named}, not of all of them.` : 'The cost of one, not of all of them.'
  }
  const money = (n: number) =>
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(n)
  const what = named ? `${count} × ${named}` : `${count}`
  return `${what} at ${money(each)} each — ${money(count * each)} on the register.`
}
