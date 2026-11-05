import { describe, expect, it } from 'vitest'
import { availabilityLink, availabilityTeamAnchor } from './availabilityLink'

describe('availabilityLink', () => {
  it('names the service and the team for the Availability page', () => {
    expect(availabilityLink('s1', 'd1')).toBe('/availability?service=s1&team=d1')
  })

  it('anchors one team under one service', () => {
    expect(availabilityTeamAnchor('s1', 'd1')).toBe('availability-s1-d1')
  })
})
