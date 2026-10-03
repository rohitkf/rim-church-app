import { describe, expect, it } from 'vitest'
import { PERMISSIONS, withPageAccess } from './permissionMatrix'

const rowFor = (areas: ReturnType<typeof withPageAccess>, action: string) =>
  areas.flatMap((a) => a.capabilities).find((c) => c.action === action)!

describe('the reference grid, redrawn with the church’s choices', () => {
  it('is exactly the written-down grid at every default', () => {
    expect(withPageAccess({})).toEqual(PERMISSIONS)
  })

  it('opens a row to a standing the page is opened to', () => {
    const areas = withPageAccess({ rota: 'everyone' })
    expect(rowFor(areas, 'See the rota').can.newcomer).toBe('yes')
  })

  it('closes a row to a standing the page is closed to, and leaves Admins alone', () => {
    const areas = withPageAccess({ inventory: 'leads' })
    const row = rowFor(areas, 'See the register and its documents')
    expect(row.can.member).toBe('no')
    expect(row.can.coordinator).toBe('no')
    expect(row.can.head).not.toBe('no')
    expect(row.can.admin).toBe('yes')
    expect(row.can.owner).toBe('yes')
  })

  it('ties a row to a page only where the page decides it', () => {
    const tied = PERMISSIONS.flatMap((a) => a.capabilities).filter((c) => c.page)
    expect(tied.map((c) => c.page).sort()).toEqual(
      ['/debriefs', '/events', '/giving', '/inventory', '/messages', '/polls', '/rota', '/updates'].sort(),
    )
  })
})
