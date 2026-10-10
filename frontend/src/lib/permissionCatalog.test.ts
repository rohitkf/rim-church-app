import { describe, expect, it } from 'vitest'
import { CATALOG, CAPABILITY_KEYS, GRANT_ROLES, type Reach } from './permissions'
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

/** Every catalog line, the last word winning — as `on conflict do update` would. */
const catalogInSql = () => {
  const out = new Map<string, { reaches: Reach[]; byDefault: Reach }>()
  const line = /\('([a-z]+\.[a-z_]+)', '([a-z]+)', '\{([a-z,]+)\}', '([a-z]+)'\)/g
  for (const m of sql.matchAll(line)) {
    out.set(`${m[1]}/${m[2]}`, { reaches: m[3].split(',') as Reach[], byDefault: m[4] as Reach })
  }
  return out
}

describe('the permission catalog', () => {
  it('is the same in the app as in the database, cell for cell', () => {
    const inSql = catalogInSql()
    const inApp = new Map(
      CAPABILITY_KEYS.flatMap((cap) =>
        GRANT_ROLES.map((role) => {
          const rule = CATALOG[cap][role]
          return [`${cap}/${role}`, { reaches: [...rule.reaches], byDefault: rule.byDefault }] as const
        }),
      ),
    )
    expect(Object.fromEntries(inApp)).toEqual(Object.fromEntries(inSql))
  })

  it('offers its reaches narrowest first, and only reaches that exist', () => {
    const order: Reach[] = ['none', 'own', 'team', 'all']
    for (const cap of CAPABILITY_KEYS) {
      for (const role of GRANT_ROLES) {
        const { reaches, byDefault } = CATALOG[cap][role]
        expect(reaches, `${cap} / ${role}`).toEqual([...reaches].sort((a, b) => order.indexOf(a) - order.indexOf(b)))
        expect(reaches, `${cap} / ${role}`).toContain(byDefault)
      }
    }
  })

  it('asks may() only about capabilities it catalogues', () => {
    // A capability nobody catalogued is nobody's but the Owner's: the
    // database fails closed, and a typo in a policy would quietly take a
    // power away from every Admin.
    const asked = new Set([...sql.matchAll(/\bmay\(\s*[a-z_.()]+,\s*'([a-z]+\.[a-z_]+)'/g)].map((m) => m[1]))
    expect(asked.size).toBeGreaterThan(0)
    for (const cap of asked) expect(CAPABILITY_KEYS, cap).toContain(cap)
  })

  it('keeps the essentials locked', () => {
    // The Admin can always change the grid; nobody else is offered it.
    expect(CATALOG['app.permissions'].admin).toEqual({ reaches: ['all'], byDefault: 'all' })
    for (const role of GRANT_ROLES.filter((r) => r !== 'admin')) {
      expect(CATALOG['app.permissions'][role].reaches, role).toEqual(['none'])
    }
    // A Church Member is everybody signed in: nothing on the rota is theirs to be given.
    for (const cap of CAPABILITY_KEYS.filter((c) => c.startsWith('rota.'))) {
      expect(CATALOG[cap].newcomer.reaches, cap).toEqual(['none'])
    }
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
