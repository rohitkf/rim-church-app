import { describe, expect, it } from 'vitest'
import { SETTINGS_SECTIONS, maySee, visibleGroups } from './settingsSections'
import { decide, type Holder, type Overrides } from './permissions'

const room = (to: string) => SETTINGS_SECTIONS.find((s) => s.to === to)!

/** Somebody's standing, with the grid's answer for them under these overrides. */
const standing = (holder: Partial<Holder>, overrides: Overrides = {}) => {
  const who: Holder = { myId: 'me', owner: false, admin: false, ledTeams: [], memberTeams: [], ...holder }
  return {
    isAdmin: who.admin,
    isSuperAdmin: who.owner,
    can: (cap: Parameters<typeof decide>[2]) => decide(overrides, who, cap),
  }
}

describe('Settings rooms that are one permission in the grid', () => {
  it('opens Giving to whoever the church lets change the Giving page', () => {
    const head = { ledTeams: ['media'] }
    expect(maySee(room('/settings/giving'), standing(head))).toBe(false)
    expect(maySee(room('/settings/giving'), standing(head, { 'give.edit': { head: 'all' } }))).toBe(true)
  })

  it('opens Send an alert to whoever may alert the whole church', () => {
    const member = { memberTeams: ['media'] }
    expect(maySee(room('/settings/alerts'), standing(member))).toBe(false)
    expect(maySee(room('/settings/alerts'), standing(member, { 'msg.alert': { member: 'all' } }))).toBe(true)
  })

  it('closes them to an Admin the church has taken them from', () => {
    const admin = { admin: true }
    expect(maySee(room('/settings/giving'), standing(admin, { 'give.edit': { admin: 'none' } }))).toBe(false)
    // The rest of an Admin's rooms are the Admin's whatever the grid says.
    expect(maySee(room('/settings/access'), standing(admin, { 'give.edit': { admin: 'none' } }))).toBe(true)
  })

  it('gives somebody granted a room a heading to find it under', () => {
    const groups = visibleGroups(standing({ ledTeams: ['media'] }, { 'give.edit': { head: 'all' } }))
    expect(groups.flatMap((g) => g.sections.map((s) => s.to))).toContain('/settings/giving')
  })
})

describe('every room of Settings is a row in the grid (0277)', () => {
  const mine = ['/settings/profile', '/settings/appearance', '/settings/notifications']
  const rooms = (s: ReturnType<typeof standing>) => visibleGroups(s).flatMap((g) => g.sections.map((x) => x.to))

  it('gives every room but your own three a permission', () => {
    for (const section of SETTINGS_SECTIONS) {
      if (mine.includes(section.to)) expect(section.capability, section.to).toBeUndefined()
      else expect(section.capability, section.to).toBeDefined()
    }
  })

  it('opens exactly what was open before, while nothing is changed', () => {
    const owners = ['/settings/logo', '/settings/video', '/settings/feedback', '/settings/data']
    expect(rooms(standing({}))).toEqual(mine)
    expect(rooms(standing({ ledTeams: ['media'], memberTeams: ['media'] }))).toEqual(mine)
    const admin = rooms(standing({ admin: true }))
    expect(admin).toEqual(SETTINGS_SECTIONS.map((s) => s.to).filter((to) => !owners.includes(to)))
    expect(rooms(standing({ owner: true, admin: true }))).toEqual(SETTINGS_SECTIONS.map((s) => s.to))
  })

  it('opens one room to a role the church gives it, and closes one to the Admins', () => {
    expect(rooms(standing({ ledTeams: ['media'] }, { 'settings.logo': { head: 'all' } }))).toEqual([...mine, '/settings/logo'])
    expect(rooms(standing({ admin: true }, { 'settings.menu': { admin: 'none' } }))).not.toContain('/settings/menu')
    // The grid itself is an Admin's cell like any other; the Owner always opens it.
    expect(maySee(room('/settings/access'), standing({ admin: true }, { 'app.permissions': { admin: 'none' } }))).toBe(false)
    expect(maySee(room('/settings/access'), standing({ owner: true, admin: true }, { 'app.permissions': { admin: 'none' } }))).toBe(true)
  })

  it('opens a room to somebody given it by name', () => {
    const grant = { id: 'g', capability: 'settings.erase', userId: 'me', departmentId: null, reach: 'all' as const }
    expect(rooms(standing({ grants: [grant] }))).toEqual([...mine, '/settings/data'])
  })

  it('opens a room that also holds the grid’s rules to whoever may change the grid', () => {
    // Page by Page is each page's settings and each page's rules: either is reason to come in.
    const gridOnly = standing({ memberTeams: ['media'] }, { 'app.permissions': { member: 'all' } })
    for (const to of ['/settings/pages', '/settings/overwatch', '/settings/stage', '/settings/clock-in', '/settings/prayer']) {
      expect(maySee(room(to), gridOnly), to).toBe(true)
    }
    // But not a room that is only its own: the church's time zone is not the grid's.
    expect(maySee(room('/settings/general'), gridOnly)).toBe(false)
  })
})
