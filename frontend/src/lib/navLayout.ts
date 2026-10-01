import { z } from 'zod'
import { supabase } from './supabaseClient'

/**
 * The church's own arrangement of the menu (0121): which pages sit at the
 * top with no heading, which groups there are, what they are called, and
 * the order of everything. An Admin sets it in App settings; everybody
 * sees the same.
 *
 * Kept apart from lib/appSettings on purpose. That card saves its whole
 * draft row, and this has its own editor and its own Save — sharing the
 * row's copy would let one card quietly undo the other.
 */

export const NAV_LAYOUT_KEY = ['nav-layout']

export const navLayoutSchema = z.object({
  top: z.array(z.string()),
  groups: z.array(z.object({ name: z.string(), items: z.array(z.string()) })),
})
export type NavLayout = z.infer<typeof navLayoutSchema>

export async function fetchNavLayout(): Promise<NavLayout | null> {
  const { data, error } = await supabase.from('app_settings').select('nav_layout').eq('id', true).maybeSingle()
  if (error) throw error
  const parsed = navLayoutSchema.safeParse(data?.nav_layout)
  // Anything unreadable is treated as no arrangement at all: the app's own
  // menu is always a working menu, a half-parsed one might not be.
  return parsed.success ? parsed.data : null
}

/** Null puts the app's own arrangement back. */
export async function saveNavLayout(layout: NavLayout | null): Promise<void> {
  const { error } = await supabase.from('app_settings').update({ nav_layout: layout }).eq('id', true)
  if (error) throw error
}

/** The app's own arrangement, read off the items' default groups. */
export function defaultNavLayout(items: { to: string; group?: string }[]): NavLayout {
  const top: string[] = []
  const groups: NavLayout['groups'] = []
  for (const item of items) {
    if (!item.group) top.push(item.to)
    else {
      const g = groups.find((x) => x.name === item.group)
      if (g) g.items.push(item.to)
      else groups.push({ name: item.group, items: [item.to] })
    }
  }
  return { top, groups }
}

/**
 * The items, in the church's order and under its groups.
 *
 * A page the saved arrangement does not mention — one added to the app
 * after it was saved — goes into the group of its default name if the
 * church still has one, otherwise to the top. A path the arrangement
 * mentions that the app no longer has is dropped. Empty groups are kept
 * in the layout but, having no items, draw no heading.
 */
export function applyNavLayout<T extends { to: string; group?: string }>(
  items: T[],
  layout: NavLayout | null,
): T[] {
  if (!layout) return items
  const byPath = new Map(items.map((i) => [i.to, i]))
  const placed = new Set<string>()
  const take = (path: string, group: string | undefined): T[] => {
    const item = byPath.get(path)
    if (!item || placed.has(path)) return []
    placed.add(path)
    return [{ ...item, group }]
  }
  const top = layout.top.flatMap((p) => take(p, undefined))
  const groups = layout.groups.map((g) => ({ name: g.name, items: g.items.flatMap((p) => take(p, g.name)) }))

  // Pages the arrangement has never heard of.
  for (const item of items) {
    if (placed.has(item.to)) continue
    placed.add(item.to)
    const home = groups.find((g) => g.name === item.group)
    if (home) home.items.push({ ...item, group: home.name })
    else top.push({ ...item, group: undefined })
  }
  return [...top, ...groups.flatMap((g) => g.items)]
}
