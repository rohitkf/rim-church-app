import type { ViewAs } from '../auth/AuthContext'

/** Who the preview is, in the words the account menu offered it in. */
export function viewAsLabel(viewAs: ViewAs): string {
  switch (viewAs.as) {
    case 'church':
      return 'a Church Member'
    case 'member':
      return `a Team Member of ${viewAs.departmentName}`
    case 'head':
      return `the Head of ${viewAs.departmentName}`
  }
}
