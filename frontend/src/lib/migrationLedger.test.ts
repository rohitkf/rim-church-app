import { describe, expect, it } from 'vitest'
import { SCHEMA_NEEDS, SCHEMA_WAITS } from './schemaNeeds'

/*
 * The migrations, held to what the database's ledger will say of them
 * (0285).
 *
 * Every migration from 0285 on ends with the line that records it, and
 * the checksum in that line is of everything above it — so a file carries
 * its own, and one that is edited after it has shipped no longer agrees
 * with itself. The 284 before it were recorded by 0285, each with the
 * checksum of its whole file; they are held to that list, which is what
 * finally makes "never edit a migration that has shipped" something a
 * test says rather than a sentence in AGENTS.md.
 *
 * scripts/migration-ledger.mjs does the same sums for people and for the
 * weekly check against production. This does them again by itself, so the
 * two cannot be wrong in the same way.
 */

const files = import.meta.glob('../../../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

interface Migration {
  version: number
  name: string
  text: string
}
const migrations: Migration[] = Object.entries(files)
  .map(([path, text]) => {
    const name = path.replace(/^.*\//, '').replace(/\.sql$/, '')
    return { version: Number(name.slice(0, 4)), name, text }
  })
  .sort((a, b) => a.version - b.version)

/** The first migration that records itself. */
const SELF_RECORDING_FROM = 285
const LAST_LINE = /^select public\.migration_done\((\d+), '([^']+)', '([0-9a-f]{64})'\);$/

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** A self-recording migration, split at the line that records it. */
function split(text: string): { body: string; last: string } {
  const at = text.trimEnd().lastIndexOf('\n') + 1
  return { body: text.slice(0, at), last: text.slice(at).trimEnd() }
}

describe('the migration files', () => {
  it('are numbered from one with none missing and none twice', () => {
    expect(migrations.length).toBeGreaterThanOrEqual(SELF_RECORDING_FROM)
    expect(migrations.map((m) => m.version)).toEqual(migrations.map((_, i) => i + 1))
  })

  it('are named by their number, four digits, and what they do', () => {
    for (const m of migrations) expect(m.name, m.name).toMatch(/^\d{4}_[a-z0-9_]+$/)
  })
})

describe('a migration that records itself (0285 on)', () => {
  const recording = migrations.filter((m) => m.version >= SELF_RECORDING_FROM)

  it('ends with the line that records it: its own number and its own name', () => {
    for (const m of recording) {
      const said = LAST_LINE.exec(split(m.text).last)
      expect(said, `${m.name} must end with: select public.migration_done(${m.version}, '${m.name}', '<checksum>');  — run: node scripts/migration-ledger.mjs line supabase/migrations/${m.name}.sql`).not.toBeNull()
      expect(Number(said?.[1]), m.name).toBe(m.version)
      expect(said?.[2], m.name).toBe(m.name)
    }
  })

  it('carries the checksum of everything above that line', async () => {
    for (const m of recording) {
      const { body, last } = split(m.text)
      const said = LAST_LINE.exec(last)?.[3]
      expect(said, `${m.name}: its last line's checksum is not of the file above it. If it has not shipped, run: node scripts/migration-ledger.mjs line supabase/migrations/${m.name}.sql — if it has, put the file back and write a new migration.`).toBe(
        await sha256(body),
      )
    }
  })

  it('records itself once, and last', () => {
    for (const m of recording) {
      expect(m.text.match(/public\.migration_done\(\d+,/g) ?? [], m.name).toHaveLength(1)
    }
  })
})

/** 0285 itself: the migration that made the ledger, and recorded the ones before it. */
const ledger = migrations.find((m) => m.version === SELF_RECORDING_FROM)?.text ?? ''

describe('the migrations before 0285', () => {
  const recorded = new Map<number, { name: string; checksum: string }>()
  for (const row of ledger.matchAll(/^ {2}\((\d+), '([^']+)', '([0-9a-f]{64})'\),?$/gm)) recorded.set(Number(row[1]), { name: row[2], checksum: row[3] })

  it('are all recorded by 0285, by name', () => {
    const before = migrations.filter((m) => m.version < SELF_RECORDING_FROM)
    expect(recorded.size).toBe(before.length)
    for (const m of before) expect(recorded.get(m.version)?.name, m.name).toBe(m.name)
  })

  it('are the files that were recorded: none has been edited since', async () => {
    for (const m of migrations.filter((x) => x.version < SELF_RECORDING_FROM)) {
      expect(await sha256(m.text), `${m.name} has changed since it shipped. A migration that has shipped is never edited: put it back, and write a new one.`).toBe(
        recorded.get(m.version)?.checksum,
      )
    }
  })
})

describe('the migration this build needs', () => {
  const highest = migrations[migrations.length - 1].version

  it('is the newest one, unless one is waiting for the release', () => {
    if (SCHEMA_WAITS === null) {
      expect(SCHEMA_NEEDS, `frontend/src/lib/schemaNeeds.ts says ${SCHEMA_NEEDS}; the newest migration is ${highest}. A new migration moves SCHEMA_NEEDS — or, if it must wait until the release is live, SCHEMA_WAITS names it.`).toBe(highest)
    } else {
      expect(SCHEMA_NEEDS).toBe(SCHEMA_WAITS - 1)
    }
  })

  it('never waits for a migration that is not there, or not the newest', () => {
    if (SCHEMA_WAITS === null) return
    expect(migrations.some((m) => m.version === SCHEMA_WAITS)).toBe(true)
    // What waits must be last: the database counts up to the first gap, so one applied after it would not count.
    expect(SCHEMA_WAITS).toBe(highest)
  })

  it('is one the database can say it has reached: 0285 teaches it to count', () => {
    expect(SCHEMA_NEEDS).toBeGreaterThanOrEqual(SELF_RECORDING_FROM)
    expect(ledger).toContain('create or replace function public.schema_version()')
    expect(ledger).toContain("jsonb_build_object('ok', true, 'at', now(), 'schema', public.schema_version())")
  })
})
