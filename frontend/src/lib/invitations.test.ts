import { describe, expect, it } from 'vitest'
import {
  STALE_AFTER_DAYS,
  invitationStatus,
  invitationTally,
  matchesFilter,
  orderInvitations,
} from './invitations'
import type { Invitation } from './types'

const NOW = new Date('2026-03-01T12:00:00Z').getTime()
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString()

function invitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: 'inv-1',
    email: 'grace@rehoboth.org',
    department_id: null,
    invited_by: null,
    created_at: daysAgo(1),
    accepted_at: null,
    inviter: null,
    department: null,
    ...overrides,
  }
}

describe('invitationStatus', () => {
  it('calls an answered invitation accepted, however old it is', () => {
    const inv = invitation({ created_at: daysAgo(400), accepted_at: daysAgo(399) })
    expect(invitationStatus(inv, NOW)).toBe('accepted')
  })

  it('leaves a recent unanswered invitation simply waiting', () => {
    expect(invitationStatus(invitation({ created_at: daysAgo(2) }), NOW)).toBe('waiting')
  })

  it('marks one that has sat past the window, so somebody thinks to ask in person', () => {
    expect(invitationStatus(invitation({ created_at: daysAgo(STALE_AFTER_DAYS + 1) }), NOW)).toBe('stale')
  })

  it('turns stale on the boundary day rather than the day after', () => {
    expect(invitationStatus(invitation({ created_at: daysAgo(STALE_AFTER_DAYS) }), NOW)).toBe('stale')
    expect(invitationStatus(invitation({ created_at: daysAgo(STALE_AFTER_DAYS - 1) }), NOW)).toBe('waiting')
  })
})

describe('matchesFilter', () => {
  const waiting = invitation({ id: 'a' })
  const accepted = invitation({ id: 'b', accepted_at: daysAgo(1) })

  it('keeps everything under "all"', () => {
    expect(matchesFilter(waiting, 'all')).toBe(true)
    expect(matchesFilter(accepted, 'all')).toBe(true)
  })

  it('reads outstanding as unanswered, not as recent', () => {
    expect(matchesFilter(waiting, 'outstanding')).toBe(true)
    expect(matchesFilter(accepted, 'outstanding')).toBe(false)
  })

  it('reads accepted as answered', () => {
    expect(matchesFilter(accepted, 'accepted')).toBe(true)
    expect(matchesFilter(waiting, 'accepted')).toBe(false)
  })
})

describe('orderInvitations', () => {
  it('puts the people who have not arrived above the ones who have', () => {
    const rows = [
      invitation({ id: 'in', created_at: daysAgo(1), accepted_at: daysAgo(1) }),
      invitation({ id: 'out', created_at: daysAgo(30) }),
    ]
    expect(orderInvitations(rows).map((r) => r.id)).toEqual(['out', 'in'])
  })

  it('shows the newest first within a group', () => {
    const rows = [
      invitation({ id: 'old', created_at: daysAgo(9) }),
      invitation({ id: 'new', created_at: daysAgo(1) }),
      invitation({ id: 'middle', created_at: daysAgo(4) }),
    ]
    expect(orderInvitations(rows).map((r) => r.id)).toEqual(['new', 'middle', 'old'])
  })

  it('leaves the array it was given alone', () => {
    const rows = [invitation({ id: 'a', accepted_at: daysAgo(1) }), invitation({ id: 'b' })]
    orderInvitations(rows)
    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
  })
})

describe('invitationTally', () => {
  it('counts a stale invitation as outstanding as well as stale', () => {
    const tally = invitationTally(
      [
        invitation({ id: 'a', accepted_at: daysAgo(1) }),
        invitation({ id: 'b', created_at: daysAgo(2) }),
        invitation({ id: 'c', created_at: daysAgo(60) }),
      ],
      NOW,
    )
    expect(tally).toEqual({ total: 3, accepted: 1, outstanding: 2, stale: 1 })
  })

  it('has nothing to report for an empty list', () => {
    expect(invitationTally([], NOW)).toEqual({ total: 0, accepted: 0, outstanding: 0, stale: 0 })
  })
})
