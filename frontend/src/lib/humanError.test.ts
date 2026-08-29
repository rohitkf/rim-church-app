import { describe, expect, it } from 'vitest'
import { humanError } from './humanError'

const duplicateRota = {
  code: '23505',
  message:
    'duplicate key value violates unique constraint "rota_assignments_one_role_per_service"',
}
const duplicateCoordinator = {
  code: '23505',
  message:
    'duplicate key value violates unique constraint "rota_assignments_one_coordinator_per_team"',
}
const ourRule = { code: 'P0001', message: 'Only the team head can change a count' }
const rlsRefusal = {
  code: '42501',
  message: 'new row violates row-level security policy for table "messages"',
}

describe('humanError', () => {
  it('explains the rule to someone who is not an Admin', () => {
    const text = humanError(duplicateRota, 'Could not assign that role.', false)
    expect(text).toContain('one role per service')
    expect(text).not.toContain('duplicate key')
  })

  it('gives an Admin the raw message as well', () => {
    const text = humanError(duplicateRota, 'Could not assign that role.', true)
    expect(text).toContain('one role per service')
    expect(text).toContain('rota_assignments_one_role_per_service')
  })

  it('names Coordinator as the exception, since that is the rule people trip on', () => {
    const text = humanError(duplicateRota, 'Could not assign that role.', false)
    expect(text).toContain('apart from Coordinator')
  })

  it('tells a second Coordinator apart from a second job', () => {
    const text = humanError(duplicateCoordinator, 'Could not assign that role.', false)
    expect(text).toContain('Coordinator for this service')
    expect(text).not.toContain('duplicate key')
  })

  it('passes our own function messages through untouched — they are already for people', () => {
    expect(humanError(ourRule, 'fallback', false)).toBe('Only the team head can change a count')
    expect(humanError(ourRule, 'fallback', true)).toBe('Only the team head can change a count')
  })

  it('reads a permission refusal as permission, not as SQL', () => {
    expect(humanError(rlsRefusal, 'fallback', false)).toBe("You don't have permission to do that.")
  })

  it('falls back rather than showing an unknown database error to a volunteer', () => {
    const odd = { code: 'XX000', message: 'internal wibble' }
    expect(humanError(odd, 'Could not save that.', false)).toBe('Could not save that.')
    expect(humanError(odd, 'Could not save that.', true)).toBe('internal wibble')
  })
})
