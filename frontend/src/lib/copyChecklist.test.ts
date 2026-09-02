import { describe, expect, it } from 'vitest'
import { itemsToCopy, rolesWithChecklists } from './copyChecklist'
import type { RoleChecklistItem } from './types'

let n = 0
const item = (over: Partial<RoleChecklistItem> = {}): RoleChecklistItem =>
  ({
    id: `i${(n += 1)}`,
    role_id: 'cam1',
    department_id: 'd1',
    label: 'Check batteries',
    phase: 'pre',
    sort_order: 0,
    created_at: new Date().toISOString(),
    ...over,
  }) as RoleChecklistItem

describe('itemsToCopy', () => {
  it('takes the other role’s list, in its order', () => {
    const items = [
      item({ role_id: 'cam1', label: 'Check batteries', sort_order: 0 }),
      item({ role_id: 'cam1', label: 'Test focus', sort_order: 1 }),
      item({ role_id: 'cam1', label: 'Frame the stage', sort_order: 2 }),
    ]
    expect(itemsToCopy({ items, fromRoleId: 'cam1', toRoleId: 'cam2' })).toEqual([
      { label: 'Check batteries', phase: 'pre', sort_order: 0 },
      { label: 'Test focus', phase: 'pre', sort_order: 1 },
      { label: 'Frame the stage', phase: 'pre', sort_order: 2 },
    ])
  })

  it('brings both halves, because "same as" means the whole job', () => {
    const items = [
      item({ role_id: 'cam1', label: 'Check batteries', phase: 'pre', sort_order: 0 }),
      item({ role_id: 'cam1', label: 'Batteries on charge', phase: 'post', sort_order: 0 }),
    ]
    const copied = itemsToCopy({ items, fromRoleId: 'cam1', toRoleId: 'cam2' })
    expect(copied.map((c) => c.phase).sort()).toEqual(['post', 'pre'])
  })

  it('keeps what the role already wrote, and lands the copy after it', () => {
    // The whole point: copying must never disturb a role's own items.
    const items = [
      item({ role_id: 'cam2', label: 'Own note', phase: 'pre', sort_order: 0 }),
      item({ role_id: 'cam1', label: 'Check batteries', phase: 'pre', sort_order: 0 }),
    ]
    expect(itemsToCopy({ items, fromRoleId: 'cam1', toRoleId: 'cam2' })).toEqual([
      { label: 'Check batteries', phase: 'pre', sort_order: 1 },
    ])
  })

  it('does not plant a line the role already has, whatever the casing', () => {
    const items = [
      item({ role_id: 'cam2', label: 'check batteries ', phase: 'pre', sort_order: 0 }),
      item({ role_id: 'cam1', label: 'Check Batteries', phase: 'pre', sort_order: 0 }),
      item({ role_id: 'cam1', label: 'Test focus', phase: 'pre', sort_order: 1 }),
    ]
    expect(itemsToCopy({ items, fromRoleId: 'cam1', toRoleId: 'cam2' })).toEqual([
      { label: 'Test focus', phase: 'pre', sort_order: 1 },
    ])
  })

  it('is safe to run twice — the second time copies nothing', () => {
    const source = [
      item({ role_id: 'cam1', label: 'Check batteries', sort_order: 0 }),
      item({ role_id: 'cam1', label: 'Test focus', sort_order: 1 }),
    ]
    const first = itemsToCopy({ items: source, fromRoleId: 'cam1', toRoleId: 'cam2' })
    const after = [
      ...source,
      ...first.map((c) => item({ role_id: 'cam2', label: c.label, phase: c.phase, sort_order: c.sort_order })),
    ]
    expect(itemsToCopy({ items: after, fromRoleId: 'cam1', toRoleId: 'cam2' })).toEqual([])
  })

  it('treats the same wording twice on the source as one line', () => {
    const items = [
      item({ role_id: 'cam1', label: 'Check batteries', sort_order: 0 }),
      item({ role_id: 'cam1', label: 'check batteries', sort_order: 1 }),
    ]
    expect(itemsToCopy({ items, fromRoleId: 'cam1', toRoleId: 'cam2' })).toHaveLength(1)
  })

  it('refuses to copy a role onto itself, or from nothing', () => {
    const items = [item({ role_id: 'cam1' })]
    expect(itemsToCopy({ items, fromRoleId: 'cam1', toRoleId: 'cam1' })).toEqual([])
    expect(itemsToCopy({ items, fromRoleId: '', toRoleId: 'cam2' })).toEqual([])
  })

  it('skips a blank line rather than copying an empty checklist item', () => {
    const items = [
      item({ role_id: 'cam1', label: '   ', sort_order: 0 }),
      item({ role_id: 'cam1', label: 'Test focus', sort_order: 1 }),
    ]
    expect(itemsToCopy({ items, fromRoleId: 'cam1', toRoleId: 'cam2' })).toEqual([
      { label: 'Test focus', phase: 'pre', sort_order: 0 },
    ])
  })
})

describe('rolesWithChecklists', () => {
  const roles = [
    { id: 'cam1', name: 'Camera Operator 1' },
    { id: 'cam2', name: 'Camera Operator 2' },
    { id: 'dir', name: 'Director' },
  ]

  it('offers only roles that have something to give, never the role itself', () => {
    const items = [item({ role_id: 'cam1' }), item({ role_id: 'cam1' }), item({ role_id: 'cam2' })]
    expect(rolesWithChecklists({ items, roles, excludeRoleId: 'cam2' })).toEqual([
      { id: 'cam1', name: 'Camera Operator 1', count: 2 },
    ])
  })

  it('offers nothing when the team has written nothing down yet', () => {
    expect(rolesWithChecklists({ items: [], roles, excludeRoleId: 'cam1' })).toEqual([])
  })
})
