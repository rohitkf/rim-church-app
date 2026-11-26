import { describe, expect, it } from 'vitest'
import { serviceAnchor, serviceLinks } from './serviceLinks'
import { PAGE_RULES } from './pageAccess'

/*
 * One service, across the pages that are about it (the Owner, November
 * 2026): from its running order straight to its rota, set list and the
 * rest, each opening on that service.
 */

const everything = () => true
const only = (...paths: string[]) => (path: string) => paths.includes(path)

describe('a service’s other pages', () => {
  it('are every page about it but the one you are on, each opening on this service', () => {
    const links = serviceLinks('svc', { canOpen: everything, here: '/service-planner', begun: true })
    expect(links.map((l) => l.to)).toEqual([
      '/availability?service=svc',
      '/rota?service=svc',
      '/checklists?service=svc',
      '/set-lists?service=svc',
      '/stage/svc',
      '/debriefs?service=svc',
      '/issues?service=svc',
    ])
  })

  it('include the running order from any other page, under that name', () => {
    const links = serviceLinks('svc', { canOpen: everything, here: '/stage', begun: false })
    expect(links[0]).toEqual({ page: '/service-planner', to: '/service-planner/svc', label: 'Running order' })
    expect(links.map((l) => l.page)).not.toContain('/stage')
  })

  it('leave out what is said afterwards until its day has come', () => {
    const before = serviceLinks('svc', { canOpen: everything, here: '/service-planner', begun: false }).map((l) => l.page)
    expect(before).not.toContain('/debriefs')
    expect(before).not.toContain('/issues')
  })

  it('offer only the pages this person may open, and nothing to somebody with the running order alone', () => {
    const some = serviceLinks('svc', { canOpen: only('/rota', '/set-lists'), here: '/service-planner', begun: true })
    expect(some.map((l) => l.page)).toEqual(['/rota', '/set-lists'])
    expect(serviceLinks('svc', { canOpen: only('/service-planner'), here: '/service-planner', begun: true })).toEqual([])
  })

  it('say what the church calls each page', () => {
    const links = serviceLinks('svc', {
      canOpen: everything,
      here: '/service-planner',
      begun: true,
      names: { '/issues': 'Service Related Issues' },
    })
    expect(links.find((l) => l.page === '/issues')?.label).toBe('Service Related Issues')
    expect(links.find((l) => l.page === '/rota')?.label).toBe('Team Rota')
  })

  it('point only at pages that exist', () => {
    for (const link of serviceLinks('svc', { canOpen: everything, here: '', begun: true })) {
      expect(PAGE_RULES[link.page], link.page).toBeTruthy()
    }
  })

  it('give each card an anchor that cannot be mistaken for another page’s ids', () => {
    expect(serviceAnchor('abc')).toBe('service-abc')
  })
})
