import type { Plugin } from 'vite'
import { RELEASES } from '../src/lib/releases.ts'

/**
 * Every build writes what it says is new to `/releases.json`.
 *
 * The notes live in the bundle (src/lib/releases.ts), so a page still on
 * the last build cannot read the notes of the one waiting to be reloaded
 * into. The "new version" notice offers them before the reload
 * (src/lib/latestReleases.ts reads this file fresh from the server), so
 * nobody has to take an update to find out what it is.
 */
export function releasesFile(): Plugin {
  return {
    name: 'rim:releases-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'releases.json', source: JSON.stringify(RELEASES) })
    },
  }
}
