import { beforeEach, describe, expect, it, vi } from 'vitest'
import { assigneeInitials, assigneeName, namesOn, peopleOn, refOf, saveAssignees } from './sessionAssignees'
import type { SessionAssignee } from './types'

/*
 * The database, as far as this module can tell: what was deleted, what
 * was inserted, and what was moved. Saving a list of people is three
 * kinds of write, and which of them happen is the whole behaviour.
 */
const deletes: unknown[] = []
const inserts: unknown[] = []
const updates: { patch: unknown; id: unknown }[] = []

vi.mock('./supabaseClient', () => ({
  supabase: {
    from: () => ({
      delete: () => ({
        in: (_column: string, ids: unknown) => {
          deletes.push(ids)
          return Promise.resolve({ error: null })
        },
      }),
      insert: (rows: unknown) => {
        inserts.push(rows)
        return Promise.resolve({ error: null })
      },
      update: (patch: unknown) => ({
        eq: (_column: string, id: unknown) => {
          updates.push({ patch, id })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  },
}))

const member = (id: string, order: number, first: string, last: string): SessionAssignee => ({
  id: `row-${id}`,
  user_id: id,
  guest_id: null,
  order_index: order,
  profile: { id, first_name: first, last_name: last },
  guest: null,
})

const guest = (id: string, order: number, name: string, title?: string): SessionAssignee => ({
  id: `row-${id}`,
  user_id: null,
  guest_id: id,
  order_index: order,
  profile: null,
  guest: { id, name, title: title ?? null, note: null },
})

beforeEach(() => {
  deletes.length = 0
  inserts.length = 0
  updates.length = 0
})

describe('reading who is on a session', () => {
  it('keeps them in the order somebody put them, not the order they came back', () => {
    const session = { assignees: [member('u2', 1, 'Tunde', 'Alabi'), member('u1', 0, 'Grace', 'Mensah')] }
    expect(namesOn(session)).toEqual(['Grace Mensah', 'Tunde Alabi'])
  })

  it('prints a guest with their designation in front of their name', () => {
    expect(assigneeName(guest('g1', 0, 'Sam Varghese', 'Pastor'))).toBe('Pastor Sam Varghese')
  })

  // A row whose person has been deleted has no name to print, and a blank
  // pill on a running order is worse than one fewer.
  it('has no name for a row whose person is gone, and leaves them off', () => {
    const orphan: SessionAssignee = { id: 'row-x', user_id: 'u9', guest_id: null, order_index: 0 }
    expect(assigneeName(orphan)).toBeNull()
    expect(namesOn({ assignees: [orphan, member('u1', 1, 'Grace', 'Mensah')] })).toEqual(['Grace Mensah'])
  })

  it('takes a guest’s initials from their name rather than their title', () => {
    expect(assigneeInitials(guest('g1', 0, 'Sam Varghese', 'Pastor'))).toBe('SV')
    expect(assigneeInitials(member('u1', 0, 'Grace', 'Mensah'))).toBe('GM')
  })

  it('addresses a row by whichever of the two it is', () => {
    expect(refOf(member('u1', 0, 'Grace', 'Mensah'))).toEqual({ kind: 'member', id: 'u1' })
    expect(refOf(guest('g1', 0, 'Sam'))).toEqual({ kind: 'guest', id: 'g1' })
  })
})

describe('saving who is on a session', () => {
  it('adds the new one and leaves everybody already on it alone', async () => {
    await saveAssignees('s1', [member('u1', 0, 'Grace', 'Mensah')], [
      { kind: 'member', id: 'u1' },
      { kind: 'member', id: 'u2' },
    ])

    expect(deletes).toEqual([])
    expect(inserts).toEqual([[{ session_id: 's1', user_id: 'u2', guest_id: null, order_index: 1 }]])
    expect(updates).toEqual([])
  })

  it('removes only the person who left', async () => {
    const people = [member('u1', 0, 'Grace', 'Mensah'), member('u2', 1, 'Tunde', 'Alabi')]
    await saveAssignees('s1', people, [{ kind: 'member', id: 'u2' }])

    expect(deletes).toEqual([['row-u1']])
    expect(inserts).toEqual([])
    // And the one who stayed moves up into the gap they left.
    expect(updates).toEqual([{ patch: { order_index: 0 }, id: 'row-u2' }])
  })

  it('writes a guest as a guest', async () => {
    await saveAssignees('s1', [], [{ kind: 'guest', id: 'g1' }])
    expect(inserts).toEqual([[{ session_id: 's1', user_id: null, guest_id: 'g1', order_index: 0 }]])
  })

  it('clears the lot when nobody is on it any more', async () => {
    await saveAssignees('s1', [member('u1', 0, 'Grace', 'Mensah'), guest('g1', 1, 'Sam')], [])
    expect(deletes).toEqual([['row-u1', 'row-g1']])
    expect(inserts).toEqual([])
  })

  /*
   * Every row on this table is an entry in the activity feed and a
   * realtime message to every other screen, so re-writing the whole list
   * for one change would tell the church that six things happened.
   */
  it('writes nothing at all when the list has not changed', async () => {
    const people = [member('u1', 0, 'Grace', 'Mensah'), member('u2', 1, 'Tunde', 'Alabi')]
    await saveAssignees('s1', people, [
      { kind: 'member', id: 'u1' },
      { kind: 'member', id: 'u2' },
    ])

    expect([deletes, inserts, updates]).toEqual([[], [], []])
  })

  it('re-numbers somebody who has been moved down the list', async () => {
    const people = [member('u1', 0, 'Grace', 'Mensah'), member('u2', 1, 'Tunde', 'Alabi')]
    await saveAssignees('s1', people, [
      { kind: 'member', id: 'u2' },
      { kind: 'member', id: 'u1' },
    ])

    expect(peopleOn({ assignees: people }).map((p) => p.id)).toEqual(['row-u1', 'row-u2'])
    expect(updates).toEqual([
      { patch: { order_index: 1 }, id: 'row-u1' },
      { patch: { order_index: 0 }, id: 'row-u2' },
    ])
  })
})
