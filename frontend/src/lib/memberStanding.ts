/**
 * What to call someone who holds no office.
 *
 * The header names a person and then says what they are, which worked for
 * every Admin, Head and Coordinator and left an ordinary volunteer with a
 * blank where their standing should be — the one group most likely to
 * wonder whether the app knows who they are. They have no role row,
 * because being on a team isn't a role; it's a membership. So it is read
 * from the membership instead.
 *
 * Anyone with a role already wears it. Adding "team member" underneath
 * would say less than the pill above it and take a line to do it.
 */
export type MemberStanding = 'team-member' | 'guest' | null

export function memberStanding(
  hasRoles: boolean,
  memberships: { member_type: 'core' | 'guest' }[],
): MemberStanding {
  if (hasRoles) return null
  if (memberships.some((m) => m.member_type === 'core')) return 'team-member'
  if (memberships.length > 0) return 'guest'
  return null
}

export const memberStandingLabel: Record<Exclude<MemberStanding, null>, string> = {
  'team-member': 'Team Member',
  guest: 'Guest',
}
