import { describe, expect, it } from 'vitest'
import { applyNavLayout, defaultNavLayout } from './navLayout'

const items = [
  { to: '/' },
  { to: '/rota', group: 'Sunday' },
  { to: '/set-lists', group: 'Sunday' },
  { to: '/messages', group: 'Talk' },
]
const shape = (list: { to: string; group?: string }[]) => list.map((i) => `${i.group ?? '-'}:${i.to}`)

describe('the church’s menu', () => {
  it('reads the app’s own arrangement off the default groups', () => {
    expect(defaultNavLayout(items)).toEqual({
      top: ['/'],
      groups: [
        { name: 'Sunday', items: ['/rota', '/set-lists'] },
        { name: 'Talk', items: ['/messages'] },
      ],
    })
  })

  it('leaves the app’s order alone when nothing is saved', () => {
    expect(applyNavLayout(items, null)).toBe(items)
  })

  it('moves pages between groups, renames and reorders them, and puts the ungrouped on top', () => {
    const out = applyNavLayout(items, {
      top: ['/', '/messages'],
      groups: [{ name: 'Services', items: ['/set-lists', '/rota'] }],
    })
    expect(shape(out)).toEqual(['-:/', '-:/messages', 'Services:/set-lists', 'Services:/rota'])
  })

  it('files a page added since into its default group, or the top if that group is gone', () => {
    const out = applyNavLayout([...items, { to: '/issues', group: 'Sunday' }, { to: '/new', group: 'Gone' }], {
      top: ['/'],
      groups: [
        { name: 'Sunday', items: ['/rota', '/set-lists'] },
        { name: 'Talk', items: ['/messages'] },
      ],
    })
    expect(shape(out)).toEqual(['-:/', '-:/new', 'Sunday:/rota', 'Sunday:/set-lists', 'Sunday:/issues', 'Talk:/messages'])
  })

  it('drops a page the app no longer has, and never shows one twice', () => {
    const out = applyNavLayout(items, {
      top: ['/', '/old-page', '/rota'],
      groups: [{ name: 'Sunday', items: ['/rota', '/set-lists'] }, { name: 'Talk', items: ['/messages'] }],
    })
    expect(shape(out)).toEqual(['-:/', '-:/rota', 'Sunday:/set-lists', 'Talk:/messages'])
  })
})
