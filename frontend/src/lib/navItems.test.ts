import { describe, expect, it } from 'vitest'
import { NAV_ITEMS, menuItems } from './navItems'
import { PAGE_RULES } from './pageAccess'

/*
 * One entry for the services, not two.
 *
 * The Service Planner's list and the Calendar showed the same services on
 * two pages a tap apart (the Owner, November 2026: "seems like
 * duplication"). The services are planned from the Calendar now, so the
 * planner is in the menu only for somebody the Calendar is closed to.
 */

const open = (...paths: string[]) => (path: string) => paths.includes(path)
const everything = () => true
const paths = (canOpen: (path: string) => boolean) => menuItems(NAV_ITEMS, canOpen).map((i) => i.to)

describe('the menu for one person', () => {
  it('has the Calendar and not the planner beside it, for somebody who may open both', () => {
    const menu = paths(everything)
    expect(menu).toContain('/events')
    expect(menu).not.toContain('/service-planner')
  })

  it('lights the Calendar on the planner’s pages, which are reached from it', () => {
    const calendar = menuItems(NAV_ITEMS, everything).find((i) => i.to === '/events')
    expect(calendar?.covers).toEqual(['/service-planner'])
  })

  it('keeps the planner for somebody the Calendar is closed to, or they would have no way in', () => {
    const menu = paths(open('/', '/service-planner'))
    expect(menu).toEqual(['/', '/service-planner'])
  })

  it('covers nothing for somebody the planner is closed to', () => {
    const menu = menuItems(NAV_ITEMS, open('/', '/events'))
    expect(menu.map((i) => i.to)).toEqual(['/', '/events'])
    expect(menu[1].covers).toBeUndefined()
  })

  it('leaves out what is closed, as it always did', () => {
    expect(paths(open('/'))).toEqual(['/'])
  })

  it('puts the Calendar second by default, where the planner was', () => {
    expect(paths(everything).slice(0, 2)).toEqual(['/', '/events'])
  })
})

describe('a page reached from inside another', () => {
  it('names a page that exists and has a rule of its own', () => {
    for (const item of NAV_ITEMS.filter((i) => i.within)) {
      expect(NAV_ITEMS.some((i) => i.to === item.within), item.to).toBe(true)
      expect(PAGE_RULES[item.to], item.to).toBeTruthy()
    }
  })
})

/*
 * Groups with proper names, and every page under the one it belongs to
 * (the Owner, November 2026). "Sunday" had grown to ten pages and two
 * pages added later sat above every heading, under none.
 */
describe('the menu’s headings', () => {
  const HEADINGS = ['Serving', 'Service Planning', 'After the Service', 'Communications', 'Church Life', 'People & Teams']

  it('are these six, in this order, each in one run', () => {
    const runs: string[] = []
    for (const item of NAV_ITEMS) {
      if (item.group && runs[runs.length - 1] !== item.group) runs.push(item.group)
    }
    // A heading that came round twice would draw twice in the menu.
    expect(runs).toEqual(HEADINGS)
  })

  it('leave only the Dashboard and the Calendar above them', () => {
    expect(NAV_ITEMS.filter((i) => !i.group).map((i) => i.to)).toEqual(['/', '/events'])
    // And those two come first, or a heading would be drawn above them.
    expect(NAV_ITEMS.slice(0, 2).every((i) => !i.group)).toBe(true)
  })

  it('hold more than one page each, and none more than five', () => {
    for (const heading of HEADINGS) {
      const pages = NAV_ITEMS.filter((i) => i.group === heading)
      expect(pages.length, heading).toBeGreaterThan(1)
      expect(pages.length, heading).toBeLessThanOrEqual(5)
    }
  })

  it('put each page where somebody would look for it', () => {
    const under = (heading: string) => NAV_ITEMS.filter((i) => i.group === heading).map((i) => i.to)
    expect(under('Serving')).toEqual(['/availability', '/rota', '/checklists', '/clock-in'])
    expect(under('Service Planning')).toEqual(['/service-planner', '/set-lists', '/songs', '/stage', '/countdown'])
    expect(under('After the Service')).toEqual(['/debriefs', '/issues'])
    expect(under('Communications')).toEqual(['/updates', '/messages', '/team-chat', '/polls', '/feedback'])
    expect(under('Church Life')).toEqual(['/prayer', '/giving', '/registrations', '/door'])
    expect(under('People & Teams')).toEqual(['/departments', '/volunteers', '/families', '/dbs', '/inventory'])
  })
})
