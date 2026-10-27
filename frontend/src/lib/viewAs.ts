import type { ViewAs } from '../auth/AuthContext'

/** The previews that are of one team. */
export const TEAM_PREVIEWS = ['member', 'assistant', 'head', 'coordinator'] as const
export type TeamPreview = (typeof TEAM_PREVIEWS)[number]

export function isTeamPreview(
  viewAs: ViewAs | null | undefined,
): viewAs is Extract<ViewAs, { as: TeamPreview }> {
  return !!viewAs && (TEAM_PREVIEWS as readonly string[]).includes(viewAs.as)
}

/** Who the preview is, in the words the account menu offered it in. */
export function viewAsLabel(viewAs: ViewAs): string {
  switch (viewAs.as) {
    case 'church':
      return 'a Church Member'
    case 'member':
      return `a Team Member of ${viewAs.departmentName}`
    case 'head':
      return `the Head of ${viewAs.departmentName}`
    case 'assistant':
      return `the Assisting Head of ${viewAs.departmentName}`
    case 'coordinator':
      return `the Team Coordinator of ${viewAs.departmentName}`
    case 'overwatch':
      return 'Overwatch'
    case 'pastor':
      return 'a Pastor'
    case 'admin':
      return 'an Admin'
  }
}
