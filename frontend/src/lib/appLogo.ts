import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabaseClient'
import { useAppSettings } from './appSettings'

/** Where the church's own mark lives, if it has uploaded one. */
export const BRANDING_BUCKET = 'branding'

/**
 * The mark, as something an <img> can draw.
 *
 * The bucket is private like every other one here, so the stored value is
 * a path and this turns it into a signed URL. An hour is long enough that
 * nobody watching a service go out sees the logo expire mid-shift, and
 * short enough that a link copied out of the page is not a permanent one.
 */
async function signLogo(path: string | null): Promise<string | null> {
  if (!path) return null
  const { data, error } = await supabase.storage.from(BRANDING_BUCKET).createSignedUrl(path, 3600)
  // A mark that will not load is not worth an error page. The app draws
  // its own instead, which is what it does when there is no logo at all.
  if (error) return null
  return data.signedUrl
}

export function useAppLogo() {
  const { logo_url: path } = useAppSettings()
  const query = useQuery({
    queryKey: ['app-logo', path],
    queryFn: () => signLogo(path),
    enabled: !!path,
    // Signed for an hour; asked for again well before that.
    staleTime: 30 * 60_000,
  })
  return { path, url: query.data ?? null }
}
