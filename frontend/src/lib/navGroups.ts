/**
 * The More sheet's headings.
 *
 * Eighteen destinations in one list is past what anybody scans, so the
 * sheet breaks them up by what a person is doing — the Sunday, what came
 * after it, talking, church life, people and things. Headings rather than
 * folders: every page stays one tap away. The order is AppShell's navItems,
 * unchanged; this only says where one heading stops and the next starts.
 */
/** Runs of consecutive items under one heading, in the order given. */
export function groupItems<T extends { group?: string }>(items: T[]): { group: string | null; items: T[] }[] {
  const runs: { group: string | null; items: T[] }[] = []
  for (const item of items) {
    const group = item.group ?? null
    const last = runs[runs.length - 1]
    if (last && last.group === group) last.items.push(item)
    else runs.push({ group, items: [item] })
  }
  return runs
}
