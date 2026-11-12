#!/usr/bin/env node
/*
 * The migrations as the database's ledger knows them (0285): each one's
 * number, name and checksum, worked out from the files.
 *
 * Every migration from 0285 on ends with one line that records it —
 *
 *   select public.migration_done(285, '0285_its_name', '<checksum>');
 *
 * — so wherever the file is applied (CI, a laptop, production) the ledger
 * gets its row in the same transaction as the change. The checksum is of
 * everything above that line, which is what lets a file carry its own.
 * The 284 before it were recorded after the fact, by 0285 itself, with the
 * checksum of the whole file.
 *
 *   node scripts/migration-ledger.mjs list            every migration, as JSON
 *   node scripts/migration-ledger.mjs line <file>     the last line that file should end with
 *   node scripts/migration-ledger.mjs backfill        the rows 0285 records for the files before it
 *   node scripts/migration-ledger.mjs check <json>    compare with a ledger read from a database
 *                                                     (a file holding [{version, name, checksum}, …]);
 *                                                     says what differs, exits 1 if anything does
 *
 * frontend/src/lib/migrationLedger.test.ts holds the files to the same
 * rule with its own arithmetic, so a mistake here cannot agree with itself.
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations')
/** The first migration that records itself. */
export const SELF_RECORDING_FROM = 285
const sha = (text) => createHash('sha256').update(text, 'utf8').digest('hex')
const LAST_LINE = /^select public\.migration_done\((\d+), '([^']+)', '([0-9a-f]{64})'\);\n?$/

/** A migration file as the ledger sees it. `recorded` is what its own last line claims, if it has one. */
export function read(file) {
  const name = basename(file, '.sql')
  const version = Number(name.slice(0, 4))
  const text = readFileSync(file, 'utf8')
  if (version < SELF_RECORDING_FROM) return { version, name, checksum: sha(text), recorded: null }
  // Its last line, if that is the line that records it; a file still being
  // written has none yet, and its checksum is of all there is.
  const at = text.trimEnd().lastIndexOf('\n') + 1
  const last = LAST_LINE.exec(text.slice(at))
  const body = last ? text.slice(0, at) : text.endsWith('\n') ? text : `${text}\n`
  return {
    version,
    name,
    checksum: sha(body),
    recorded: last ? { version: Number(last[1]), name: last[2], checksum: last[3] } : null,
  }
}

export const lineFor = (m) => `select public.migration_done(${m.version}, '${m.name}', '${m.checksum}');`

export function all() {
  return readdirSync(DIR)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()
    .map((f) => read(join(DIR, f)))
}

function main(argv) {
  const [command, arg] = argv
  if (command === 'list') return console.log(JSON.stringify(all().map(({ version, name, checksum }) => ({ version, name, checksum })), null, 1))
  if (command === 'line') return console.log(lineFor(read(arg)))
  if (command === 'backfill') {
    const rows = all().filter((m) => m.version < SELF_RECORDING_FROM)
    return console.log(rows.map((m) => `  (${m.version}, '${m.name}', '${m.checksum}')`).join(',\n'))
  }
  if (command === 'check') {
    const theirs = new Map(JSON.parse(readFileSync(arg, 'utf8')).map((r) => [Number(r.version), r]))
    const ours = all()
    const said = []
    for (const m of ours) {
      const row = theirs.get(m.version)
      if (!row) said.push(`${m.name}: in the repository, not in the database's ledger`)
      else if (row.checksum && row.checksum !== m.checksum) said.push(`${m.name}: the file is not the one that was applied (the checksums differ)`)
      else if (row.name !== m.name) said.push(`${m.name}: the database knows number ${m.version} as ${row.name}`)
    }
    const known = new Set(ours.map((m) => m.version))
    for (const [version, row] of theirs) if (!known.has(version)) said.push(`${row.name}: in the database's ledger, not in the repository`)
    if (said.length === 0) return console.log(`The ledger and the repository agree: ${ours.length} migrations.`)
    console.log(said.join('\n'))
    process.exitCode = 1
    return
  }
  console.error('usage: migration-ledger.mjs list | line <file> | backfill | check <ledger.json>')
  process.exitCode = 2
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2))
