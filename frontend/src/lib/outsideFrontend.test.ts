import { describe, expect, it } from 'vitest'

/*
 * Nothing in src/ names a file outside frontend/ in an import.
 *
 * The Docker image is built from frontend/ alone (its Dockerfile copies
 * that folder and nothing else), and `npm run build` type-checks the
 * tests as well as the app. A test that imported a function's own file by
 * name built everywhere a whole checkout was to hand — here, CI's
 * frontend job, Vercel — and failed in the image with "Cannot find
 * module". CI only builds the image when the Docker files change, so it
 * went a day unseen (November 2026).
 *
 * What is allowed, because the type check never opens the file: the text
 * of one (`…?raw`, a string to tsc), and a pattern (`import.meta.glob`,
 * only a string too).
 */

const sources = import.meta.glob(['../**/*.ts', '../**/*.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** Imports, one a line, that climb out of frontend/: three levels up from src/lib is the repository. */
function leaving(path: string, source: string): string[] {
  // How many `../` it takes to leave frontend/ from this file: its depth under src, plus one for src itself.
  const depth = path.replace(/^\.\.\//, '').split('/').length
  const out: string[] = []
  for (const line of source.split('\n')) {
    const spec = /^\s*(?:(?:import|export)\b[^'"]*|\}\s*)\bfrom\s*['"]([^'"]+)['"];?\s*$/.exec(line)?.[1] ?? /^\s*import\s*['"]([^'"]+)['"];?\s*$/.exec(line)?.[1]
    if (!spec || !spec.startsWith('../')) continue
    const ups = spec.match(/^(?:\.\.\/)+/)?.[0].length ?? 0
    if (ups / 3 > depth && !/\?raw$/.test(spec)) out.push(spec)
  }
  return out
}

describe('imports that leave frontend/', () => {
  it('reads the whole of src', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(500)
  })

  it('knows one when it sees one', () => {
    // From src/lib: two levels up is frontend/, three is the repository.
    expect(leaving('../lib/a.test.ts', `import { x } from '../../../supabase/functions/f/news'`)).toEqual(['../../../supabase/functions/f/news'])
    expect(leaving('../lib/a.test.ts', `import text from '../../../supabase/migrations/0001.sql?raw'`)).toEqual([])
    expect(leaving('../lib/a.test.ts', `import { y } from '../../api/_appIcon.js'`)).toEqual([])
    expect(leaving('../a.ts', `import { z } from '../../supabase/x'`)).toEqual(['../../supabase/x'])
    expect(leaving('../components/deep/a.tsx', `import { z } from '../../../build/x'`)).toEqual([])
  })

  it('are only ever the text of a file, never the file', () => {
    const found = Object.entries(sources).flatMap(([path, source]) => leaving(path, source).map((spec) => `${path.replace(/^\.\.\//, 'src/')} imports ${spec}`))
    expect(found).toEqual([])
  })
})
