import type { ChecklistPhase, RoleChecklistItem } from './types'

export interface ChecklistSuggestion {
  /** The item's wording, exactly as another role already has it. */
  label: string
  /** The roles that already carry it, for saying where it came from. */
  usedBy: string[]
}

/**
 * Checklist items other roles on this team already have.
 *
 * A team's roles overlap: Camera Operator 1 and Camera Operator 2 check the
 * same batteries and file the same cards, and typing that out a second time
 * is both slower and a way to end up with two nearly-identical lines that
 * read as two different jobs. So the box offers what the team has already
 * written down.
 *
 * Only the same phase is offered. "Batteries on charge" belongs after the
 * service and "check batteries" before it, and suggesting either into the
 * other half would be the app guessing at something it cannot know.
 *
 * Anything the role already has is left out — there is nothing to offer
 * somebody who has it — and matching ignores case and edge whitespace,
 * because "Check batteries" and "check batteries " are the same job.
 */
export function suggestChecklistItems({
  items,
  roleNames,
  roleId,
  phase,
  query,
  limit = 5,
}: {
  /** Every checklist item on the team, across all its roles. */
  items: RoleChecklistItem[]
  /** Role id → the name to show. */
  roleNames: Map<string, string>
  roleId: string
  phase: ChecklistPhase
  query: string
  limit?: number
}): ChecklistSuggestion[] {
  const typed = query.trim().toLowerCase()
  if (!typed) return []

  const mine = new Set(
    items
      .filter((i) => i.role_id === roleId && i.phase === phase)
      .map((i) => i.label.trim().toLowerCase()),
  )

  // Gathered by wording rather than by row: the same line on four roles is
  // one suggestion that four roles use, not four suggestions.
  const found = new Map<string, ChecklistSuggestion>()
  for (const item of items) {
    if (item.role_id === roleId || item.phase !== phase) continue
    const label = item.label.trim()
    const key = label.toLowerCase()
    if (!key.includes(typed) || mine.has(key)) continue
    const seen = found.get(key)
    const from = roleNames.get(item.role_id)
    if (seen) {
      if (from && !seen.usedBy.includes(from)) seen.usedBy.push(from)
    } else {
      found.set(key, { label, usedBy: from ? [from] : [] })
    }
  }

  return [...found.values()]
    .sort((a, b) => {
      // What starts with what was typed comes first: someone three letters
      // into a word is far more often at its beginning than its middle.
      const aStarts = a.label.toLowerCase().startsWith(typed)
      const bStarts = b.label.toLowerCase().startsWith(typed)
      if (aStarts !== bStarts) return aStarts ? -1 : 1
      // Then what more roles already use, then alphabetically, so the list
      // is stable rather than in whatever order the rows arrived.
      return b.usedBy.length - a.usedBy.length || a.label.localeCompare(b.label)
    })
    .slice(0, limit)
}
