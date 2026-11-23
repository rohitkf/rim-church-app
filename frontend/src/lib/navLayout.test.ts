import { describe, expect, it } from 'vitest'
import { NAV_ITEMS } from './navItems'
import { applyNavLayout, defaultNavLayout, navLabels, navLayoutSchema, withMovedPages } from './navLayout'

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

describe('pages the church has renamed', () => {
  const pages = [
    { to: '/', label: 'Dashboard' },
    { to: '/polls', label: 'Polls', group: 'Talk' },
    { to: '/giving', label: 'Giving', group: 'Church life' },
  ]

  it('carries the new name into the menu, wherever the page sits', () => {
    const layout = { top: ['/'], groups: [{ name: 'Talk', items: ['/polls'] }], labels: { '/polls': 'Votes', '/giving': 'Tithes' } }
    const placed = applyNavLayout(pages, layout)
    expect(placed.find((p) => p.to === '/polls')?.label).toBe('Votes')
    // Not in the saved arrangement, so placed by default — still renamed.
    expect(placed.find((p) => p.to === '/giving')?.label).toBe('Tithes')
    expect(placed.find((p) => p.to === '/')?.label).toBe('Dashboard')
  })

  it('keeps only names that say something, no longer than the dock can show', () => {
    expect(navLabels({ top: [], groups: [], labels: { '/a': '  Votes ', '/b': '   ', '/c': 'x'.repeat(50) } })).toEqual({
      '/a': 'Votes',
      '/c': 'x'.repeat(30),
    })
    expect(navLabels(null)).toEqual({})
  })

  it('still reads an arrangement saved before pages could be renamed', () => {
    expect(navLayoutSchema.safeParse({ top: ['/'], groups: [] }).success).toBe(true)
  })
})

/*
 * Serving was one menu entry holding three pages as tabs; they are three
 * entries again. A menu saved in between names the old entry, and has to
 * come out with the three where it stood.
 */
describe('a menu saved while Serving was one entry', () => {
  // The church's own arrangement, as it stood on production in November 2026.
  const saved = {
    top: ['/', '/clock-in', '/countdown'],
    groups: [
      { name: 'Church Events', items: ['/service-planner', '/events', '/registrations', '/door'] },
      { name: 'Team Management', items: ['/serving', '/departments'] },
      { name: 'Service Management', items: ['/set-lists', '/stage', '/issues', '/debriefs'] },
      { name: 'Communications', items: ['/messages', '/team-chat', '/polls'] },
      { name: 'Church Related', items: ['/songs', '/updates', '/prayer', '/giving', '/volunteers', '/inventory'] },
      { name: 'App Related', items: ['/feedback'] },
    ],
    labels: { '/events': 'Church Calendar' },
  }

  it('puts the three pages where Serving stood, in order', () => {
    const now = withMovedPages(saved)
    expect(now.groups[1]).toEqual({ name: 'Team Management', items: ['/availability', '/rota', '/checklists', '/departments'] })
    // Nothing else moves, and the church's names are kept.
    expect(now.top).toEqual(saved.top)
    expect(now.groups[0]).toEqual(saved.groups[0])
    expect(now.groups[2]).toEqual(saved.groups[2])
    expect(now.labels).toEqual({ '/events': 'Church Calendar' })
  })

  it('shows them under that heading in the menu itself', () => {
    const menu = applyNavLayout(NAV_ITEMS, withMovedPages(saved))
    const team = menu.filter((i) => i.group === 'Team Management').map((i) => i.label)
    expect(team).toEqual(['Availability', 'Team Rota', 'Checklists', 'Teams'])
    expect(menu.some((i) => i.to === '/serving')).toBe(false)
    // None of the three has fallen to the top for want of a heading.
    // Families and DBS Checks (0326) are pages this saved menu has never seen, and it has no
    // "People & things" for them to land under: at the top, in sight, for the church to place.
    expect(menu.filter((i) => !i.group).map((i) => i.to)).toEqual(['/', '/clock-in', '/countdown', '/families', '/dbs'])
  })

  it('works where Serving sat at the top, under no heading', () => {
    expect(withMovedPages({ top: ['/', '/serving'], groups: [] }).top).toEqual(['/', '/availability', '/rota', '/checklists'])
  })

  it('drops a name the church gave the old entry, which no page answers to now', () => {
    const now = withMovedPages({ top: ['/serving'], groups: [], labels: { '/serving': 'Rotas', '/rota': 'Rota' } })
    expect(now.labels).toEqual({ '/rota': 'Rota' })
  })

  it('leaves a page already placed by hand where it was put', () => {
    const now = withMovedPages({ top: ['/rota'], groups: [{ name: 'Teams', items: ['/serving'] }] })
    expect(now.top).toEqual(['/rota'])
    expect(now.groups[0].items).toEqual(['/availability', '/checklists'])
  })

  it('hands back a menu that never named it untouched', () => {
    const fine = { top: ['/'], groups: [{ name: 'Sunday', items: ['/rota'] }] }
    expect(withMovedPages(fine)).toBe(fine)
  })
})
