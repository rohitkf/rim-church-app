import { describe, expect, it } from 'vitest'
import { memberStanding } from './memberStanding'

describe('what to call someone with no role', () => {
  it('calls a member of a team a team member', () => {
    expect(memberStanding(false, [{ member_type: 'core' }])).toBe('team-member')
  })

  it('calls someone who only helps out a guest', () => {
    expect(memberStanding(false, [{ member_type: 'guest' }])).toBe('guest')
  })

  it('prefers the core membership when someone is both', () => {
    expect(memberStanding(false, [{ member_type: 'guest' }, { member_type: 'core' }])).toBe(
      'team-member',
    )
  })

  it('says nothing for someone who already wears a role', () => {
    expect(memberStanding(true, [{ member_type: 'core' }])).toBeNull()
  })

  it('says nothing about someone on no team at all', () => {
    expect(memberStanding(false, [])).toBeNull()
  })
})
