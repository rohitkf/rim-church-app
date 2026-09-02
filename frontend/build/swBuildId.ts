import { execSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

/**
 * Making the service worker change when the app does.
 *
 * A browser installs a new service worker only when `sw.js` differs from
 * the copy it already has — byte for byte. Ours is hand-written and copied
 * verbatim out of `public/`, so for eighty-four deploys it was identical
 * every time: no new worker installed, `updatefound` never fired, and the
 * "a new version is ready" banner the app already carries could not
 * appear. The new code shipped; nobody was ever told.
 *
 * So the build stamps an id into it. The id is the commit, not a hash of
 * the output: the app is given the same id through `define`, and anything
 * derived from the bundle's own bytes would change the bundle that
 * produced it.
 */

/** The placeholder `public/sw.js` carries, and the build fills in. */
export const BUILD_ID_PLACEHOLDER = '__RIM_BUILD_ID__'

/**
 * The commit being built, or a timestamp when there is no git to ask.
 *
 * Vercel hands the sha over in the environment; a local build shells out
 * for it. Building the same commit twice gives the same id, so a redeploy
 * of unchanged code does not tell everybody to reload for nothing.
 */
export function resolveBuildId(env: NodeJS.ProcessEnv = process.env): string {
  const fromCi = env.VERCEL_GIT_COMMIT_SHA || env.GITHUB_SHA || env.COMMIT_REF
  if (fromCi) return fromCi.slice(0, 12)
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .trim()
      .slice(0, 12)
  } catch {
    // No git — a tarball build, a stripped container. A timestamp still
    // changes every deploy, which is the property that matters here.
    return `t${Date.now().toString(36)}`
  }
}

/**
 * Put the id into the worker's source.
 *
 * Throws when the placeholder has gone. This whole file exists because of
 * a failure that made no noise, and the way it would come back is somebody
 * editing `sw.js` and dropping the line — so the build stops rather than
 * quietly shipping a worker that can never announce itself again.
 */
export function stampServiceWorker(source: string, buildId: string): string {
  if (!source.includes(BUILD_ID_PLACEHOLDER)) {
    throw new Error(
      `sw.js no longer contains ${BUILD_ID_PLACEHOLDER}. Without it the file is byte-identical ` +
        'between deploys, no new worker installs, and the update banner can never appear. ' +
        'Put the placeholder back.',
    )
  }
  return source.replaceAll(BUILD_ID_PLACEHOLDER, buildId)
}

/** Stamps `sw.js` in the build output, after the public folder is copied. */
export function serviceWorkerBuildId(buildId: string): Plugin {
  let outDir = 'dist'
  return {
    name: 'rim:service-worker-build-id',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
      const swPath = resolve(outDir, 'sw.js')
      const source = await readFile(swPath, 'utf8')
      await writeFile(swPath, stampServiceWorker(source, buildId))
    },
  }
}
