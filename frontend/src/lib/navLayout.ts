import { z } from 'zod'
import { supabase } from './supabaseClient'

/**
 * The church's own arrangement of the menu (0121): which pages sit at the
 * top with no heading, which groups there are, what they are called, the
 * order of everything, and any page the church calls by a name of its own
 * (`labels`, path to name). An Admin sets it in Settings › Menu; everybody
 * sees the same.
 *
 * Kept apart from lib/appSettings on purpose. That card saves its whole
 * draft row, and this has its own editor and its own Save — sharing the
 * row's copy would let one card quietly undo the other.
 */

export const NAV_LAYOUT_KEY = ['nav-layout']

/** The longest name a page may be given: it has to fit the dock. */
export const NAV_LABEL_MAX = 30

export const navLayoutSchema = z.object({
  top: z.array(z.string()),
  groups: z.array(z.object({ name: z.string(), items: z.array(z.string()) })),
  // Optional, so a layout saved before pages could be renamed still reads.
  labels: z.record(z.string(), z.string()).optional(),
})
export type NavLayout = z.infer<typeof navLayoutSchema>

/**
 * Menu entries that have since become other entries: the old address, and
 * what stands in its place, in order.
 *
 * Serving was one entry holding Availability, Team Rota and Checklists as
 * tabs (October to November 2026). They are three entries again, so a menu
 * saved in between names an address the app no longer offers. Read as it
 * stands, that entry would be dropped and the three pages treated as new
 * — put under a heading the church may not have, or at the top. Instead
 * the three take the old entry's place: a church that kept Serving under
 * "Team Management" finds all three there, in order, with nothing to
 * re-arrange and no migration to wait for.
 */
const MOVED: Record<string, string[]> = {
  '/serving': ['/availability', '/rota', '/checklists'],
}

/** A saved arrangement, with every entry that has moved replaced by what it became. */
export function withMovedPages(layout: NavLayout): NavLayout {
  const named = new Set([...layout.top, ...layout.groups.flatMap((g) => g.items)])
  if (!Object.keys(MOVED).some((old) => named.has(old))) return layout
  // A page already placed by hand stays where it was put, not where the old entry was.
  const swap = (paths: string[]) => paths.flatMap((p) => (MOVED[p] ? MOVED[p].filter((to) => !named.has(to)) : [p]))
  const labels = Object.fromEntries(Object.entries(layout.labels ?? {}).filter(([path]) => !MOVED[path]))
  return {
    top: swap(layout.top),
    groups: layout.groups.map((g) => ({ name: g.name, items: swap(g.items) })),
    ...(layout.labels ? { labels } : {}),
  }
}

export async function fetchNavLayout(): Promise<NavLayout | null> {
  const { data, error } = await supabase.from('app_settings').select('nav_layout').eq('id', true).maybeSingle()
  if (error) throw error
  const parsed = navLayoutSchema.safeParse(data?.nav_layout)
  // Anything unreadable is treated as no arrangement at all: the app's own
  // menu is always a working menu, a half-parsed one might not be.
  return parsed.success ? withMovedPages(parsed.data) : null
}

/**
 * Null puts the app's own arrangement back.
 *
 * Asks for the row back: an update the database's rules refuse changes
 * nothing and reports no error, so without the row there is no telling a
 * saved menu from one that was quietly turned away.
 */
export async function saveNavLayout(layout: NavLayout | null): Promise<void> {
  const { data, error } = await supabase
    .from('app_settings')
    .update({ nav_layout: layout })
    .eq('id', true)
    .select('nav_layout')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('The menu was not saved — only an Admin can change it.')
}

/**
 * The names the church has given pages: only the ones that say something
 * — trimmed, not blank, not longer than a dock can show.
 */
export function navLabels(layout: NavLayout | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [path, name] of Object.entries(layout?.labels ?? {})) {
    const clean = name.trim().slice(0, NAV_LABEL_MAX)
    if (clean) out[path] = clean
  }
  return out
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
export function applyNavLayout<T extends { to: string; group?: string; label?: string }>(
  items: T[],
  layout: NavLayout | null,
): T[] {
  if (!layout) return items
  // A page the church has renamed carries its name everywhere the menu goes.
  const labels = navLabels(layout)
  const byPath = new Map(items.map((i) => [i.to, labels[i.to] ? { ...i, label: labels[i.to] } : i]))
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
    const named = byPath.get(item.to)!
    const home = groups.find((g) => g.name === item.group)
    if (home) home.items.push({ ...named, group: home.name })
    else top.push({ ...named, group: undefined })
  }
  return [...top, ...groups.flatMap((g) => g.items)]
}
