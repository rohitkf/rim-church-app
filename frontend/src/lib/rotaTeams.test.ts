import { describe, expect, it } from 'vitest'
import { seesEveryTeamRota } from './rotaTeams'

const departments = [
  { id: 'sfc', is_service_flow: true },
  { id: 'media', is_service_flow: false },
]
const base = { seesAllTeams: false, assignsAnywhere: false, departments }

describe('seesEveryTeamRota', () => {
  it('shows every team to anybody on the Service Flow Coordinator team', () => {
    expect(seesEveryTeamRota({ ...base, ownTeamIds: ['sfc'] })).toBe(true)
    expect(seesEveryTeamRota({ ...base, ownTeamIds: ['media', 'sfc'] })).toBe(true)
  })

  it('keeps everybody else to their own teams', () => {
    expect(seesEveryTeamRota({ ...base, ownTeamIds: ['media'] })).toBe(false)
    expect(seesEveryTeamRota({ ...base, ownTeamIds: [] })).toBe(false)
  })

  it('still shows every team to Admins, Overwatch and whoever assigns anywhere', () => {
    expect(seesEveryTeamRota({ ...base, ownTeamIds: [], seesAllTeams: true })).toBe(true)
    expect(seesEveryTeamRota({ ...base, ownTeamIds: [], assignsAnywhere: true })).toBe(true)
  })
})
