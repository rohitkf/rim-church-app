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
