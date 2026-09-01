import { describe, expect, it } from 'vitest'
import { DESIGNATION_RANK, designationOn } from './designation'
import type { UserRole } from '../auth/types'

const grant = (role_type: UserRole['role_type'], department_id: string | null): UserRole => ({
  id: `${role_type}-${department_id}`,
  role_type,
  department_id,
  service_id: null,
})

describe('designationOn', () => {
  it('calls somebody with no grant on this team a member', () => {
    expect(designationOn([], 'd1')).toBe('member')
    expect(designationOn([grant('department_head', 'd2')], 'd1')).toBe('member')
  })

  it('recognises a head and a deputy of this team', () => {
    expect(designationOn([grant('department_head', 'd1')], 'd1')).toBe('head')
    expect(designationOn([grant('assisting_head', 'd1')], 'd1')).toBe('assisting')
  })

  it('gives the higher of the two when somebody holds both', () => {
    expect(
      designationOn([grant('assisting_head', 'd1'), grant('department_head', 'd1')], 'd1'),
    ).toBe('head')
  })

  it('is not fooled by an Admin grant, which belongs to no team', () => {
    expect(designationOn([grant('admin', null)], 'd1')).toBe('member')
  })

  it('sorts heads above deputies above everyone else', () => {
    expect(DESIGNATION_RANK.head).toBeLessThan(DESIGNATION_RANK.assisting)
    expect(DESIGNATION_RANK.assisting).toBeLessThan(DESIGNATION_RANK.member)
  })
})
