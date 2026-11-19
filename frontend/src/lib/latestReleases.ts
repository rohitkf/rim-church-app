import { z } from 'zod'
import { RELEASES, type Release } from './releases'

/*
 * What the newest version says is new, asked of the server.
 *
 * The release notes are data in the bundle (lib/releases), which means a
 * page still running the last build does not have the notes of the build
 * that is waiting to be reloaded into — exactly when somebody wants to
 * read them, before deciding whether to reload now. So every build also
 * writes its notes to `/releases.json` (build/releasesFile.ts), and this
 * reads that file fresh. The service worker leaves it alone: it is not a
 * hashed asset, a font, an image or a navigation, so it goes to the
 * network.
 *
 * Anything wrong — no connection, an old server without the file, the app
 * shell answering in its place — and the notes this build came with are
 * the answer. It never throws.
 */

const releaseSchema = z.object({
  key: z.string().min(1),
  date: z.string(),
  title: z.string(),
  lead: z.string(),
  points: z.array(z.string()),
  link: z.object({ to: z.string(), label: z.string() }).optional(),
  page: z.string().optional(),
  // Kept, or the notes of the build that is waiting would lose who they
  // are for and be told to everybody who opens the page. A right this
  // build has never heard of is one nobody here holds.
  holds: z.array(z.string()).optional(),
})

export const RELEASES_URL = '/releases.json'

export async function fetchLatestReleases(fetcher: typeof fetch = fetch): Promise<Release[]> {
  try {
    const response = await fetcher(RELEASES_URL, { cache: 'no-store', headers: { Accept: 'application/json' } })
    if (!response.ok) return RELEASES
    const parsed = z.array(releaseSchema).safeParse(await response.json())
    return parsed.success && parsed.data.length > 0 ? parsed.data : RELEASES
  } catch {
    return RELEASES
  }
}
