/** How many are on a team: its core members, its guests, and the two together. */
export interface TeamHeadcount {
  core: number
  guest: number
  total: number
}

export const NO_ONE: TeamHeadcount = { core: 0, guest: 0, total: 0 }

/**
 * Roster rows counted per team.
 *
 * A Head is on the roster like anybody else, as core or as a guest; heading
 * a team is a role, not a third kind of member, so it is not a column here.
 */
export function teamHeadcounts(
  rows: { department_id: string; member_type: 'core' | 'guest' }[],
): Map<string, TeamHeadcount> {
  const counts = new Map<string, TeamHeadcount>()
  for (const row of rows) {
    const now = counts.get(row.department_id) ?? { ...NO_ONE }
    now[row.member_type] += 1
    now.total += 1
    counts.set(row.department_id, now)
  }
  return counts
}
