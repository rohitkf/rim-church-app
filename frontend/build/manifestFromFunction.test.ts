import { mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { builtForVercel, manifestFromFunction } from './manifestFromFunction.ts'

/*
 * On Vercel the manifest is answered by a function, and a file at the
 * same address would be served instead of it. Everywhere else the file is
 * all there is.
 */

async function built(env: NodeJS.ProcessEnv) {
  const dir = await mkdtemp(join(tmpdir(), 'rim-build-'))
  await writeFile(join(dir, 'manifest.webmanifest'), '{}')
  await writeFile(join(dir, 'index.html'), '<!doctype html>')
  const plugin = manifestFromFunction(env)
  // As Vite calls them: where the build went, then that it has finished.
  ;(plugin.configResolved as (config: unknown) => void)({ root: dir, build: { outDir: '.' } })
  await (plugin.closeBundle as () => Promise<void>)()
  return (await readdir(dir)).sort()
}

describe('the manifest in the build', () => {
  it('is taken out on Vercel, so the function is the one that answers', async () => {
    expect(builtForVercel({ VERCEL: '1' })).toBe(true)
    expect(await built({ VERCEL: '1' })).toEqual(['index.html'])
  })

  it('stays everywhere else, where there is no function to answer', async () => {
    expect(builtForVercel({})).toBe(false)
    expect(await built({})).toEqual(['index.html', 'manifest.webmanifest'])
  })
})
