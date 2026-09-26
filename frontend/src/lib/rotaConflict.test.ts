import { describe, expect, it } from 'vitest'
import { availableFirst, rotaConflict } from './rotaConflict'
import { isRotaClash } from './humanError'

const held = (over: Partial<{ id: string; department_id: string; role_label: string; user_id: string; service_id: string }>) => ({
  id: 'a1',
  service_id: 'sun',
  department_id: 'media',
  user_id: 'bhanu',
  role_label: 'Camera Operator 1',
  ...over,
})

const wanted = (roleLabel: string, departmentId = 'media') => ({
  serviceId: 'sun',
  departmentId,
  userId: 'bhanu',
  roleLabel,
})

describe('what stops a second role at one service', () => {
  it('stops a second role in the same team', () => {
    expect(rotaConflict([held({})], wanted('Technical Director'))?.id).toBe('a1')
  })

  it('stops a second role in another team too', () => {
    expect(rotaConflict([held({ department_id: 'worship' })], wanted('Technical Director'))?.id).toBe('a1')
  })

  it('lets a Coordinator take a role as well', () => {
    expect(rotaConflict([held({ role_label: 'Team Coordinator' })], wanted('Camera Operator 2'))).toBeNull()
  })

  it('lets someone with a role coordinate as well', () => {
    expect(rotaConflict([held({})], wanted('Team Coordinator'))).toBeNull()
  })

  it('stops coordinating the same team twice, but not a second team', () => {
    const coordinating = [held({ role_label: 'Team Coordinator' })]
    expect(rotaConflict(coordinating, wanted('Coordinator'))?.id).toBe('a1')
    expect(rotaConflict(coordinating, wanted('Team Coordinator', 'worship'))).toBeNull()
  })

  it('leaves other services and other people alone', () => {
    expect(rotaConflict([held({ service_id: 'next-sun' })], wanted('Technical Director'))).toBeNull()
    expect(rotaConflict([held({ user_id: 'joel' })], wanted('Technical Director'))).toBeNull()
  })
})

describe('recognising the database saying the same', () => {
  it('knows both of the rota’s one-role rules', () => {
    expect(
      isRotaClash({
        code: '23505',
        message: 'duplicate key value violates unique constraint "rota_assignments_one_role_per_service"',
      }),
    ).toBe(true)
    expect(isRotaClash({ code: '23505', details: 'rota_assignments_one_coordinator_per_team' })).toBe(true)
  })

  it('leaves every other failure to the ordinary message', () => {
    expect(isRotaClash({ code: '42501', message: 'new row violates row-level security policy' })).toBe(false)
    expect(isRotaClash(new Error('offline'))).toBe(false)
    expect(isRotaClash(null)).toBe(false)
  })
})

describe('the order of the person list', () => {
  it('puts whoever can take the role first, each half in its own order', () => {
    const list = [
      { value: 'joel', disabled: true },
      { value: 'santhi', disabled: true },
      { value: 'alfin' },
      { value: 'aswin', disabled: true },
      { value: 'bhanu' },
    ]
    expect(availableFirst(list).map((o) => o.value)).toEqual(['alfin', 'bhanu', 'joel', 'santhi', 'aswin'])
  })
})
