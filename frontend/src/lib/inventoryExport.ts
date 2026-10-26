/**
 * The inventory, as a workbook.
 *
 * Which items go into the file, and what each column says about them, are
 * decided here, away from the dialog and the spreadsheet library, so both
 * can be tested on their own: a filter that quietly drops a row is exactly
 * the kind of mistake nobody notices until the insurer asks for the list.
 *
 * The filters are the page's own — the same chips, decided by the same
 * `matchesFilter` and `matchesSearch` — so "Needs attention" in the export
 * means what it means on screen. On top of them, a shelf, the teams (on the
 * all-teams page), and any single item unticked by hand.
 */
import type { InventoryCategory, InventoryItem } from './types'
import type { ExportCell, ExportSheet } from './volunteerExport'
import type { PurchaseRequest } from './purchaseRequest'
import { UNCATEGORISED_LABEL } from './inventoryCategories'
import {
  STATUS_LABEL,
  isLowStock,
  isOverdue,
  itemValue,
  kindOf,
  matchesFilter,
  matchesSearch,
  statusOf,
  type InventoryFilter,
} from './inventory'

/** Every shelf, or one of them; `null` is the items filed on none. */
export type ShelfChoice = 'all' | string | null

export interface InventoryExportFilters {
  filter: InventoryFilter
  search: string
  shelf: ShelfChoice
  /** The teams to take. Absent means every team the items belong to. */
  teamIds?: ReadonlySet<string>
}

export type WishlistStatus = PurchaseRequest['status']

export const WISHLIST_STATUSES: WishlistStatus[] = ['requested', 'approved', 'purchased', 'declined']

export const WISHLIST_STATUS_LABEL: Record<WishlistStatus, string> = {
  requested: 'Asked for',
  approved: 'Approved',
  purchased: 'Bought',
  declined: 'Declined',
}

/** Still wanted: the wishlist's open asks, which is what a list to buy from is. */
export const WISHLIST_DEFAULT: ReadonlySet<WishlistStatus> = new Set(['requested', 'approved'])

/**
 * The items a set of filters leaves, in the register's own order.
 *
 * A shelf the team has since deleted leaves its id behind on the item; the
 * page files such an item under Uncategorised, and so does this.
 */
export function itemsForExport(
  items: InventoryItem[],
  categories: InventoryCategory[],
  filters: InventoryExportFilters,
  todayIso: string,
): InventoryItem[] {
  const known = new Set(categories.map((c) => c.id))
  return items.filter((item) => {
    if (filters.teamIds && !filters.teamIds.has(item.department_id)) return false
    if (filters.shelf !== 'all') {
      const shelf = item.category_id && known.has(item.category_id) ? item.category_id : null
      if (shelf !== filters.shelf) return false
    }
    return matchesSearch(item, filters.search) && matchesFilter(item, filters.filter, todayIso)
  })
}

/** The wishlist lines to take: the teams chosen, the statuses ticked. */
export function wishlistForExport(
  requests: PurchaseRequest[],
  statuses: ReadonlySet<WishlistStatus>,
  teamIds?: ReadonlySet<string>,
): PurchaseRequest[] {
  return requests.filter(
    (r) => statuses.has(r.status) && (!teamIds || teamIds.has(r.department_id)),
  )
}

const cost = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'string' ? Number(value) : value
  return Number.isNaN(n) ? null : Math.round(n * 100) / 100
}

const day = (iso: string | null | undefined): string | null => (iso ? iso.slice(0, 10) : null)

const CONDITION_LABEL = { good: 'Good', fair: 'Fair', poor: 'Poor' } as const

export interface InventoryWorkbookInput {
  items: InventoryItem[]
  categories: InventoryCategory[]
  /** Team names by id, for the Team column. */
  teamNames: Map<string, string>
  /** Absent leaves the Wishlist sheet out. */
  wishlist?: PurchaseRequest[]
  todayIso: string
}

/**
 * One sheet of items, and — when asked for — one of the wishlist.
 *
 * Money is written as numbers, not "£249.99", so the sheet can add a
 * column up; Value is the page's own (in-service kit only), and says so in
 * its heading.
 */
export function buildInventoryWorkbook(input: InventoryWorkbookInput): ExportSheet[] {
  const shelfName = new Map(input.categories.map((c) => [c.id, c.name]))
  const multiTeam = new Set(input.items.map((i) => i.department_id)).size > 1 || input.teamNames.size > 1

  const itemColumns = [
    ...(multiTeam ? [{ label: 'Team', width: 16 }] : []),
    { label: 'Shelf', width: 18 },
    { label: 'Tag', width: 12 },
    { label: 'Name', width: 28 },
    { label: 'Kind', width: 12 },
    { label: 'Status', width: 12 },
    { label: 'Condition', width: 10 },
    { label: 'Brand', width: 14 },
    { label: 'Model', width: 16 },
    { label: 'Serial number', width: 18 },
    { label: 'Quantity', width: 9 },
    { label: 'Reorder at', width: 10 },
    { label: 'Cost each (£)', width: 12 },
    { label: 'Value in service (£)', width: 16 },
    { label: 'Location', width: 18 },
    { label: 'Signed out to', width: 18 },
    { label: 'Due back', width: 11 },
    { label: 'Needs attention', width: 15 },
    { label: 'Last checked', width: 12 },
    { label: 'Notes', width: 30 },
    { label: 'Product link', width: 30 },
  ]

  const attention = (item: InventoryItem): string | null => {
    const why: string[] = []
    const status = statusOf(item)
    if (status === 'missing') why.push('Missing')
    if (status === 'in_repair') why.push('In repair')
    if (isOverdue(item, input.todayIso)) why.push('Overdue back')
    if (isLowStock(item)) why.push('Low stock')
    return why.length ? why.join(', ') : null
  }

  const itemRows: ExportCell[][] = input.items.map((item) => {
    const value = itemValue(item)
    return [
      ...(multiTeam ? [input.teamNames.get(item.department_id) ?? null] : []),
      (item.category_id && shelfName.get(item.category_id)) || UNCATEGORISED_LABEL,
      item.asset_tag ?? null,
      item.name,
      kindOf(item) === 'consumable' ? 'Consumable' : 'Asset',
      STATUS_LABEL[statusOf(item)],
      item.item_condition ? CONDITION_LABEL[item.item_condition] : null,
      item.brand ?? null,
      item.model ?? null,
      item.serial_number ?? null,
      item.quantity,
      typeof item.reorder_level === 'number' ? item.reorder_level : null,
      cost(item.estimated_cost),
      value > 0 ? Math.round(value * 100) / 100 : null,
      item.location ?? null,
      statusOf(item) === 'on_loan' && item.holder ? `${item.holder.first_name} ${item.holder.last_name}` : null,
      statusOf(item) === 'on_loan' ? day(item.due_back) : null,
      attention(item),
      day(item.last_audited_at),
      item.notes ?? null,
      item.product_url ?? null,
    ]
  })

  const sheets: ExportSheet[] = [{ name: 'Items', columns: itemColumns, rows: itemRows }]

  if (input.wishlist) {
    const wishMulti = multiTeam || new Set(input.wishlist.map((r) => r.department_id)).size > 1
    sheets.push({
      name: 'Wishlist',
      columns: [
        ...(wishMulti ? [{ label: 'Team', width: 16 }] : []),
        { label: 'Item', width: 28 },
        { label: 'Kind', width: 12 },
        { label: 'Quantity', width: 9 },
        { label: 'Cost each (£)', width: 12 },
        { label: 'Total (£)', width: 11 },
        { label: 'Status', width: 11 },
        { label: 'Asked for by', width: 18 },
        { label: 'Asked on', width: 11 },
        { label: 'Why', width: 30 },
        { label: 'Decision note', width: 26 },
        { label: 'Link', width: 30 },
      ],
      rows: input.wishlist.map((r) => {
        const each = cost(r.estimated_cost)
        return [
          ...(wishMulti ? [r.department?.name ?? input.teamNames.get(r.department_id) ?? null] : []),
          r.item_name,
          r.kind === 'consumable' ? 'Consumable' : r.kind === 'asset' ? 'Asset' : null,
          r.quantity,
          each,
          each === null ? null : Math.round(each * Math.max(r.quantity, 1) * 100) / 100,
          WISHLIST_STATUS_LABEL[r.status],
          r.requester ? `${r.requester.first_name} ${r.requester.last_name}` : null,
          day(r.created_at),
          r.reason,
          r.decision_note,
          r.product_url,
        ]
      }),
    })
  }

  return sheets
}

/** Dated, and named for the team when it is one, so files don't overwrite each other. */
export function inventoryFileName(teamName: string | null, now: Date = new Date()): string {
  const who = teamName ? teamName.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() : 'all-teams'
  return `rim-inventory-${who}-${now.toISOString().slice(0, 10)}.xlsx`
}
