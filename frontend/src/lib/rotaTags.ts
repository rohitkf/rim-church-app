import { useQuery } from '@tanstack/react-query'
import type { CSSProperties } from 'react'
import { z } from 'zod'
import { supabase } from './supabaseClient'

/**
 * The words a rota assignment can carry — "Shadow", "First time",
 * "Leading" — kept by an Admin in App settings (0107), each with a colour.
 *
 * Labels, not rules: a tagged assignment is still that person's one role
 * at the service. A tag that is not `shown` keeps its assignments but is
 * neither offered nor drawn.
 */
export const rotaTagSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  sort_order: z.number(),
  shown: z.boolean().default(true),
})
export type RotaTag = z.infer<typeof rotaTagSchema>

export const ROTA_TAGS_KEY = ['rota-tags']

export async function fetchRotaTags(): Promise<RotaTag[]> {
  const { data, error } = await supabase
    .from('rota_tags')
    .select('id, name, color, sort_order, shown')
    .order('sort_order')
    .order('name')
  if (error) throw error
  return z.array(rotaTagSchema).parse(data)
}

export function useRotaTags() {
  return useQuery({ queryKey: ROTA_TAGS_KEY, queryFn: fetchRotaTags, staleTime: 5 * 60_000 })
}

/** In the church's order, and only the ones it has chosen to show. */
export function shownTags<T extends { shown?: boolean; sort_order: number; name: string }>(tags: T[]): T[] {
  return tags
    .filter((t) => t.shown !== false)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
}

/**
 * How a tag is drawn: its colour as a wash and a ring, and the words in
 * the same colour pulled a third of the way to the page's ink, so a pale
 * colour is still readable on a light page and a deep one on a dark page.
 * Inline because the colour is the church's, chosen at runtime — Tailwind
 * only sees class names written in the source.
 */
export function tagStyle(color: string): CSSProperties {
  return {
    background: `color-mix(in oklab, ${color} 24%, transparent)`,
    color: `color-mix(in oklab, ${color} 68%, var(--color-on-surface))`,
    boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 45%, transparent)`,
  }
}

export async function saveRotaTag(tag: {
  id?: string
  name: string
  color: string
  sort_order: number
  shown: boolean
}): Promise<void> {
  const row = { name: tag.name.trim(), color: tag.color, sort_order: tag.sort_order, shown: tag.shown }
  const { error } = tag.id
    ? await supabase.from('rota_tags').update(row).eq('id', tag.id)
    : await supabase.from('rota_tags').insert(row)
  if (error) throw error
}

export async function deleteRotaTag(id: string): Promise<void> {
  const { error } = await supabase.from('rota_tags').delete().eq('id', id)
  if (error) throw error
}

/**
 * Put the tags in this order. Renumbered 0, 1, 2… rather than swapped,
 * because tags added one after another all start at the same number and
 * swapping two equal numbers moves nothing.
 */
export async function reorderRotaTags(ids: string[]): Promise<void> {
  for (const [i, id] of ids.entries()) {
    const { error } = await supabase.from('rota_tags').update({ sort_order: i }).eq('id', id)
    if (error) throw error
  }
}
