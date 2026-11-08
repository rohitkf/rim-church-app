import type { ChecklistPhase } from './types'

/**
 * The three parts of a role's checklist, in the order the morning runs.
 *
 * A camera operator checks the batteries before the doors open, starts the
 * recording when the service begins, and puts the batteries on charge after
 * everyone has gone. Those are different jobs at different points in the
 * morning, and one undivided list means reading past most of it each time —
 * or ticking something that cannot be true yet. During the service is 0260.
 */
export const PHASES: { value: ChecklistPhase; label: string; blurb: string }[] = [
  {
    value: 'pre',
    label: 'Before the service',
    blurb: 'Done before the doors open.',
  },
  {
    value: 'during',
    label: 'During the service',
    blurb: 'Done while the service runs.',
  },
  {
    value: 'post',
    label: 'After the service',
    blurb: 'Done once everyone has gone.',
  },
]

/** One part's items, in the order they arrived in. */
export function byPhase<T extends { phase: ChecklistPhase }>(
  items: T[],
  phase: ChecklistPhase,
): T[] {
  return items.filter((item) => item.phase === phase)
}
