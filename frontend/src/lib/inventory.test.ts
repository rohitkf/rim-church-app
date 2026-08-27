import { describe, expect, it } from 'vitest'
import { isLowStock, isOverdue, matchesSearch, needsAttention, summarise } from './inventory'
import type { InventoryItem } from './types'

const base: InventoryItem = {
  id: 'i1',
  department_id: 'd1',
  name: 'Camera A',
  quantity: 1,
  status: null,
  location: 'Cupboard A',
  last_checked: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  asset_tag: 'MED-CAM-0001',
  kind: 'asset',
  item_status: 'in_service',
}
const item = (over: Partial<InventoryItem>): InventoryItem => ({ ...base, ...over })

describe('isLowStock', () => {
  it('is about consumables at or under their reorder level', () => {
    expect(isLowStock(item({ kind: 'consumable', quantity: 4, reorder_level: 10 }))).toBe(true)
    expect(isLowStock(item({ kind: 'consumable', quantity: 10, reorder_level: 10 }))).toBe(true)
    expect(isLowStock(item({ kind: 'consumable', quantity: 11, reorder_level: 10 }))).toBe(false)
  })

  it('never applies to an asset, or to a consumable with no level set', () => {
    expect(isLowStock(item({ quantity: 0 }))).toBe(false)
    expect(isLowStock(item({ kind: 'consumable', quantity: 0, reorder_level: null }))).toBe(false)
  })
})

describe('isOverdue', () => {
  it('is a signed-out item past its due date', () => {
    expect(isOverdue(item({ item_status: 'on_loan', due_back: '2026-08-20' }), '2026-08-27')).toBe(true)
    expect(isOverdue(item({ item_status: 'on_loan', due_back: '2026-08-27' }), '2026-08-27')).toBe(false)
    expect(isOverdue(item({ item_status: 'on_loan', due_back: null }), '2026-08-27')).toBe(false)
    expect(isOverdue(item({ due_back: '2026-01-01' }), '2026-08-27')).toBe(false)
  })
})

describe('needsAttention', () => {
  it('gathers everything a head should look at', () => {
    expect(needsAttention(item({ item_status: 'missing' }), '2026-08-27')).toBe(true)
    expect(needsAttention(item({ item_status: 'in_repair' }), '2026-08-27')).toBe(true)
    expect(needsAttention(item({ item_status: 'on_loan', due_back: '2026-08-01' }), '2026-08-27')).toBe(true)
    expect(needsAttention(item({ kind: 'consumable', quantity: 2, reorder_level: 5 }), '2026-08-27')).toBe(true)
  })

  it('leaves alone what is where it should be', () => {
    expect(needsAttention(item({}), '2026-08-27')).toBe(false)
    expect(needsAttention(item({ item_status: 'on_loan', due_back: '2026-09-30' }), '2026-08-27')).toBe(false)
  })
})

describe('summarise', () => {
  it('counts each thing once, and leaves retired kit out of the asset count', () => {
    const summary = summarise(
      [
        item({ id: '1' }),
        item({ id: '2', item_status: 'on_loan', due_back: '2026-08-01' }),
        item({ id: '3', item_status: 'retired' }),
        item({ id: '4', kind: 'consumable', quantity: 1, reorder_level: 5 }),
      ],
      '2026-08-27',
    )
    expect(summary).toEqual({ assets: 2, consumables: 1, onLoan: 1, attention: 2 })
  })
})

describe('matchesSearch', () => {
  const camera = item({ model: 'Sony FX3', serial_number: 'SN-11' })

  it('searches the fields someone would actually type', () => {
    expect(matchesSearch(camera, 'med-cam')).toBe(true)
    expect(matchesSearch(camera, 'fx3')).toBe(true)
    expect(matchesSearch(camera, 'sn-11')).toBe(true)
    expect(matchesSearch(camera, 'cupboard')).toBe(true)
    expect(matchesSearch(camera, 'tripod')).toBe(false)
  })

  it('matches everything when nothing has been typed', () => {
    expect(matchesSearch(camera, '   ')).toBe(true)
  })
})
