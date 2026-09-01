import type { ChecklistPhase } from './types'

/**
 * The two halves of a role's checklist.
 *
 * A camera operator checks the batteries before the doors open and puts
 * them on charge after everyone has gone. Those are different jobs at
 * different ends of the morning, and one undivided list means reading past
 * half of it twice — or ticking something that cannot be true yet.
 */
export const PHASES: { value: ChecklistPhase; label: string; blurb: string }[] = [
  {
    value: 'pre',
    label: 'Before the service',
    blurb: 'Done before the doors open.',
  },
  {
    value: 'post',
    label: 'After the service',
    blurb: 'Done once everyone has gone.',
  },
]

/** Pre before post, whatever order they arrived in. */
export function byPhase<T extends { phase: ChecklistPhase }>(
  items: T[],
  phase: ChecklistPhase,
): T[] {
  return items.filter((item) => item.phase === phase)
}
