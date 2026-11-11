import { describe, expect, it } from 'vitest'
import { CATALOG, CAPABILITY_KEYS, GRANT_ROLES, GRID_ROLES, OVERWATCH_OWN, PASTOR_LOCKED, hasCell, ruleFor, type CapabilityKey, type Reach } from './permissions'
import { PERMISSIONS } from './permissionMatrix'

/*
 * The app's copy of the permission catalog, held to the database's.
 *
 * The grid draws from the app's copy so it can draw at once; the database
 * enforces its own. If the two disagree, the grid offers a choice the
 * database refuses, or shows a default the database does not use — and
 * the second is the dangerous one, because it looks right.
 *
 * Every migration is read, so an area converted next spring is held to
 * the same line the moment its migration lands.
 */

const migrations = import.meta.glob('../../../supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const sql = Object.keys(migrations)
  .sort()
  .map((name) => migrations[name])
  .join('\n')

/**
 * Every catalog line, the last word winning — as `on conflict do update`
 * would — and a capability a later migration deletes from the catalog
 * gone again (0264 retired page.countdown), in the order they ran.
 */
const catalogInSql = () => {
  const out = new Map<string, { reaches: Reach[]; byDefault: Reach }>()
  const line =
    /\('([a-z]+\.[a-z_]+)', '([a-z]+)', '\{([a-z,]+)\}', '([a-z]+)'\)|delete from public\.permission_catalog where capability = '([a-z]+\.[a-z_]+)'/g
  for (const m of sql.matchAll(line)) {
    if (m[5]) {
      for (const key of [...out.keys()]) if (key.startsWith(`${m[5]}/`)) out.delete(key)
      continue
    }
    out.set(`${m[1]}/${m[2]}`, { reaches: m[3].split(',') as Reach[], byDefault: m[4] as Reach })
  }
  return out
}

describe('the permission catalog', () => {
  it('is the same in the app as in the database, cell for cell', () => {
    const inSql = catalogInSql()
    // Overwatch's and a Pastor's cells (0214) only where a capability names them.
    const inApp = new Map(
      CAPABILITY_KEYS.flatMap((cap) =>
        GRID_ROLES.filter((role) => hasCell(cap, role)).map((role) => {
          const rule = ruleFor(cap, role)
          return [`${cap}/${role}`, { reaches: [...rule.reaches], byDefault: rule.byDefault }] as const
        }),
      ),
    )
    expect(Object.fromEntries(inApp)).toEqual(Object.fromEntries(inSql))
  })

  it('offers its reaches narrowest first, and only reaches that exist', () => {
    const order: Reach[] = ['none', 'own', 'team', 'all']
    for (const cap of CAPABILITY_KEYS) {
      for (const role of GRID_ROLES) {
        const { reaches, byDefault } = ruleFor(cap, role)
        expect(reaches, `${cap} / ${role}`).toEqual([...reaches].sort((a, b) => order.indexOf(a) - order.indexOf(b)))
        expect(reaches, `${cap} / ${role}`).toContain(byDefault)
      }
    }
  })

  it('gives Overwatch its five own cells at Everywhere, and a cell at No on every other row it does not already read (0214, 0270)', () => {
    for (const cap of OVERWATCH_OWN) expect(ruleFor(cap as CapabilityKey, 'overwatch'), cap).toEqual({ reaches: ['none', 'all'], byDefault: 'all' })
    const without = CAPABILITY_KEYS.filter((cap) => !hasCell(cap, 'overwatch'))
    expect(without.filter((c) => !c.startsWith('page.')).sort()).toEqual(['avail.history', 'clockin.view'])
    expect(without.filter((c) => c.startsWith('page.')).length).toBe(CAPABILITY_KEYS.filter((c) => c.startsWith('page.')).length)
    // One row is fixed at No (0272): request_team_join() refuses Overwatch whatever a cell says.
    expect(ruleFor('team.request_join', 'overwatch')).toEqual({ reaches: ['none'], byDefault: 'none' })
    for (const cap of CAPABILITY_KEYS.filter((c) => hasCell(c, 'overwatch') && !OVERWATCH_OWN.includes(c) && c !== 'team.request_join')) {
      expect(ruleFor(cap, 'overwatch'), cap).toEqual({ reaches: ['none', 'all'], byDefault: 'none' })
    }
    // A thing done as Overwatch is nobody else's to be given.
    for (const cap of ['issue.as_overwatch', 'debrief.as_overwatch'] as const) {
      for (const role of GRANT_ROLES) expect(CATALOG[cap][role].reaches, `${cap} / ${role}`).toEqual(['none'])
    }
  })

  it('gives a Pastor a cell on every row but three, No out of the box bar prayer and registrations (0267, 0268)', () => {
    const without = CAPABILITY_KEYS.filter((cap) => !hasCell(cap, 'pastor')).sort()
    expect(without).toEqual([...PASTOR_LOCKED].sort())
    expect(without).toEqual(['debrief.as_overwatch', 'issue.as_overwatch', 'page.prayer'])
    // The three prayer rows: Yes out of the box, and the church's to change since 0277.
    for (const cap of ['prayer.pastoral', 'prayer.assign', 'prayer.lists'] as const) {
      expect(ruleFor(cap, 'pastor'), cap).toEqual({ reaches: ['none', 'all'], byDefault: 'all' })
    }
    // Out of the box: reading both registrations pages, and verifying payments.
    const yes = CAPABILITY_KEYS.filter((cap) => hasCell(cap, 'pastor') && ruleFor(cap, 'pastor').byDefault !== 'none').sort()
    expect(yes).toEqual(['prayer.assign', 'prayer.lists', 'prayer.pastoral', 'reg.door_view', 'reg.verify', 'reg.view'])
    // Every other cell is a choice, and starts at No.
    for (const cap of CAPABILITY_KEYS.filter((c) => hasCell(c, 'pastor') && !yes.includes(c))) {
      expect(ruleFor(cap, 'pastor'), cap).toEqual({ reaches: ['none', 'all'], byDefault: 'none' })
    }
    // Verifying is nobody's out of the box but a Pastor's: "Run registrations" is not it.
    for (const role of GRANT_ROLES) expect(CATALOG['reg.verify'][role].byDefault, role).toBe('none')
  })

  it('asks may() only about capabilities it catalogues', () => {
    // A capability nobody catalogued is nobody's but the Owner's: the
    // database fails closed, and a typo in a policy would quietly take a
    // power away from every Admin.
    const asked = new Set([...sql.matchAll(/\bmay\(\s*[a-z_.()]+,\s*'([a-z]+\.[a-z_]+)'/g)].map((m) => m[1]))
    expect(asked.size).toBeGreaterThan(0)
    for (const cap of asked) expect(CAPABILITY_KEYS, cap).toContain(cap)
  })

  it('starts the keys where they were fixed, and leaves them the church’s to give (0277)', () => {
    // The grid itself: every Admin out of the box, nobody else — and every cell a choice.
    expect(CATALOG['app.permissions'].admin).toEqual({ reaches: ['none', 'all'], byDefault: 'all' })
    for (const role of GRANT_ROLES.filter((r) => r !== 'admin')) {
      expect(CATALOG['app.permissions'][role], role).toEqual({ reaches: ['none', 'all'], byDefault: 'none' })
    }
    // What was an Admin's by standing starts as every Admin's; what was the Owner's alone, as nobody's.
    const admins = ['people.roles', 'people.admins', 'settings.general', 'settings.menu', 'settings.pages', 'settings.rota', 'settings.stage', 'settings.clockin', 'settings.prayer', 'settings.overwatch'] as const
    const owners = ['people.unadmin', 'settings.logo', 'settings.video', 'settings.feedback', 'settings.erase', 'feedback.manage', 'people.contacts', 'people.compliance'] as const
    for (const cap of admins) expect(CATALOG[cap].admin.byDefault, cap).toBe('all')
    for (const cap of [...admins, ...owners]) {
      for (const role of GRID_ROLES) {
        expect(ruleFor(cap, role).reaches, `${cap} ${role}`).toEqual(['none', 'all'])
        if (role !== 'admin' || owners.includes(cap as (typeof owners)[number])) expect(ruleFor(cap, role).byDefault, `${cap} ${role}`).toBe('none')
      }
    }
    // Sending feedback was anybody's on a team.
    expect(GRID_ROLES.filter((role) => ruleFor('feedback.send', role).byDefault === 'all')).toEqual(['admin', 'head', 'assistant', 'member'])
    // Since 0269 a Church Member's cell is the church's to set wherever
    // the database can honour it — but always No out of the box where it
    // was fixed, and never "their team": they are on none.
    for (const cap of CAPABILITY_KEYS.filter((c) => c.startsWith('rota.'))) {
      expect(CATALOG[cap].newcomer, cap).toEqual({ reaches: ['none', 'all'], byDefault: 'none' })
    }
    for (const cap of CAPABILITY_KEYS) expect(CATALOG[cap].newcomer.reaches, cap).not.toContain('team')
    // No dashes left but the ones that would lie: the two things done as
    // Overwatch, and a page's cell for somebody it cannot mean anything to.
    const fixedNo = CAPABILITY_KEYS.flatMap((cap) => GRANT_ROLES.filter((role) => ruleFor(cap, role).reaches.length === 1 && ruleFor(cap, role).byDefault === 'none').map(() => cap))
    expect([...new Set(fixedNo.filter((c) => !c.startsWith('page.')))].sort()).toEqual(['debrief.as_overwatch', 'issue.as_overwatch'])
    // And nothing at all is fixed at Yes.
    const fixedYes = CAPABILITY_KEYS.flatMap((cap) => GRID_ROLES.filter((role) => ruleFor(cap, role).reaches.length === 1 && ruleFor(cap, role).byDefault !== 'none').map(() => cap))
    expect(fixedYes).toEqual([])
  })

  it('is described once each on the Access page', () => {
    const keyed = PERMISSIONS.flatMap((a) => a.capabilities).flatMap((c) => (c.key ? [c.key] : []))
    expect([...keyed].sort()).toEqual([...CAPABILITY_KEYS].sort())
  })

  it('starts the Team rota exactly where its policies were', () => {
    // 0133's dry run against the live database found no person, team and
    // service where the old rule and may() disagreed. This is that rule.
    const before = {
      'rota.assign': { admin: 'all', head: 'team', coordinator: 'none', member: 'none', newcomer: 'none' },
      'rota.tag': { admin: 'all', head: 'team', coordinator: 'none', member: 'none', newcomer: 'none' },
      'rota.release_ask': { admin: 'all', head: 'team', coordinator: 'none', member: 'none', newcomer: 'none' },
      'rota.release_decide': { admin: 'all', head: 'team', coordinator: 'none', member: 'none', newcomer: 'none' },
      'rota.release_delete': { admin: 'all', head: 'none', coordinator: 'none', member: 'none', newcomer: 'none' },
    } as const
    for (const [cap, roles] of Object.entries(before)) {
      for (const [role, reach] of Object.entries(roles)) {
        expect(CATALOG[cap as keyof typeof before][role as keyof typeof roles].byDefault, `${cap} / ${role}`).toBe(reach)
      }
    }
  })
})
