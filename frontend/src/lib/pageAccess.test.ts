import { describe, expect, it } from 'vitest'
import migration from '../../../supabase/migrations/0123_the_church_decides_who_sees_what_and_for_how_long.sql?raw'
import {
  PAGE_RULES,
  compactAccess,
  levelOf,
  mayOpen,
  ruleFor,
  standingOf,
  type AccessLevel,
} from './pageAccess'
import { NAV_ITEMS } from './navItems'


/** What page_access_is_valid() accepts for each key, read out of the SQL. */
function sqlChoices(): Record<string, string[]> {
  const body = migration.slice(migration.indexOf('function public.page_access_is_valid'))
  const out: Record<string, string[]> = {}
  for (const m of body.matchAll(/when '([a-z-]+)'\s+then array\[([^\]]*)\]/g)) {
    if (m[1] in out) break
    out[m[1]] = [...m[2].matchAll(/'([a-z]+)'/g)].map((x) => x[1])
  }
  return out
}

/** The defaults page_level() falls back on, read out of the SQL. */
function sqlDefaults(): { everyone: string[] } {
  const body = migration.slice(migration.indexOf('function public.page_level'))
  const block = body.slice(0, body.indexOf("else 'team'"))
  return { everyone: [...block.matchAll(/when '([a-z-]+)'\s+then 'everyone'/g)].map((m) => m[1]) }
}

describe('the page rules', () => {
  /*
   * The app offers the choices; the database decides whether they are
   * allowed. A choice offered here that the SQL refuses is a Save that
   * fails for no reason anybody can see.
   */
  it('offers exactly the choices the database accepts, page by page', () => {
    const fromSql = sqlChoices()
    const fromApp = Object.fromEntries(
      Object.values(PAGE_RULES)
        .filter((r) => r.key)
        .map((r) => [r.key!, r.choices]),
    )
    expect(fromApp).toEqual(fromSql)
  })

  it('falls back on the same defaults as the database', () => {
    const everyone = sqlDefaults().everyone.sort()
    const fromApp = Object.values(PAGE_RULES)
      .filter((r) => r.key && r.default === 'everyone')
      .map((r) => r.key!)
      .sort()
    expect(fromApp).toEqual(everyone)
    for (const r of Object.values(PAGE_RULES)) {
      if (r.key && r.default !== 'everyone') expect(r.default, r.key).toBe('team')
    }
  })

  it('has a rule for every page in the menu', () => {
    for (const item of NAV_ITEMS) expect(ruleFor(item.to), item.to).not.toBeNull()
  })

  it('never offers a default that is not one of its own choices', () => {
    for (const [path, rule] of Object.entries(PAGE_RULES)) expect(rule.choices, path).toContain(rule.default)
  })

  it('gives a fixed page exactly one choice, and a reason', () => {
    for (const [path, rule] of Object.entries(PAGE_RULES)) {
      if (rule.enforcement === 'fixed') {
        expect(rule.choices, path).toHaveLength(1)
        expect(rule.key, path).toBeUndefined()
      }
      expect(rule.note.length, path).toBeGreaterThan(10)
    }
  })
})

describe('who may open what', () => {
  it('reproduces the app as it was, at every default', () => {
    // The pages the old flags kept to teams, and the one kept to Admins.
    const teamOnly = ['/availability', '/rota', '/checklists', '/debriefs', '/messages', '/team-chat', '/inventory']
    for (const path of teamOnly) {
      expect(mayOpen(path, 'church', {}), path).toBe(false)
      expect(mayOpen(path, 'member', {}), path).toBe(true)
    }
    for (const path of ['/', '/service-planner', '/set-lists', '/updates', '/polls', '/events', '/giving', '/departments']) {
      expect(mayOpen(path, 'church', {}), path).toBe(true)
    }
    expect(mayOpen('/volunteers', 'lead', {})).toBe(false)
    expect(mayOpen('/volunteers', 'admin', {})).toBe(true)
  })

  it('follows the church’s choice, both wider and narrower', () => {
    const access = { rota: 'everyone', inventory: 'leads', giving: 'team' } as const
    expect(mayOpen('/rota', 'church', access)).toBe(true)
    expect(mayOpen('/inventory', 'member', access)).toBe(false)
    expect(mayOpen('/inventory', 'lead', access)).toBe(true)
    expect(mayOpen('/giving', 'church', access)).toBe(false)
  })

  it('covers a page’s own sub-pages', () => {
    const access = { inventory: 'leads' } as const
    expect(mayOpen('/inventory/abc', 'member', access)).toBe(false)
    expect(mayOpen('/inventory/scan/xyz', 'lead', access)).toBe(true)
    expect(mayOpen('/service-planner/templates', 'church', {})).toBe(true)
  })

  it('never lets a setting lock an Admin out', () => {
    for (const path of Object.keys(PAGE_RULES)) {
      expect(mayOpen(path, 'admin', { inventory: 'leads', messages: 'leads' }), path).toBe(true)
    }
  })

  it('ignores a stored choice the page does not offer, rather than trusting it', () => {
    // The database refuses these too; this is for a row edited by hand.
    expect(levelOf('/inventory', { inventory: 'everyone' as AccessLevel })).toBe('team')
    expect(levelOf('/availability', { availability: 'everyone' as AccessLevel })).toBe('team')
  })

  it('opens Issues to everybody exactly when everybody may raise one', () => {
    expect(mayOpen('/issues', 'church', {}, 'team')).toBe(false)
    expect(mayOpen('/issues', 'church', {}, 'everyone')).toBe(true)
    expect(mayOpen('/issues', 'member', {}, 'leads')).toBe(true)
  })

  it('reads a person’s standing most senior first', () => {
    expect(standingOf({ isAdmin: true, isLead: true, onATeam: true })).toBe('admin')
    expect(standingOf({ isAdmin: false, isLead: true, onATeam: true })).toBe('lead')
    expect(standingOf({ isAdmin: false, isLead: false, onATeam: true })).toBe('member')
    expect(standingOf({ isAdmin: false, isLead: false, onATeam: false })).toBe('church')
  })
})

describe('what gets saved', () => {
  it('stores only what differs from the app’s own defaults', () => {
    expect(compactAccess({ rota: 'team', messages: 'leads', giving: 'everyone' })).toEqual({ messages: 'leads' })
  })

  it('drops a choice the page does not offer', () => {
    expect(compactAccess({ inventory: 'everyone' as AccessLevel, debriefs: 'leads' })).toEqual({ debriefs: 'leads' })
  })
})
