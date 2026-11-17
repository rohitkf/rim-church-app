import { describe, expect, it } from 'vitest'
import counted from '../../../supabase/migrations/0300_a_promo_codes_uses_are_its_live_registrations.sql?raw'

/*
 * A promo code's uses are its live registrations (0300, AGENTS.md §6).
 *
 * `registration_promo_codes.uses` was kept by hand in six functions, and
 * drifted where one of them forgot a direction. Since 0300 two triggers
 * hold the column to the count of confirmed registrations that carry the
 * code, and no function adds to it or takes from it. A later migration
 * that writes the number by hand would be overwritten by the trigger —
 * and would say something to its reader that is not true.
 */

const migrations = import.meta.glob('../../../supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** The migration's number, from its file name. */
const numberOf = (path: string) => Number(path.match(/\/(\d{4})_[^/]*\.sql$/)?.[1] ?? NaN)

/** SQL with its comments taken out: what a comment says about the old way is not the old way. */
const code = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '')

/**
 * What each statement sets a promo code's `uses` to, where that is anything
 * but itself. Only the SET clause is read — `where uses = 0` sets nothing —
 * and a statement is read whole, however many lines it is written on. An
 * upsert's `do update set` counts as well.
 */
export function writesByHand(sql: string): string[] {
  const flat = code(sql).replace(/\s+/g, ' ')
  const sets = [
    ...[...flat.matchAll(/\bupdate (?:only )?(?:public\.)?registration_promo_codes\b[^;]*?\bset\b([^;]*)/gi)].map(([, set]) => set),
    ...[...flat.matchAll(/\binsert into (?:public\.)?registration_promo_codes\b[^;]*?\bdo update set\b([^;]*)/gi)].map(([, set]) => set),
  ]
  return sets.flatMap((set) => {
    // What is assigned ends where the conditions begin.
    const assigned = set.split(/\b(?:where|returning|from)\b/i)[0]
    return [...assigned.matchAll(/(?:^|,)\s*uses\s*=\s*([^,]*)/gi)].map(([, value]) => value.trim()).filter((value) => !/^(\w+\.)?uses$/i.test(value))
  })
}

describe('a promo code’s count', () => {
  it('is the confirmed registrations that carry the code', () => {
    expect(counted).toMatch(/from public\.registration_orders o\s+where o\.promo_code_id = p_id and o\.status = 'confirmed'/)
  })

  it('is set by a trigger before every write of a code, so nothing can write another number', () => {
    expect(counted).toMatch(/create trigger registration_promo_codes_count\s+before insert or update on public\.registration_promo_codes/)
    expect(counted).toContain('new.uses := public.registration_promo_uses(new.id);')
  })

  it('is counted again after any statement that makes, changes or removes registrations — once a statement, not once a row', () => {
    for (const [name, when] of [['made', 'insert'], ['changed', 'update'], ['gone', 'delete']])
      expect(counted).toMatch(new RegExp(`create trigger registration_orders_count_promo_${name}\\s+after ${when} on public\\.registration_orders\\s+referencing [^;]*\\s+for each statement`))
  })

  it('holds the limit where the count is kept: a registration that has just taken a use cannot leave its code over it', () => {
    expect(counted).toContain("raise exception 'That promo code has no uses left.';")
  })

  it('asks whether a code has a use left in one place, under a lock on the code', () => {
    expect(counted).toMatch(/create or replace function public\.registration_promo_has_use\(p_id uuid\)[\s\S]*?where p\.id = p_id for update;/)
    // Put back, Undo of a cancellation, Undo of a code taken off.
    expect(code(counted).split('not public.registration_promo_has_use(').length - 1).toBe(3)
  })

  it('asks about the invitation and the code before the ticket types are locked, as registering does', () => {
    const body = (name: string) => code(counted).split(`FUNCTION public.${name}(`)[1]
    for (const name of ['registration_order_mark', 'registration_order_undo']) {
      const text = body(name)
      const codeAsked = text.indexOf('registration_promo_has_use(o.promo_code_id)')
      const invitationAsked = text.indexOf('from public.registration_invites i where i.id = o.invite_id for update')
      const typesLocked = text.indexOf('from public.registration_ticket_types where event_id = o.event_id for update')
      expect(invitationAsked).toBeGreaterThan(-1)
      expect(invitationAsked).toBeLessThan(codeAsked)
      expect(codeAsked).toBeLessThan(typesLocked)
    }
  })

  it('is not added to or taken from by hand, in 0300 or any migration after it', () => {
    const late = Object.entries(migrations).filter(([path]) => numberOf(path) >= 300)
    expect(late.length).toBeGreaterThan(0)
    expect(late.flatMap(([path, sql]) => writesByHand(sql).map((value) => `${numberOf(path)}: uses = ${value}`))).toEqual([])
  })

  it('…which the test would catch: the migrations before it did', () => {
    const early = Object.entries(migrations).filter(([path]) => numberOf(path) >= 295 && numberOf(path) < 300)
    expect(early.flatMap(([, sql]) => writesByHand(sql)).length).toBeGreaterThan(0)
  })

  it('reads a hand-written count however it is laid out, and nothing else as one', () => {
    // Over two lines; with an alias; in an upsert.
    expect(writesByHand('update public.registration_promo_codes set uses = uses\n  + 1 where id = promo.id;')).toEqual(['uses + 1'])
    expect(writesByHand('update registration_promo_codes c set active = true, uses = greatest(c.uses - 1, 0) where c.id = x;')).toEqual(['greatest(c.uses - 1'])
    expect(writesByHand('insert into public.registration_promo_codes (id) values (x) on conflict (id) do update set uses = 3;')).toEqual(['3'])
    // Writing a code again, which counts it; a condition on the number; a comment about the old way.
    expect(writesByHand('update public.registration_promo_codes p set uses = p.uses where p.id = any (codes);')).toEqual([])
    expect(writesByHand('update registration_promo_codes c set uses = c.uses;')).toEqual([])
    expect(writesByHand('update public.registration_promo_codes set active = false where uses = 0;')).toEqual([])
    expect(writesByHand('-- update public.registration_promo_codes set uses = uses + 1;\nselect 1;')).toEqual([])
  })

  it('refuses a put-back, and an undo of a cancellation, over a code with no use left', () => {
    const words = 'The promo code on this registration has been used again since, and has no uses left. Register them again instead.'
    expect(counted.split(words).length - 1).toBe(2)
  })

  it('counts the numbers as they stand, once', () => {
    expect(code(counted)).toMatch(/update public\.registration_promo_codes set uses = uses;/)
  })
})
