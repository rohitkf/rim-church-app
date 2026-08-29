import { describe, expect, it } from 'vitest'
import { COORDINATOR_ROLE, isCoordinatorRole } from './useTeamCoordinator'

describe('isCoordinatorRole', () => {
  it('recognises the built-in role', () => {
    expect(isCoordinatorRole(COORDINATOR_ROLE)).toBe(true)
  })

  // The rota stores a role as free text, and is_rota_coordinator() compares
  // it with lower(). The two have to agree, or the button and the database
  // give different answers to the same question.
  it('matches however it was typed, like the SQL side does', () => {
    for (const spelling of ['coordinator', 'COORDINATOR', 'Coordinator', '  Coordinator  ']) {
      expect(isCoordinatorRole(spelling)).toBe(true)
    }
  })

  it('does not match a role that merely mentions coordinating', () => {
    for (const other of ['Coordinator 2', 'Stage Coordinator', 'Director', '']) {
      expect(isCoordinatorRole(other)).toBe(false)
    }
  })
})
