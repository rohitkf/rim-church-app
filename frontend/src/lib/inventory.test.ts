import { describe, expect, it } from 'vitest'
import {
  countLabel,
  isLowStock,
  isOverdue,
  itemValue,
  matchesSearch,
  needsAttention,
  summarise,
  totalValue,
  unitCostLabel,
  valueHint,
} from './inventory'
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
    expect(summary).toMatchObject({ assets: 2, consumables: 1, onLoan: 1, attention: 2 })
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

describe('itemValue', () => {
  const priced = (over: Partial<InventoryItem>) => item({ estimated_cost: 100, ...over })

  it('counts the cost of one, however many there are', () => {
    expect(itemValue(priced({}))).toBe(100)
    expect(itemValue(priced({ kind: 'consumable', quantity: 7 }))).toBe(700)
    // Ten screws at a pound each is ten pounds — and a pair of anything is
    // two of it, whether the register calls it an asset or a consumable.
    expect(itemValue(priced({ estimated_cost: 1, kind: 'consumable', quantity: 10 }))).toBe(10)
    expect(itemValue(priced({ quantity: 2 }))).toBe(200)
  })

  it('counts nothing that is not in service', () => {
    for (const status of ['on_loan', 'in_repair', 'missing', 'retired'] as const) {
      expect(itemValue(priced({ item_status: status }))).toBe(0)
    }
  })

  it('treats an unpriced item as nothing rather than guessing', () => {
    expect(itemValue(item({ estimated_cost: null }))).toBe(0)
    expect(itemValue(item({}))).toBe(0)
  })

  it('reads a numeric column that arrives as a string', () => {
    expect(itemValue(priced({ estimated_cost: '249.99' }))).toBe(249.99)
  })

  it('treats a missing count as one of the thing', () => {
    expect(itemValue(priced({ quantity: 0 }))).toBe(100)
  })

  it('adds up only what counts', () => {
    expect(
      totalValue([
        priced({ id: '1' }),
        priced({ id: '2', item_status: 'missing' }),
        priced({ id: '3', kind: 'consumable', quantity: 3 }),
      ]),
    ).toBe(400)
  })
})

describe('saying it in its own units', () => {
  it('names the unit when there is one, and "each" when there is not', () => {
    expect(unitCostLabel(item({ estimated_cost: 1, unit: 'screw' }))).toBe('£1 per screw')
    expect(unitCostLabel(item({ estimated_cost: 249.99 }))).toBe('£249.99 each')
  })

  it('keeps the pennies — 75p is not a pound', () => {
    expect(unitCostLabel(item({ estimated_cost: 0.75, unit: 'screw' }))).toBe('£0.75 per screw')
  })

  it('says nothing about a price nobody has recorded', () => {
    expect(unitCostLabel(item({ estimated_cost: null }))).toBeNull()
  })

  it('counts in the words the register uses', () => {
    expect(countLabel(item({ quantity: 10, unit: 'screw' }))).toBe('10 × screw')
    expect(countLabel(item({ quantity: 10 }))).toBe('10')
  })
})

describe('valueHint', () => {
  it('does the sum the two fields are for', () => {
    expect(valueHint('10', '1', 'screw')).toBe('10 × screw at £1 each — £10 on the register.')
  })

  it('works without a unit name, which is optional', () => {
    expect(valueHint('2', '249.99', '')).toBe('2 at £249.99 each — £499.98 on the register.')
  })

  it('says what the cost means before a cost is typed', () => {
    expect(valueHint('10', '', 'screw')).toBe('The cost of one screw, not of all of them.')
    expect(valueHint('10', '', '')).toBe('The cost of one, not of all of them.')
  })

  it('treats nonsense as no cost rather than showing NaN', () => {
    expect(valueHint('10', 'abc', '')).toBe('The cost of one, not of all of them.')
    expect(valueHint('10', '0', '')).toBe('The cost of one, not of all of them.')
  })
})
