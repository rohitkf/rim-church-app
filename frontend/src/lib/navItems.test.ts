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
