import { describe, expect, it } from 'vitest'
import {
  WISHLIST_DEFAULT,
  buildInventoryWorkbook,
  inventoryFileName,
  itemsForExport,
  wishlistForExport,
  type InventoryExportFilters,
} from './inventoryExport'
import type { InventoryCategory, InventoryItem } from './types'
import type { PurchaseRequest } from './purchaseRequest'

const TODAY = '2026-10-26'

const item = (over: Partial<InventoryItem> & { id: string; name: string }): InventoryItem => ({
  department_id: 'media',
  quantity: 1,
  status: null,
  location: null,
  last_checked: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  kind: 'asset',
  item_status: 'in_service',
  ...over,
})

const shelves: InventoryCategory[] = [
  { id: 'cams', department_id: 'media', name: 'Cameras', sort_order: 1 },
  { id: 'cables', department_id: 'media', name: 'Cables', sort_order: 2 },
]

const items: InventoryItem[] = [
  item({ id: 'a', name: 'Sony camera', asset_tag: 'MED-001', category_id: 'cams', brand: 'Sony', estimated_cost: 900 }),
  item({
    id: 'b',
    name: 'Canon camera',
    asset_tag: 'MED-002',
    category_id: 'cams',
    item_status: 'on_loan',
    held_by: 'u2',
    holder: { id: 'u2', first_name: 'Asha', last_name: 'Mathew' },
    due_back: '2026-10-20',
    estimated_cost: '450.5',
  }),
  item({ id: 'c', name: 'XLR cable', asset_tag: 'MED-003', category_id: 'cables', item_status: 'in_repair' }),
  item({
    id: 'd',
    name: 'AA batteries',
    kind: 'consumable',
    quantity: 3,
    reorder_level: 5,
    estimated_cost: 0.75,
    category_id: 'cables',
  }),
  item({ id: 'e', name: 'Gaffer tape', kind: 'consumable', quantity: 20, reorder_level: 4, location: 'Store room' }),
  // Filed on a shelf that has since been deleted: Uncategorised, as on the page.
  item({ id: 'f', name: 'Old tripod', category_id: 'gone', item_status: 'missing' }),
  item({ id: 'g', name: 'Sound desk', department_id: 'audio', asset_tag: 'AUD-001', estimated_cost: 2000 }),
]

const base: InventoryExportFilters = { filter: 'all', search: '', shelf: 'all' }
const ids = (over: Partial<InventoryExportFilters>) =>
  itemsForExport(items, shelves, { ...base, ...over }, TODAY).map((i) => i.id)

describe('which items an inventory export takes', () => {
  it('takes everything with nothing narrowed', () => {
    expect(ids({})).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
  })

  it('follows each of the page’s filter chips exactly', () => {
    expect(ids({ filter: 'assets' })).toEqual(['a', 'b', 'c', 'f', 'g'])
    expect(ids({ filter: 'consumables' })).toEqual(['d', 'e'])
    expect(ids({ filter: 'out' })).toEqual(['b'])
    // Overdue back, on the repair bench, below its reorder level, missing.
    expect(ids({ filter: 'attention' })).toEqual(['b', 'c', 'd', 'f'])
  })

  it('searches the way the page does — tag, name, brand, location', () => {
    expect(ids({ search: 'camera' })).toEqual(['a', 'b'])
    expect(ids({ search: 'MED-003' })).toEqual(['c'])
    expect(ids({ search: 'sony' })).toEqual(['a'])
    expect(ids({ search: 'store room' })).toEqual(['e'])
    expect(ids({ search: 'nothing like this' })).toEqual([])
  })

  it('takes one shelf, or the items on none — a deleted shelf counting as none', () => {
    expect(ids({ shelf: 'cams' })).toEqual(['a', 'b'])
    expect(ids({ shelf: 'cables' })).toEqual(['c', 'd'])
    expect(ids({ shelf: null })).toEqual(['e', 'f', 'g'])
  })

  it('takes only the teams chosen', () => {
    expect(ids({ teamIds: new Set(['audio']) })).toEqual(['g'])
    expect(ids({ teamIds: new Set(['media']) })).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
    expect(ids({ teamIds: new Set() })).toEqual([])
  })

  it('applies every filter together', () => {
    expect(ids({ filter: 'attention', shelf: 'cables' })).toEqual(['c', 'd'])
    expect(ids({ filter: 'consumables', search: 'tape' })).toEqual(['e'])
    expect(ids({ filter: 'assets', shelf: 'cams', search: 'canon' })).toEqual(['b'])
    expect(ids({ filter: 'out', shelf: 'cables' })).toEqual([])
    expect(ids({ filter: 'assets', teamIds: new Set(['audio']) })).toEqual(['g'])
  })
})

const request = (over: Partial<PurchaseRequest> & { id: string; status: PurchaseRequest['status'] }): PurchaseRequest => ({
  department_id: 'media',
  requested_by: 'u2',
  item_name: 'Radio mic',
  kind: 'asset',
  quantity: 2,
  estimated_cost: 120,
  product_url: null,
  reason: 'The old ones drop out',
  decision_note: null,
  decided_at: null,
  created_at: '2026-10-01T09:00:00Z',
  inventory_item_id: null,
  requester: { first_name: 'Asha', last_name: 'Mathew' },
  decider: null,
  department: { name: 'Media', color: null },
  ...over,
})

const requests = [
  request({ id: 'r1', status: 'requested' }),
  request({ id: 'r2', status: 'approved' }),
  request({ id: 'r3', status: 'purchased' }),
  request({ id: 'r4', status: 'declined' }),
  request({ id: 'r5', status: 'requested', department_id: 'audio', department: { name: 'Audio', color: null } }),
]

describe('which wishlist lines an export takes', () => {
  it('takes what is still wanted by default', () => {
    expect(wishlistForExport(requests, WISHLIST_DEFAULT).map((r) => r.id)).toEqual(['r1', 'r2', 'r5'])
  })

  it('takes the statuses ticked, and only the teams chosen', () => {
    expect(wishlistForExport(requests, new Set(['purchased', 'declined'])).map((r) => r.id)).toEqual(['r3', 'r4'])
    expect(wishlistForExport(requests, WISHLIST_DEFAULT, new Set(['audio'])).map((r) => r.id)).toEqual(['r5'])
    expect(wishlistForExport(requests, new Set())).toEqual([])
  })
})

describe('the inventory workbook', () => {
  const one = new Map([['media', 'Media']])
  const media = items.filter((i) => i.department_id === 'media')

  it('writes one row per item, with money as numbers and value only for kit in service', () => {
    const [sheet] = buildInventoryWorkbook({ items: media, categories: shelves, teamNames: one, todayIso: TODAY })
    expect(sheet.name).toBe('Items')
    const col = (label: string) => sheet.columns.findIndex((c) => c.label === label)
    expect(col('Team')).toBe(-1)
    const row = (name: string) => sheet.rows.find((r) => r[col('Name')] === name)!

    expect(row('Sony camera')[col('Shelf')]).toBe('Cameras')
    expect(row('Sony camera')[col('Cost each (£)')]).toBe(900)
    expect(row('Sony camera')[col('Value in service (£)')]).toBe(900)

    // Signed out: who has it and when it was due, no value in service, overdue.
    const canon = row('Canon camera')
    expect(canon[col('Status')]).toBe('Signed out')
    expect(canon[col('Signed out to')]).toBe('Asha Mathew')
    expect(canon[col('Due back')]).toBe('2026-10-20')
    expect(canon[col('Cost each (£)')]).toBe(450.5)
    expect(canon[col('Value in service (£)')]).toBeNull()
    expect(canon[col('Needs attention')]).toBe('Overdue back')

    const batteries = row('AA batteries')
    expect(batteries[col('Kind')]).toBe('Consumable')
    expect(batteries[col('Quantity')]).toBe(3)
    expect(batteries[col('Reorder at')]).toBe(5)
    expect(batteries[col('Value in service (£)')]).toBe(2.25)
    expect(batteries[col('Needs attention')]).toBe('Low stock')

    expect(row('Old tripod')[col('Shelf')]).toBe('Uncategorised')
    expect(row('Old tripod')[col('Needs attention')]).toBe('Missing')
    expect(row('XLR cable')[col('Needs attention')]).toBe('In repair')
    expect(row('Gaffer tape')[col('Needs attention')]).toBeNull()
    expect(sheet.rows).toHaveLength(6)
  })

  it('names the team on every row when there is more than one', () => {
    const [sheet] = buildInventoryWorkbook({
      items,
      categories: shelves,
      teamNames: new Map([
        ['media', 'Media'],
        ['audio', 'Audio'],
      ]),
      todayIso: TODAY,
    })
    expect(sheet.columns[0].label).toBe('Team')
    expect(sheet.rows.find((r) => r.includes('Sound desk'))![0]).toBe('Audio')
  })

  it('adds the wishlist as its own sheet only when asked, with totals', () => {
    expect(buildInventoryWorkbook({ items: media, categories: shelves, teamNames: one, todayIso: TODAY })).toHaveLength(1)
    const sheets = buildInventoryWorkbook({
      items: media,
      categories: shelves,
      teamNames: one,
      wishlist: wishlistForExport(requests, WISHLIST_DEFAULT, new Set(['media'])),
      todayIso: TODAY,
    })
    expect(sheets.map((s) => s.name)).toEqual(['Items', 'Wishlist'])
    const wish = sheets[1]
    const col = (label: string) => wish.columns.findIndex((c) => c.label === label)
    expect(wish.rows).toHaveLength(2)
    expect(wish.rows[0][col('Item')]).toBe('Radio mic')
    expect(wish.rows[0][col('Total (£)')]).toBe(240)
    expect(wish.rows.map((r) => r[col('Status')])).toEqual(['Asked for', 'Approved'])
    expect(wish.rows[0][col('Asked for by')]).toBe('Asha Mathew')
    expect(wish.rows[0][col('Asked on')]).toBe('2026-10-01')
  })

  it('is named for the team and the day', () => {
    const now = new Date('2026-10-26T10:00:00Z')
    expect(inventoryFileName('Media & Tech', now)).toBe('rim-inventory-media-tech-2026-10-26.xlsx')
    expect(inventoryFileName(null, now)).toBe('rim-inventory-all-teams-2026-10-26.xlsx')
  })
})
