import { describe, expect, it } from 'vitest'
import { rotaAssignmentSchema } from './types'

const row = {
  id: 'a1',
  service_id: 's1',
  department_id: 'd1',
  user_id: 'u1',
  role_label: 'Camera Operator 2',
  role_id: null,
  profile: null,
  department: null,
}
const shadow = { id: 't1', name: 'Shadow', color: '#34D399', sort_order: 0, shown: true }

/*
 * Tags come through the join table, one foreign key at a time, and are
 * flattened into `tags` so no page ever handles the join.
 */
describe('an assignment’s tags as they arrive', () => {
  it('flattens the join table into a list of tags', () => {
    const parsed = rotaAssignmentSchema.parse({ ...row, assignment_tags: [{ tag: shadow }] })
    expect(parsed.tags).toEqual([shadow])
    expect(parsed).not.toHaveProperty('assignment_tags')
  })

  it('reads no tags as an empty list, whether the join is empty or missing', () => {
    expect(rotaAssignmentSchema.parse({ ...row, assignment_tags: [] }).tags).toEqual([])
    expect(rotaAssignmentSchema.parse({ ...row, assignment_tags: null }).tags).toEqual([])
    expect(rotaAssignmentSchema.parse(row).tags).toEqual([])
  })

  it('drops a join row whose tag it cannot see', () => {
    expect(rotaAssignmentSchema.parse({ ...row, assignment_tags: [{ tag: null }, { tag: shadow }] }).tags).toEqual([shadow])
  })
})
