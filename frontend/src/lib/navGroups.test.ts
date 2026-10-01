import { describe, expect, it } from 'vitest'
import { groupItems } from './navGroups'

describe('the More sheet’s headings', () => {
  it('keeps the order and starts a heading wherever the group changes', () => {
    const runs = groupItems([
      { to: '/' },
      { to: '/a', group: 'Sunday' },
      { to: '/b', group: 'Sunday' },
      { to: '/c', group: 'Talk' },
    ])
    expect(runs.map((r) => [r.group, r.items.map((i) => i.to)])).toEqual([
      [null, ['/']],
      ['Sunday', ['/a', '/b']],
      ['Talk', ['/c']],
    ])
  })

  it('leaves out a heading with nothing under it for this person', () => {
    // A Church Member's list has no Talk items it cannot open: no heading.
    const runs = groupItems([{ to: '/', group: undefined }, { to: '/events', group: 'Church life' }])
    expect(runs.map((r) => r.group)).toEqual([null, 'Church life'])
  })
})
