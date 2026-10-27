import { describe, expect, it } from 'vitest'
import broadcast from '../../../supabase/migrations/0202_screens_hear_that_a_table_changed_not_what_changed.sql?raw'
import { LIVE_TABLES } from './liveTables'

/*
 * A table is live when two lists say so (AGENTS.md §8): its `<table>_live`
 * trigger, which broadcasts that it changed (0202), and its row in
 * LIVE_TABLES, which says what goes stale. A table in only one of them
 * still loads and saves; it just goes stale on everybody else's screen.
 */

const migrations = import.meta.glob('../../../supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** The tables 0202 gives a `_live` trigger. */
const triggered = () => {
  const list = broadcast.slice(broadcast.indexOf('foreach t in array array['), broadcast.indexOf('] loop'))
  return [...list.matchAll(/'([a-z_]+)'/g)].map(([, table]) => table)
}

/** Tables a later migration gives the same trigger, one by one. */
const triggeredLater = () =>
  Object.entries(migrations)
    .filter(([path]) => Number(path.match(/\/(\d{4})_/)?.[1]) > 202)
    .flatMap(([, sql]) =>
      [...sql.matchAll(/create trigger (\w+)_live\s+after insert or update or delete on public\.(\w+)[\s\S]*?public\.live_table_changed\(\)/g)].map(
        ([, , table]) => table,
      ),
    )

describe('live tables', () => {
  it('each has the trigger that says it changed, and nothing else does', () => {
    const watched = LIVE_TABLES.map((t) => t.table).sort()
    expect([...triggered(), ...triggeredLater()].sort()).toEqual(watched)
  })
})
