import { describe, expect, it } from 'vitest'

/*
 * What the edge functions are built from.
 *
 * A function is bundled when it is deployed, and an import written
 * `jsr:@supabase/supabase-js@2` takes whatever the newest 2.x is that day.
 * So the same committed file became a different program each time it was
 * deployed, nothing recorded which, and five functions deployed months
 * apart ran five different clients. Every import from outside a function's
 * own folder names one exact version, and the functions agree on it.
 *
 * Dependabot does not read Deno's imports (.github/dependabot.yml), so
 * these move by hand: change the version in every function at once — this
 * test fails on a stray — and remember that nothing changes on production
 * until each function is next deployed (AGENTS.md §7).
 */

const sources = import.meta.glob('../../../supabase/functions/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/**
 * Every specifier a file imports from outside its own folder. Read a line
 * at a time, as an import is written — the emails' own wording says "from"
 * and a quote often enough that looking for those two anywhere finds prose.
 */
function outsideImports(source: string): string[] {
  const found: string[] = []
  const add = (spec: string | undefined) => {
    if (spec && !spec.startsWith('./') && !spec.startsWith('../')) found.push(spec)
  }
  for (const line of source.split('\n')) {
    // import x from '…' / export { x } from '…', and the last line of one written over several.
    add(/^\s*(?:(?:import|export)\b[^'"]*|\}\s*)\bfrom\s*['"]([^'"]+)['"];?\s*$/.exec(line)?.[1])
    // import '…'
    add(/^\s*import\s*['"]([^'"]+)['"];?\s*$/.exec(line)?.[1])
    // import('…')
    for (const m of line.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) add(m[1])
  }
  return found
}

const EXACT = /^(?:jsr|npm):(?:@[a-z0-9-]+\/)?[a-z0-9._-]+@\d+\.\d+\.\d+(?:\/[\w./-]+)?$/

describe('what the edge functions import', () => {
  const files = Object.entries(sources).map(([path, source]) => ({
    name: path.replace(/^.*\/supabase\/functions\//, ''),
    imports: outsideImports(source),
  }))

  it('reads all five functions', () => {
    const functions = new Set(files.map((f) => f.name.split('/')[0]))
    expect([...functions].sort()).toEqual(['clock-in-address', 'invite', 'push-notify', 'registration-email', 'registration-email-status'])
  })

  it('finds an import however it is written, and not the word “from” in an email', () => {
    const written = [
      `import a from 'npm:a@1.2.3'`,
      `import 'jsr:@b/c@2'`,
      `const d = await import("npm:d")`,
      `import {`,
      `  e,`,
      `} from 'npm:e@4.5.6'`,
      `export { f } from "jsr:@f/f@7.8.9";`,
      `import { g } from './g.ts'`,
      'const prose = `back to you from ${church}, usually within days. ` + "nothing to do"',
    ].join('\n')
    expect(outsideImports(written)).toEqual(['npm:a@1.2.3', 'jsr:@b/c@2', 'npm:d', 'npm:e@4.5.6', 'jsr:@f/f@7.8.9'])
  })

  it('names an exact version for every one: a registry, a package, three numbers', () => {
    for (const file of files) {
      for (const spec of file.imports) {
        expect(spec, `${file.name} imports ${spec}`).toMatch(EXACT)
      }
    }
    // What the rule refuses: a range, a major alone, a tag, a bare name, an address.
    for (const loose of ['jsr:@supabase/supabase-js@2', 'jsr:@supabase/supabase-js@^2.119.0', 'npm:web-push', 'npm:web-push@latest', 'https://esm.sh/web-push']) {
      expect(loose).not.toMatch(EXACT)
    }
  })

  it('uses one version of the Supabase client in every function', () => {
    const versions = new Map<string, string[]>()
    for (const file of files) {
      for (const spec of file.imports.filter((s) => s.startsWith('jsr:@supabase/supabase-js@'))) {
        const version = spec.split('@').pop() ?? ''
        versions.set(version, [...(versions.get(version) ?? []), file.name])
      }
    }
    expect([...versions.keys()], JSON.stringify(Object.fromEntries(versions))).toHaveLength(1)
    // Every function talks to the database, so every function has it.
    expect([...versions.values()][0].filter((name) => name.endsWith('/index.ts'))).toHaveLength(5)
  })
})
