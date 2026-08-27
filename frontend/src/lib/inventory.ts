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

export interface InventorySummary {
  assets: number
  consumables: number
  onLoan: number
  attention: number
}

export function summarise(items: InventoryItem[], todayIso: string): InventorySummary {
  return {
    assets: items.filter((i) => kindOf(i) === 'asset' && statusOf(i) !== 'retired').length,
    consumables: items.filter((i) => kindOf(i) === 'consumable').length,
    onLoan: items.filter((i) => statusOf(i) === 'on_loan').length,
    attention: items.filter((i) => needsAttention(i, todayIso)).length,
  }
}

/**
 * Free-text search over the fields someone would actually search by: the
 * tag they read off the label, the name they call it, the model, the
 * manufacturer's serial, and where it lives.
 */
export function matchesSearch(item: InventoryItem, term: string): boolean {
  const q = term.trim().toLowerCase()
  if (!q) return true
  return [item.asset_tag, item.name, item.model, item.serial_number, item.location, item.category]
    .filter((v): v is string => !!v)
    .some((v) => v.toLowerCase().includes(q))
}
