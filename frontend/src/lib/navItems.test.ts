import { describe, expect, it } from 'vitest'
import { NAV_ITEMS, entryNameKey, menuItems, pageTabs } from './navItems'
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
  const HEADINGS = ['Serving', 'Services', 'Communications', 'Church Life', 'People & Teams']

  it('are these five, in this order, each in one run', () => {
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

  it('hold more than one entry each, and none more than five, for somebody who may open everything', () => {
    const menu = menuItems(NAV_ITEMS, everything)
    for (const heading of HEADINGS) {
      const entries = menu.filter((i) => i.group === heading)
      expect(entries.length, heading).toBeGreaterThan(1)
      expect(entries.length, heading).toBeLessThanOrEqual(5)
    }
  })

  it('put each entry where somebody would look for it', () => {
    const menu = menuItems(NAV_ITEMS, everything)
    const under = (heading: string) => menu.filter((i) => i.group === heading).map((i) => i.label)
    expect(under('Serving')).toEqual(['Availability', 'Team Rota', 'Checklists', 'Clock In', 'On my way'])
    expect(under('Services')).toEqual(['Set Lists', 'Stage Layout', 'Countdown', 'After the Service'])
    expect(under('Communications')).toEqual(['Church Updates', 'Chat', 'Polls', 'Feedback'])
    expect(under('Church Life')).toEqual(['Prayer Requests', 'Giving', 'Registrations'])
    expect(under('People & Teams')).toEqual(['Teams', 'People', 'Inventory'])
  })
})

/*
 * Pages that are one entry, with tabs (the Owner, November 2026: "do all
 * 6"). Each is still its own page behind its own rule, so the menu and
 * the strip are both worked out per person.
 */
describe('pages that are one entry in the menu', () => {
  const entry = (canOpen: (path: string) => boolean, to: string) => menuItems(NAV_ITEMS, canOpen).find((i) => i.to === to)

  it('are one entry under the family’s name, lit on every page inside it', () => {
    expect(entry(everything, '/debriefs')).toMatchObject({ label: 'After the Service', covers: ['/issues'] })
    expect(entry(everything, '/volunteers')).toMatchObject({ label: 'People', covers: ['/families', '/dbs'] })
    expect(entry(everything, '/messages')).toMatchObject({ label: 'Chat', covers: ['/team-chat'] })
    for (const inside of ['/issues', '/families', '/dbs', '/team-chat', '/songs', '/door']) expect(entry(everything, inside), inside).toBeUndefined()
  })

  it('keep the page’s own name where that already says what is inside', () => {
    expect(entry(everything, '/set-lists')).toMatchObject({ label: 'Set Lists', covers: ['/songs'] })
    expect(entry(everything, '/registrations')).toMatchObject({ label: 'Registrations', covers: ['/door'] })
  })

  it('are that page under its own name for somebody who may open only one of them', () => {
    const doorOnly = open('/', '/door')
    expect(entry(doorOnly, '/door')).toMatchObject({ label: 'Reception' })
    expect(entry(doorOnly, '/door')?.covers).toBeUndefined()
    const admin = (path: string) => path !== '/families' && path !== '/dbs'
    expect(entry(admin, '/volunteers')).toMatchObject({ label: 'Volunteers' })
    expect(entry(admin, '/volunteers')?.covers).toBeUndefined()
  })

  it('start from the first page that is open when the one they are reached from is not', () => {
    // A Pastor with Families and DBS Checks and not the roles page: still one entry, not two.
    const pastor = (path: string) => path !== '/volunteers'
    expect(entry(pastor, '/families')).toMatchObject({ label: 'People', covers: ['/dbs'] })
    expect(entry(pastor, '/dbs')).toBeUndefined()
  })

  it('keep the name the church gave a page where the family has none of its own', () => {
    const renamed = NAV_ITEMS.map((i) => (i.to === '/set-lists' ? { ...i, label: 'Worship Sets' } : i))
    expect(menuItems(renamed, everything).find((i) => i.to === '/set-lists')?.label).toBe('Worship Sets')
  })
})

/*
 * The entry's own name (the Owner, November 2026: "make those renamable").
 * People, Chat and After the Service were the app's words; the church can
 * now give its own in Settings › Menu, kept beside its names for pages.
 */
describe('the church’s own name for an entry that holds tabs', () => {
  const names = { [entryNameKey('/volunteers')]: 'Members', [entryNameKey('/set-lists')]: 'Worship', '/volunteers': 'Roles' }
  const entry = (to: string) => menuItems(NAV_ITEMS, everything, names).find((i) => i.to === to)

  it('is what the menu says, in place of the app’s', () => {
    expect(entry('/volunteers')?.label).toBe('Members')
    // An entry the app gave no name of its own can be given one too.
    expect(entry('/set-lists')?.label).toBe('Worship')
    // One the church has not named keeps the app's.
    expect(entry('/messages')?.label).toBe('Chat')
  })

  it('is what the strip of tabs is called, and leaves each tab its page’s name', () => {
    const found = pageTabs('/families', everything, names)
    expect(found?.name).toBe('Members')
    expect(found?.tabs.map((t) => t.label)).toEqual(['Roles', 'Families', 'DBS Checks'])
  })

  it('goes with the entry whichever page leads it', () => {
    const pastor = (path: string) => path !== '/volunteers'
    expect(menuItems(NAV_ITEMS, pastor, names).find((i) => i.to === '/families')?.label).toBe('Members')
  })

  it('is not used for somebody who may open only one of the pages', () => {
    const admin = (path: string) => path !== '/families' && path !== '/dbs'
    expect(menuItems(NAV_ITEMS, admin, names).find((i) => i.to === '/volunteers')?.label).toBe('Volunteers')
  })

  it('is kept under a key no address can be', () => {
    expect(entryNameKey('/volunteers')).toBe('family:/volunteers')
    expect(NAV_ITEMS.some((i) => i.to.startsWith('family:'))).toBe(false)
  })
})

describe('the tabs across a page', () => {
  it('are the page and the ones beside it, in the app’s order, under the church’s names', () => {
    const names = { '/issues': 'Service Related Issues' }
    expect(pageTabs('/issues', everything, names)).toEqual({
      name: 'After the Service',
      tabs: [
        { to: '/debriefs', label: 'Debriefs' },
        { to: '/issues', label: 'Service Related Issues' },
      ],
    })
    expect(pageTabs('/volunteers', everything)?.tabs.map((t) => t.to)).toEqual(['/volunteers', '/families', '/dbs'])
    // No family name: the strip is called what the church calls the page it is on.
    expect(pageTabs('/songs', everything, { '/set-lists': 'Worship Sets' })?.name).toBe('Worship Sets')
  })

  it('leave out a tab that is closed to this person', () => {
    const pastor = (path: string) => path !== '/volunteers'
    expect(pageTabs('/families', pastor)?.tabs.map((t) => t.to)).toEqual(['/families', '/dbs'])
  })

  it('are not drawn with one page left, or none', () => {
    expect(pageTabs('/door', open('/door'))).toBeNull()
    expect(pageTabs('/debriefs', open('/debriefs'))).toBeNull()
  })

  it('are not drawn on a page with no tabs, a page further in, or the planner under the Calendar', () => {
    expect(pageTabs('/rota', everything)).toBeNull()
    expect(pageTabs('/registrations/abc', everything)).toBeNull()
    // Reached from the Calendar's Services chip, not from a tab.
    expect(pageTabs('/events', everything)).toBeNull()
    expect(pageTabs('/service-planner', everything)).toBeNull()
  })

  it('name only pages that exist, each with a rule of its own', () => {
    for (const item of NAV_ITEMS.filter((i) => i.tab)) {
      expect(item.within, item.to).toBeTruthy()
      expect(PAGE_RULES[item.to], item.to).toBeTruthy()
      // One level only: a tab is not itself a page with tabs.
      expect(NAV_ITEMS.find((i) => i.to === item.within)?.within, item.to).toBeUndefined()
    }
    for (const item of NAV_ITEMS.filter((i) => i.family)) {
      expect(NAV_ITEMS.some((i) => i.within === item.to && i.tab), item.to).toBe(true)
    }
  })
})
