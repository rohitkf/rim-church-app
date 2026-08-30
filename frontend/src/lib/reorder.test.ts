import { describe, expect, it } from 'vitest'
import { moveItem, sameOrder } from './reorder'

const list = ['a', 'b', 'c', 'd']

describe('moveItem', () => {
  it('carries an item down the list', () => {
    expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('carries an item back up it', () => {
    expect(moveItem(list, 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('leaves the list alone when nothing moves', () => {
    expect(moveItem(list, 2, 2)).toEqual(list)
  })

  it('clamps a drag past either end rather than losing the item', () => {
    expect(moveItem(list, 1, -3)).toEqual(['b', 'a', 'c', 'd'])
    expect(moveItem(list, 1, 99)).toEqual(['a', 'c', 'd', 'b'])
  })

  it('never mutates what it was given', () => {
    const original = [...list]
    moveItem(list, 0, 3)
    expect(list).toEqual(original)
  })

  it('shrugs at an index that is not in the list', () => {
    expect(moveItem(list, 9, 0)).toEqual(list)
  })
})

describe('sameOrder', () => {
  it('knows a drag that ended where it began', () => {
    expect(sameOrder(list, ['a', 'b', 'c', 'd'])).toBe(true)
    expect(sameOrder(list, ['a', 'c', 'b', 'd'])).toBe(false)
    expect(sameOrder(list, ['a', 'b', 'c'])).toBe(false)
  })
})
