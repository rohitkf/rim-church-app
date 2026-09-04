import { describe, expect, it } from 'vitest'
import {
  draftFrom,
  draftToRow,
  emptyDraft,
  itemFromRequest,
  type RequestRowFields,
} from './purchaseRequest'

const FULL: RequestRowFields = {
  item_name: 'Hollyland Pyro S Kit',
  kind: 'asset',
  quantity: 3,
  unit: 'kit',
  estimated_cost: '433.00',
  product_url: 'https://example.org/pyro',
  reason: 'Upgrade transmitter receiver',
  brand: 'Hollyland',
  model: 'Pyro S TX/RX',
  serial_number: 'SN-9977',
  location: 'Media Room',
  category: 'Transmitter',
  category_id: 'cat-1',
  reorder_level: null,
}

describe('the round trip between a request and its form', () => {
  it('loses nothing on the way out and back', () => {
    // The bug this set out to fix was a field quietly missing from one of
    // the two crossings, so the whole shape is checked rather than a few
    // fields somebody remembered.
    //
    // The cost is the one value that legitimately changes type: Postgres
    // returns `numeric` as a string, and it goes back as a number. Same
    // money, so it is normalised on both sides rather than excused.
    expect(draftToRow(draftFrom(FULL))).toEqual({ ...FULL, estimated_cost: 433 })
  })

  it('reads a cost back as a number, however Postgres sent it', () => {
    expect(draftToRow(draftFrom({ ...FULL, estimated_cost: '433.00' })).estimated_cost).toBe(433)
    expect(draftToRow(draftFrom({ ...FULL, estimated_cost: 433 })).estimated_cost).toBe(433)
  })

  it('turns every blank into a null rather than an empty string', () => {
    const sparse: RequestRowFields = { item_name: 'Gaffer tape', quantity: 1 }
    const row = draftToRow(draftFrom(sparse))
    expect(row.brand).toBeNull()
    expect(row.model).toBeNull()
    expect(row.serial_number).toBeNull()
    expect(row.location).toBeNull()
    expect(row.category).toBeNull()
    expect(row.category_id).toBeNull()
    expect(row.estimated_cost).toBeNull()
  })

  it('never lets the quantity fall below one', () => {
    expect(draftToRow({ ...emptyDraft(), quantity: '0' }).quantity).toBe(1)
    expect(draftToRow({ ...emptyDraft(), quantity: '' }).quantity).toBe(1)
  })

  it('keeps a reorder level only for something bought by the box', () => {
    const asset = draftToRow({ ...emptyDraft(), kind: 'asset', reorder: '5' })
    expect(asset.reorder_level).toBeNull()
    const consumable = draftToRow({ ...emptyDraft(), kind: 'consumable', reorder: '5' })
    expect(consumable.reorder_level).toBe(5)
  })
})

describe('itemFromRequest', () => {
  const row = { ...FULL, department_id: 'd1' }

  it('carries every field the shelf needs across', () => {
    // The complaint: approving a request left half the item blank, so
    // somebody had to type the brand and model in again.
    expect(itemFromRequest(row, 'MED-TRA-0001')).toEqual({
      department_id: 'd1',
      name: 'Hollyland Pyro S Kit',
      kind: 'asset',
      quantity: 3,
      unit: 'kit',
      estimated_cost: 433,
      product_url: 'https://example.org/pyro',
      notes: 'Upgrade transmitter receiver',
      brand: 'Hollyland',
      model: 'Pyro S TX/RX',
      serial_number: 'SN-9977',
      location: 'Media Room',
      category: 'Transmitter',
      category_id: 'cat-1',
      reorder_level: null,
      asset_tag: 'MED-TRA-0001',
    })
  })

  it('takes the kind that was asked for, not one guessed from the count', () => {
    // Three of a thing used to make it a consumable, which makes three
    // identical cameras a consumable and one box of screws an asset.
    expect(itemFromRequest({ ...row, kind: 'asset', quantity: 3 }, null).kind).toBe('asset')
    expect(itemFromRequest({ ...row, kind: 'consumable', quantity: 1 }, null).kind).toBe(
      'consumable',
    )
  })

  it('falls back to an asset for a request made before the question existed', () => {
    expect(itemFromRequest({ ...row, kind: null }, null).kind).toBe('asset')
  })

  it('carries no tag when the database did not mint one', () => {
    expect(itemFromRequest(row, null).asset_tag).toBeNull()
  })
})
