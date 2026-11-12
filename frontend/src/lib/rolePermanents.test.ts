import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EVERY_SERVICE,
  atWords,
  changedWords,
  endedWords,
  fetchRolePermanents,
  fetchServiceKinds,
  fetchTeamPeople,
  madeWords,
  permanentLine,
  personName,
  removeRolePermanent,
  serviceKinds,
  setRolePermanent,
  type RolePermanent,
} from './rolePermanents'

/*
 * Permanent people on a role (0282), the app's half: what is read, the two
 * calls, and the words. Who may and what happens to the rota are the
 * database's and are proved there.
 */

const db = vi.hoisted(() => ({
  calls: [] as unknown[][],
  rows: [] as unknown[],
  answer: null as unknown,
  error: null as null | { message: string },
}))

vi.mock('./supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: (cols: string) => {
        const done = () => Promise.resolve({ data: db.rows, error: db.error })
        return {
          in: (col: string, ids: string[]) => ({
            order: (by: string) => {
              db.calls.push([table, cols, 'in', col, ids, 'order', by])
              return done()
            },
          }),
          eq: (col: string, value: string) => {
            db.calls.push([table, cols, 'eq', col, value])
            return done()
          },
          gte: (col: string, value: string) => {
            db.calls.push([table, cols, 'gte', col, value])
            return done()
          },
        }
      },
    }),
    rpc: (fn: string, args: unknown) => {
      db.calls.push(['rpc', fn, args])
      return Promise.resolve({ data: db.answer, error: db.error })
    },
  },
}))

const permanent = (over: Partial<RolePermanent>): RolePermanent => ({
  id: 'p1',
  role_id: 'r1',
  department_id: 'd1',
  user_id: 'u-joel',
  service_type: null,
  person: { id: 'u-joel', first_name: 'Joel', last_name: 'Skaria' },
  ...over,
})

beforeEach(() => {
  db.calls = []
  db.rows = []
  db.answer = null
  db.error = null
})

describe('reading', () => {
  it('reads a team’s permanent people with their names, oldest arrangement first', async () => {
    db.rows = [permanent({})]
    await expect(fetchRolePermanents(['d1'])).resolves.toEqual([permanent({})])
    const [table, cols, , col, ids, , by] = db.calls[0] as string[]
    expect(table).toBe('department_role_permanents')
    // The person, by the foreign key that names them — the table has a second one to profiles (who made it).
    expect(cols).toContain('person:profiles!department_role_permanents_user_id_fkey(id, first_name, last_name)')
    expect([col, ids, by]).toEqual(['department_id', ['d1'], 'created_at'])
  })

  it('asks nothing for no teams', async () => {
    await expect(fetchRolePermanents([])).resolves.toEqual([])
    expect(db.calls).toEqual([])
  })

  it('lists a team’s people by name, A to Z', async () => {
    db.rows = [
      { user_id: 'u2', profiles: { id: 'u2', first_name: 'Joel', last_name: 'Skaria' } },
      { user_id: 'u1', profiles: { id: 'u1', first_name: 'Ama', last_name: 'Owusu' } },
      { user_id: 'u3', profiles: null },
    ]
    await expect(fetchTeamPeople('d1')).resolves.toEqual([
      { id: 'u1', name: 'Ama Owusu' },
      { id: 'u2', name: 'Joel Skaria' },
      { id: 'u3', name: 'Somebody' },
    ])
    expect(db.calls[0].slice(0, 1).concat(db.calls[0].slice(2))).toEqual(['department_members', 'eq', 'department_id', 'd1'])
  })

  it('offers the kinds of service still to come, each once', async () => {
    db.rows = [{ service_type: 'Malayalam Service' }, { service_type: 'English Service' }, { service_type: 'english service ' }]
    await expect(fetchServiceKinds()).resolves.toEqual(['English Service', 'Malayalam Service'])
    const [table, , how, col, from] = db.calls[0] as string[]
    expect([table, how, col]).toEqual(['services', 'gte', 'date'])
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('the two calls', () => {
  it('makes somebody permanent and answers how many services they were put on', async () => {
    db.answer = 6
    await expect(setRolePermanent('r1', 'u-joel', null)).resolves.toBe(6)
    await expect(setRolePermanent('r1', 'u-ama', 'English Service')).resolves.toBe(6)
    expect(db.calls).toEqual([
      ['rpc', 'set_role_permanent', { p_role: 'r1', p_person: 'u-joel', p_service_type: null }],
      ['rpc', 'set_role_permanent', { p_role: 'r1', p_person: 'u-ama', p_service_type: 'English Service' }],
    ])
  })

  it('ends it and answers how many services they came off', async () => {
    db.answer = 4
    await expect(removeRolePermanent('r1', 'u-joel')).resolves.toBe(4)
    expect(db.calls).toEqual([['rpc', 'remove_role_permanent', { p_role: 'r1', p_person: 'u-joel' }]])
  })

  it('hands the database’s refusal on, in its own words', async () => {
    db.error = { message: 'They are not on this team. Add them to the team first.' }
    await expect(setRolePermanent('r1', 'u-nell', null)).rejects.toEqual(db.error)
    await expect(removeRolePermanent('r1', 'u-nell')).rejects.toEqual(db.error)
  })
})

describe('the kinds of service', () => {
  it('are each said once, however they were capitalised or spaced, A to Z', () => {
    expect(serviceKinds(['Malayalam Service', ' English Service', 'english service', '', 'Malayalam Service'])).toEqual(['English Service', 'Malayalam Service'])
  })

  it('keep one somebody already has, though no such service is planned', () => {
    expect(serviceKinds(['English Service'], ['Youth Service', null, 'english service'])).toEqual(['English Service', 'Youth Service'])
  })
})

describe('the words', () => {
  it('says where somebody is permanent', () => {
    expect(atWords(null)).toBe(EVERY_SERVICE)
    expect(atWords('  ')).toBe(EVERY_SERVICE)
    expect(atWords(' English Service ')).toBe('English Service')
  })

  it('names a role’s permanent people on one line, the kind in brackets where there is one', () => {
    expect(
      permanentLine([
        permanent({}),
        permanent({ id: 'p2', user_id: 'u-ama', service_type: 'English Service', person: { id: 'u-ama', first_name: 'Ama', last_name: 'Owusu' } }),
        permanent({ id: 'p3', user_id: 'u-x', person: null }),
      ]),
    ).toBe('Joel Skaria · Ama Owusu (English Service) · Somebody')
  })

  it('names a person, or says somebody', () => {
    expect(personName({ first_name: 'Joel', last_name: '' })).toBe('Joel')
    expect(personName(null)).toBe('Somebody')
  })

  it('says what making somebody permanent did to the rota', () => {
    expect(madeWords('Joel Skaria', 'Sound Desk', 6)).toBe('Joel Skaria is permanent on Sound Desk: on the rota for 6 services to come')
    expect(madeWords('Joel Skaria', 'Sound Desk', 1)).toBe('Joel Skaria is permanent on Sound Desk: on the rota for 1 service to come')
    // Already on everything, away, or nothing planned: true, and not alarming.
    expect(madeWords('Joel Skaria', 'Sound Desk', 0)).toBe('Joel Skaria is permanent on Sound Desk. No service to come needed changing')
  })

  it('says what changing the services did', () => {
    expect(changedWords('Ama Owusu', 'Malayalam Service', 3)).toBe('Ama Owusu is now permanent at Malayalam Service only: added to 3 services to come')
    expect(changedWords('Ama Owusu', null, 0)).toBe('Ama Owusu is now permanent at every service')
  })

  it('says what ending it did', () => {
    expect(endedWords('Joel Skaria', 'Sound Desk', 2)).toBe('Joel Skaria is no longer permanent on Sound Desk: off 2 services to come')
    expect(endedWords('Joel Skaria', 'Sound Desk', 0)).toBe('Joel Skaria is no longer permanent on Sound Desk')
  })
})
