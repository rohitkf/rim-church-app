import { describe, expect, it } from 'vitest'
import { orderWithInsert } from './sessionInsert'

describe('adding a session below the one you pressed', () => {
  const order = ['worship-1', 'intercessory', 'worship-2', 'message']

  it('puts it straight after the session it was added from', () => {
    expect(orderWithInsert(order, 'worship-2', 'new')).toEqual([
      'worship-1',
      'intercessory',
      'worship-2',
      'new',
      'message',
    ])
  })

  it('adds to the end when the last session is the one pressed', () => {
    expect(orderWithInsert(order, 'message', 'new')).toEqual([...order, 'new'])
  })

  it('adds to the start’s heels when the first is pressed', () => {
    expect(orderWithInsert(order, 'worship-1', 'new')).toEqual([
      'worship-1',
      'new',
      'intercessory',
      'worship-2',
      'message',
    ])
  })

  it('leaves it at the end when the anchor has gone under somebody else’s edit', () => {
    expect(orderWithInsert(order, 'deleted-by-somebody-else', 'new')).toEqual([...order, 'new'])
  })

  it('handles the first session of an empty service', () => {
    expect(orderWithInsert([], 'nothing', 'new')).toEqual(['new'])
  })

  it('leaves the order it was given alone', () => {
    const original = [...order]
    orderWithInsert(order, 'worship-2', 'new')
    expect(order).toEqual(original)
  })
})
