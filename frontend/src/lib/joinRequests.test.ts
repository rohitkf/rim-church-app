import { describe, expect, it } from 'vitest'
import { canPostOnBoard, joinOptions, joinableTeams } from './joinRequests'
import type { Department, JoinRequest } from './types'

function dept(id: string, name: string): Department {
  return {
    id,
    name,
    handbook_url: null,
    color: null,
    is_service_flow: false,
    is_worship: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function request(department_id: string, status: JoinRequest['status'], id = `r-${department_id}`): JoinRequest {
  return {
    id,
    user_id: 'me',
    department_id,
    status,
    note: null,
    created_at: '2026-01-01T00:00:00Z',
    responded_at: null,
    granted_type: null,
    requester: null,
    department: null,
  }
}

const media = dept('d1', 'Media')
const worship = dept('d2', 'Worship')
const ushers = dept('d3', 'Ushers')

describe('joinOptions', () => {
  it('calls a team you belong to a membership, not an opportunity', () => {
    const [option] = joinOptions([media], ['d1'], [])
    expect(option.state).toBe('member')
    expect(option.requestId).toBeNull()
  })

  it('surfaces an open ask so it can be withdrawn', () => {
    const [option] = joinOptions([media], [], [request('d1', 'pending', 'req-1')])
    expect(option.state).toBe('pending')
    expect(option.requestId).toBe('req-1')
  })

  it('lets someone ask again after withdrawing', () => {
    const [option] = joinOptions([media], [], [request('d1', 'withdrawn')])
    expect(option.state).toBe('open')
  })

  it('remembers a refusal without closing the door', () => {
    const [option] = joinOptions([media], [], [request('d1', 'declined')])
    expect(option.state).toBe('declined')
    expect(option.requestId).toBeNull()
  })

  it('prefers the open ask when an older one was declined', () => {
    const [option] = joinOptions(
      [media],
      [],
      [request('d1', 'pending', 'new'), request('d1', 'declined', 'old')],
    )
    expect(option.state).toBe('pending')
    expect(option.requestId).toBe('new')
  })

  it('keeps membership ahead of a stale request row', () => {
    const [option] = joinOptions([media], ['d1'], [request('d1', 'pending')])
    expect(option.state).toBe('member')
  })
})

describe('joinableTeams', () => {
  it('leaves out the teams you are already on', () => {
    const options = joinOptions([media, worship, ushers], ['d2'], [request('d3', 'pending')])
    expect(joinableTeams(options).map((o) => o.department.name)).toEqual(['Media', 'Ushers'])
  })
})

describe('canPostOnBoard', () => {
  it('turns a brand-new account away', () => {
    expect(canPostOnBoard({ isAdmin: false, isHead: false, memberDeptIds: [] })).toBe(false)
  })

  it('lets a volunteer on one team speak for it', () => {
    expect(canPostOnBoard({ isAdmin: false, isHead: false, memberDeptIds: ['d1'] })).toBe(true)
  })

  it('lets an Admin speak for the church without belonging anywhere', () => {
    expect(canPostOnBoard({ isAdmin: true, isHead: false, memberDeptIds: [] })).toBe(true)
  })

  it('lets a head speak for the team they lead', () => {
    expect(canPostOnBoard({ isAdmin: false, isHead: true, memberDeptIds: [] })).toBe(true)
  })
})
