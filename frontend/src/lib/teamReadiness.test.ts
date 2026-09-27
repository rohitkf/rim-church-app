import { describe, expect, it } from 'vitest'
import { mayMarkReady, servingTeams, teamLights, type ReadinessRow } from './teamReadiness'

const row = (over: Partial<ReadinessRow>): ReadinessRow => ({
  service_id: 's1',
  department_id: 'media',
  ready: true,
  marked_at: '2026-09-27T08:42:00Z',
  marker: { first_name: 'Santhi', last_name: 'Chennamsetti' },
  ...over,
})

describe('the ready lights', () => {
  it('is red for a team nobody has marked', () => {
    const { lights, allReady } = teamLights('s1', ['media', 'audio'], [row({})])
    expect(lights.map((l) => [l.departmentId, l.ready])).toEqual([
      ['media', true],
      ['audio', false],
    ])
    expect(allReady).toBe(false)
  })

  it('says who turned it green', () => {
    const [media] = teamLights('s1', ['media'], [row({})]).lights
    expect(media.by).toBe('Santhi Chennamsetti')
  })

  it('is ready for service only once every serving team is green', () => {
    expect(teamLights('s1', ['media', 'audio'], [row({}), row({ department_id: 'audio' })]).allReady).toBe(true)
    expect(teamLights('s1', ['media', 'audio'], [row({}), row({ department_id: 'audio', ready: false })]).allReady).toBe(false)
  })

  it('never says ready for a service with no teams on it', () => {
    expect(teamLights('s1', [], []).allReady).toBe(false)
  })

  it('keeps one service’s lights off another', () => {
    expect(teamLights('s2', ['media'], [row({})]).lights[0].ready).toBe(false)
  })

  it('counts a team as serving when the rota has put somebody from it on the service', () => {
    const rota = [
      { service_id: 's1', department_id: 'media' },
      { service_id: 's1', department_id: 'media' },
      { service_id: 's1', department_id: 'audio' },
      { service_id: 's2', department_id: 'worship' },
    ]
    expect(servingTeams('s1', rota)).toEqual(['media', 'audio'])
  })
})

describe('who may turn a light', () => {
  const rota = [
    { service_id: 's1', department_id: 'media', user_id: 'santhi', role_label: 'Team Coordinator' },
    { service_id: 's1', department_id: 'media', user_id: 'joel', role_label: 'Camera Operator 1' },
  ]
  const ask = (over: Partial<Parameters<typeof mayMarkReady>[0]>) =>
    mayMarkReady({ isAdmin: false, isHead: false, myId: 'joel', serviceId: 's1', departmentId: 'media', assignments: rota, ...over })

  it('lets the team’s Coordinator at that service', () => {
    expect(ask({ myId: 'santhi' })).toBe(true)
  })
  it('does not let the Coordinator of another service or team', () => {
    expect(ask({ myId: 'santhi', serviceId: 's2' })).toBe(false)
    expect(ask({ myId: 'santhi', departmentId: 'audio' })).toBe(false)
  })
  it('lets a Head or an Admin', () => {
    expect(ask({ isHead: true })).toBe(true)
    expect(ask({ isAdmin: true })).toBe(true)
  })
  it('does not let anybody else on the rota', () => {
    expect(ask({})).toBe(false)
  })
})
