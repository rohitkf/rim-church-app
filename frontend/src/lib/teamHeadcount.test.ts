import { describe, expect, it } from 'vitest'
import { teamHeadcounts } from './teamHeadcount'

describe('a team’s headcount', () => {
  it('counts core members and guests apart, and both together', () => {
    const counts = teamHeadcounts([
      { department_id: 'worship', member_type: 'core' },
      { department_id: 'worship', member_type: 'core' },
      { department_id: 'worship', member_type: 'guest' },
      { department_id: 'media', member_type: 'guest' },
    ])
    expect(counts.get('worship')).toEqual({ core: 2, guest: 1, total: 3 })
    expect(counts.get('media')).toEqual({ core: 0, guest: 1, total: 1 })
    expect(counts.get('audio')).toBeUndefined()
  })
})
