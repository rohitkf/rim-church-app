import { describe, expect, it } from 'vitest'
import { readinessOf, serviceReadiness } from './readiness'

describe('readinessOf', () => {
  it('gives each stage a third of the item', () => {
    expect(readinessOf({ total: 3, memberComplete: 1, headVerified: 1, coordinatorVerified: 1 }).pct).toBe(67)
  })

  it('is 100 only when everything is signed off', () => {
    expect(readinessOf({ total: 2, memberComplete: 0, headVerified: 0, coordinatorVerified: 2 }).pct).toBe(100)
    expect(readinessOf({ total: 2, memberComplete: 2, headVerified: 0, coordinatorVerified: 0 }).pct).toBe(33)
  })

  it('reports nothing rather than zero when there is no work', () => {
    expect(readinessOf({ total: 0, memberComplete: 0, headVerified: 0, coordinatorVerified: 0 }).pct).toBeNull()
  })
})

describe('serviceReadiness', () => {
  const assignments = [
    { id: 'a1', service_id: 's1', department_id: 'media', role_id: 'camera' },
    { id: 'a2', service_id: 's1', department_id: 'audio', role_id: 'foh' },
  ]
  const roleItems = [
    { id: 'i1', role_id: 'camera' },
    { id: 'i2', role_id: 'camera' },
    { id: 'i3', role_id: 'foh' },
  ]

  it('counts an item with no progress row as pending', () => {
    const { overall, byDepartment } = serviceReadiness({ assignments, roleItems, progress: [] })
    expect(overall).toMatchObject({ total: 3, pct: 0 })
    expect(byDepartment.get('media')?.total).toBe(2)
    expect(byDepartment.get('audio')?.pct).toBe(0)
  })

  it('splits progress by team', () => {
    const { overall, byDepartment } = serviceReadiness({
      assignments,
      roleItems,
      progress: [
        { assignment_id: 'a1', item_id: 'i1', status: 'coordinator_verified' },
        { assignment_id: 'a1', item_id: 'i2', status: 'member_complete' },
        { assignment_id: 'a2', item_id: 'i3', status: 'head_verified' },
      ],
    })
    // media: (1 + 1/3) / 2 = 67%; audio: (2/3) / 1 = 67%; overall: 2/3
    expect(byDepartment.get('media')?.pct).toBe(67)
    expect(byDepartment.get('audio')?.pct).toBe(67)
    expect(overall.pct).toBe(67)
    expect(overall.coordinatorVerified).toBe(1)
  })

  it('ignores an assignment with no role, which owes no checklist', () => {
    const { overall } = serviceReadiness({
      assignments: [{ id: 'a3', service_id: 's1', department_id: 'media', role_id: null }],
      roleItems,
      progress: [],
    })
    expect(overall.total).toBe(0)
    expect(overall.pct).toBeNull()
  })

  it('does not credit one assignment with another\'s progress', () => {
    const twoPeople = [
      { id: 'a1', service_id: 's1', department_id: 'media', role_id: 'camera' },
      { id: 'a4', service_id: 's1', department_id: 'media', role_id: 'camera' },
    ]
    const { overall } = serviceReadiness({
      assignments: twoPeople,
      roleItems,
      progress: [
        { assignment_id: 'a1', item_id: 'i1', status: 'coordinator_verified' },
        { assignment_id: 'a1', item_id: 'i2', status: 'coordinator_verified' },
      ],
    })
    expect(overall.total).toBe(4)
    expect(overall.pct).toBe(50)
  })
})
