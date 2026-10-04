import { describe, expect, it } from 'vitest'
import migration from '../../../supabase/migrations/0124_the_teams_tell_us_what_to_fix.sql?raw'
import { FEEDBACK_KINDS, FEEDBACK_STATUSES, groupByKind, isOpen, type Feedback } from './feedback'

const listed = (column: string) =>
  [...(migration.match(new RegExp(`${column} in \\(([^)]*)\\)`))?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1])

describe('feedback kinds and statuses', () => {
  /*
   * The form offers these and the database checks them. A kind the form
   * offers that the check refuses is a Send that fails for no reason the
   * person can see.
   */
  it('offers exactly the kinds the database accepts, in order', () => {
    expect(FEEDBACK_KINDS.map((k) => k.value)).toEqual(listed('kind'))
  })

  it('knows exactly the statuses the database accepts', () => {
    expect(FEEDBACK_STATUSES.map((s) => s.value)).toEqual(listed('status'))
  })

  it('counts New and Looking into it as still open', () => {
    expect(['new', 'looking', 'done', 'wont_do'].map((s) => isOpen(s as never))).toEqual([true, true, false, false])
  })
})

describe('groupByKind', () => {
  const f = (id: string, kind: string, created_at: string) =>
    ({ id, kind, created_at, body: id, created_by: 'u', status: 'new', reply: null, status_changed_at: null, sender: null, replier: null }) as Feedback

  it('puts bugs first and praise near the end, whatever order they arrived in, newest first within each', () => {
    const groups = groupByKind([
      f('p', 'praise', '2026-10-01'),
      f('b1', 'bug', '2026-10-01'),
      f('i', 'idea', '2026-10-02'),
      f('b2', 'bug', '2026-10-03'),
    ])
    expect(groups.map((g) => g.kind.value)).toEqual(['bug', 'idea', 'praise'])
    expect(groups[0].items.map((x) => x.id)).toEqual(['b2', 'b1'])
  })

  it('leaves out a kind with nothing in it', () => {
    expect(groupByKind([])).toEqual([])
  })
})
