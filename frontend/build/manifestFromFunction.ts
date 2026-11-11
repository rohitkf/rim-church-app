import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

/**
 * Letting a function answer for the manifest on Vercel.
 *
 * The installed app's icon is the App Logo, which only the database
 * knows, so on Vercel `/manifest.webmanifest` is answered by
 * `api/manifest.js` (vercel.json sends the address there). But Vercel
 * looks for a file before it looks at a rewrite, and `public/` puts a
 * static manifest at exactly that address: with the file in the output,
 * the function is never asked and the icon never changes.
 *
 * So a build on Vercel takes the static copy out of its output. Every
 * other build keeps it (a container, a preview on a laptop, the tests'
 * own server), because there is no function there to answer instead.
 */

/** Whether this build is the one Vercel serves, with the functions beside it. */
export function builtForVercel(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!env.VERCEL
}

export function manifestFromFunction(env: NodeJS.ProcessEnv = process.env): Plugin {
  let outDir = 'dist'
  return {
    name: 'rim:manifest-from-function',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
      if (!builtForVercel(env)) return
      await rm(resolve(outDir, 'manifest.webmanifest'), { force: true })
    },
  }
}
