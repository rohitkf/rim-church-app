import type { CSSProperties } from 'react'

// Matches --color-status-pending: the neutral chip tone used before an
// admin has picked a color for the department.
export const DEFAULT_DEPT_COLOR = '#94a3b8'

/** Chip styling from a department's admin-chosen color: tinted background
 * (hex + '26' ≈ 15% alpha) with the full-strength color as text, the same
 * recipe as the static role/status chips. */
export function deptBadgeStyle(color: string | null): CSSProperties {
  const c = color ?? DEFAULT_DEPT_COLOR
  return { backgroundColor: `${c}26`, color: c }
}
