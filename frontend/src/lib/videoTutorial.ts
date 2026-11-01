import { supabase } from './supabaseClient'

/*
 * The Video tutorial link in the account menu (0233). The Owner sets it in
 * Settings › Video Tutorial; with none, the menu has no such item.
 */

/** The link, if it is an http(s) address — never a javascript: or data: one. */
export function safeVideoLink(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim()
  if (!text) return null
  try {
    const url = new URL(text)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

/** Save it, or clear it with null. The database lets only the Owner. */
export async function saveVideoLink(link: string | null): Promise<void> {
  const { error } = await supabase.from('app_settings').update({ video_tutorial_url: link }).eq('id', true)
  if (error) throw error
}
