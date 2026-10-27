import { describe, expect, it } from 'vitest'
import split from '../../../supabase/migrations/0200_a_rule_for_changing_rows_no_longer_runs_on_every_read.sql?raw'

/*
 * A write policy names its commands (0200, AGENTS.md §6).
 *
 * A `for all` policy is also a read policy. Postgres ORs it into every
 * select on the table and runs its may() on every row, which is how
 * reading service_sessions came to cost 106 ms instead of 0.34 ms.
 */

const migrations = import.meta.glob('../../../supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** The migration's number, from its file name. */
const numberOf = (path: string) => Number(path.match(/\/(\d{4})_[^/]*\.sql$/)?.[1] ?? NaN)

/** Each `create policy`, with its name, table and command. */
const policiesIn = (sql: string) =>
  [...sql.matchAll(/create policy\s+(\w+)\s+on\s+(?:public\.)?(\w+)\s+(?:as\s+\w+\s+)?for\s+(\w+)/gi)].map(
    ([, name, table, command]) => ({ name, table, command: command.toLowerCase() }),
  )

describe('write policies', () => {
  it('are never written `for all` from 0200 on', () => {
    const late = Object.entries(migrations)
      .filter(([path]) => numberOf(path) >= 200)
      .flatMap(([path, sql]) => policiesIn(sql).map((p) => ({ ...p, path })))
    expect(late.length).toBeGreaterThan(0)
    expect(late.filter((p) => p.command === 'all')).toEqual([])
  })

  it('each `for all` 0200 dropped comes back as insert, update and delete', () => {
    const dropped = [...split.matchAll(/drop policy if exists (\w+) on public\.(\w+);/g)].map(([, name, table]) => ({
      name,
      table,
    }))
    const created = policiesIn(split)
    expect(dropped).toHaveLength(33)
    for (const { name, table } of dropped) {
      expect(
        created.filter((p) => p.table === table && p.name.startsWith(`${name}_`)).map((p) => p.command).sort(),
      ).toEqual(['delete', 'insert', 'update'])
    }
  })
})
