import { describe, expect, it } from 'vitest'
import { ROLE_NAME } from './roleNames'
import { ROLES } from './permissionMatrix'
import { STANDINGS } from './pageAccess'
import { DESIGNATION_LABEL } from './designation'
import { TOUR_STANDING_LABEL } from './tour'

const sources = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}', '!./roleNames.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

describe('one name for each standing', () => {
  it('is what the grid, the page rules, the teams and the tour all say', () => {
    expect(ROLES.map((r) => r.label)).toEqual([
      ROLE_NAME.owner,
      ROLE_NAME.admin,
      ROLE_NAME.overwatch,
      ROLE_NAME.pastor,
      ROLE_NAME.head,
      ROLE_NAME.assistant,
      ROLE_NAME.coordinator,
      ROLE_NAME.member,
      ROLE_NAME.newcomer,
    ])
    expect(STANDINGS.map((s) => s.label)).toEqual([ROLE_NAME.newcomer, ROLE_NAME.member, ROLE_NAME.head, ROLE_NAME.admin])
    expect(Object.values(DESIGNATION_LABEL)).toEqual([ROLE_NAME.head, ROLE_NAME.assistant, ROLE_NAME.member])
    expect(TOUR_STANDING_LABEL.lead).toBe(ROLE_NAME.head)
  })

  it('leaves the old name for a Head nowhere in the app', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100)
    const stale = Object.entries(sources)
      .filter(([, text]) => text.includes('Department Head'))
      .map(([path]) => path)
    expect(stale).toEqual([])
  })
})
