import { describe, expect, it } from 'vitest'
import {
  arrangeRoles,
  fullRoleOrder,
  reorderWithinGroup,
  UNGROUPED_LABEL,
  type GroupableRole,
  type RoleGroup,
} from './roleGroups'

const role = (
  id: string,
  name: string,
  sort_order: number,
  group_id: string | null = null,
): GroupableRole => ({ id, name, sort_order, group_id })

const group = (id: string, name: string, sort_order: number): RoleGroup => ({
  id,
  name,
  sort_order,
})

describe('arrangeRoles', () => {
  const leaders = group('g1', 'Worship Leaders', 1)
  const band = group('g2', 'Band', 2)

  it('lifts the Team Coordinator out of the groups entirely', () => {
    const roles = [
      role('r1', 'Worship Leader 1', 1, 'g1'),
      role('c', 'Team Coordinator', 0),
      role('r2', 'Keys 1', 2, 'g2'),
    ]
    const { coordinator, sections } = arrangeRoles({ roles, groups: [leaders, band] })
    expect(coordinator?.name).toBe('Team Coordinator')
    expect(sections.flatMap((s) => s.roles.map((r) => r.name))).not.toContain('Team Coordinator')
  })

  it('still finds it under the name it had before the rename', () => {
    // An old row, a restored backup, a team that typed the old word.
    const { coordinator } = arrangeRoles({ roles: [role('c', 'Coordinator', 0)], groups: [] })
    expect(coordinator?.id).toBe('c')
  })

  it('orders the groups, and the roles inside each one', () => {
    const roles = [
      role('r2', 'Keys 2', 2, 'g2'),
      role('r1', 'Keys 1', 1, 'g2'),
      role('r3', 'Worship Leader 1', 3, 'g1'),
    ]
    const { sections } = arrangeRoles({ roles, groups: [band, leaders] })
    expect(sections.map((s) => s.group?.name)).toEqual(['Worship Leaders', 'Band'])
    expect(sections[1].roles.map((r) => r.name)).toEqual(['Keys 1', 'Keys 2'])
  })

  it('gathers the unfiled roles into a section of their own, last', () => {
    const roles = [role('r1', 'Keys 1', 1, 'g2'), role('r2', 'Sound check', 2)]
    const { sections } = arrangeRoles({ roles, groups: [band] })
    expect(sections.at(-1)?.group).toBeNull()
    expect(sections.at(-1)?.roles.map((r) => r.name)).toEqual(['Sound check'])
  })

  it('keeps a role whose group has vanished, rather than dropping it', () => {
    // The database nulls group_id when a group is deleted; a page holding a
    // stale list must not make a role disappear off the team meanwhile.
    const roles = [role('r1', 'Keys 1', 1, 'gone')]
    const { sections } = arrangeRoles({ roles, groups: [] })
    expect(sections).toHaveLength(1)
    expect(sections[0].group).toBeNull()
    expect(sections[0].roles.map((r) => r.name)).toEqual(['Keys 1'])
  })

  it('shows no empty ungrouped heading when every role is filed', () => {
    const roles = [role('r1', 'Keys 1', 1, 'g2')]
    const { sections } = arrangeRoles({ roles, groups: [band] })
    expect(sections.some((s) => s.group === null)).toBe(false)
  })

  it('leaves an empty group visible, so a team can fill one it just made', () => {
    const { sections } = arrangeRoles({ roles: [], groups: [leaders] })
    expect(sections).toEqual([{ group: leaders, roles: [] }])
  })

  it('calls the unfiled section something that is not a telling-off', () => {
    expect(UNGROUPED_LABEL).toBe('Everything else')
  })
})

describe('fullRoleOrder', () => {
  it('reads coordinator first, then each group in turn', () => {
    const arranged = arrangeRoles({
      roles: [
        role('c', 'Team Coordinator', 5),
        role('r1', 'Worship Leader 1', 1, 'g1'),
        role('r2', 'Keys 1', 2, 'g2'),
        role('r3', 'Spare', 3),
      ],
      groups: [group('g1', 'Leaders', 1), group('g2', 'Band', 2)],
    })
    expect(fullRoleOrder(arranged)).toEqual(['c', 'r1', 'r2', 'r3'])
  })
})

describe('reorderWithinGroup', () => {
  const arranged = () =>
    arrangeRoles({
      roles: [
        role('c', 'Team Coordinator', 0),
        role('a', 'Keys 1', 1, 'g1'),
        role('b', 'Keys 2', 2, 'g1'),
        role('z', 'Spare', 3),
      ],
      groups: [group('g1', 'Band', 1)],
    })

  it('sends the whole team, with only that group rearranged', () => {
    // The RPC refuses anything less than every role once, so a drag inside
    // one group still has to speak for the entire list.
    expect(
      reorderWithinGroup({ ...arranged(), groupId: 'g1', orderedIds: ['b', 'a'] }),
    ).toEqual(['c', 'b', 'a', 'z'])
  })

  it('can rearrange the unfiled section too', () => {
    const base = arrangeRoles({
      roles: [role('x', 'One', 1), role('y', 'Two', 2)],
      groups: [],
    })
    expect(reorderWithinGroup({ ...base, groupId: null, orderedIds: ['y', 'x'] })).toEqual([
      'y',
      'x',
    ])
  })

  it('never loses a role the dragged list forgot to mention', () => {
    expect(reorderWithinGroup({ ...arranged(), groupId: 'g1', orderedIds: ['b'] })).toEqual([
      'c',
      'b',
      'a',
      'z',
    ])
  })

  it('leaves other groups untouched', () => {
    const base = arrangeRoles({
      roles: [role('a', 'A', 1, 'g1'), role('b', 'B', 2, 'g2'), role('c2', 'C', 3, 'g2')],
      groups: [group('g1', 'One', 1), group('g2', 'Two', 2)],
    })
    expect(reorderWithinGroup({ ...base, groupId: 'g1', orderedIds: ['a'] })).toEqual([
      'a',
      'b',
      'c2',
    ])
  })
})
