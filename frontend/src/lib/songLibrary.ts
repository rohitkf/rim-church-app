import { z } from 'zod'
import { supabase } from './supabaseClient'

/*
 * The song library (0241): every song ever on a set list, kept for good,
 * with the latest key, link and words anybody gave it. The set list
 * suggests from it as a title is typed.
 */

export const SONG_LIBRARY_KEY = ['song-library'] as const

export const librarySongSchema = z.object({
  id: z.string(),
  title: z.string(),
  song_key: z.string().nullable(),
  link: z.string().nullable(),
  lyrics: z.string().nullable(),
  last_sung_on: z.string().nullable(),
  times_sung: z.number(),
})
export type LibrarySong = z.infer<typeof librarySongSchema>

export async function fetchSongLibrary(): Promise<LibrarySong[]> {
  const { data, error } = await supabase
    .from('songs')
    .select('id, title, song_key, link, lyrics, last_sung_on, times_sung')
    .order('title')
  if (error) throw error
  return z.array(librarySongSchema).parse(data ?? [])
}

/** Lower case, spaces squeezed: how the library matches a title (as title_key does). */
const plain = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * The songs to offer for what has been typed: titles that start with it
 * first, then ones that have it anywhere, the most sung first within each.
 * Nothing for an empty box, and nothing that is already exactly what was
 * typed (there is nothing to pick).
 */
export function suggestSongs(library: LibrarySong[], typed: string, limit = 6): LibrarySong[] {
  const q = plain(typed)
  if (!q) return []
  const rank = (s: LibrarySong) => (plain(s.title).startsWith(q) ? 0 : 1)
  return library
    .filter((s) => plain(s.title).includes(q) && plain(s.title) !== q)
    .sort((a, b) => rank(a) - rank(b) || b.times_sung - a.times_sung || a.title.localeCompare(b.title))
    .slice(0, limit)
}
