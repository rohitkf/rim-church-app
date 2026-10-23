import { describe, expect, it } from 'vitest'
import grant from '../../../supabase/migrations/0127_contact_details_close_to_everyone_but_the_owner.sql?raw'

/*
 * `profiles` is readable column by column (0127): email, phone and
 * marital status are closed, and a column not in the grant is refused —
 * the whole query fails, not just the one field. Nothing about that shows
 * up in a review, so this reads every select in the app that touches
 * `profiles` and checks each column it asks for is one the grant opens.
 */

const sources = import.meta.glob(['../**/*.ts', '../**/*.tsx', '!../**/*.test.ts', '!../**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const granted = new Set(
  (grant.match(/grant select \(([^)]*)\) on public\.profiles/)?.[1] ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean),
)

/** The comma-separated names inside the bracket opened just before `start`, nested embeds left out. */
function topLevelColumns(text: string, start: number): string[] {
  const columns: string[] = []
  let depth = 0
  let current = ''
  let embed = false
  const finish = () => {
    if (!embed && current.trim()) columns.push(current.trim())
    current = ''
    embed = false
  }
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (ch === '(') {
      // A segment that opens a bracket embeds another table.
      if (depth === 0) embed = true
      depth++
    } else if (ch === ')') {
      if (depth === 0) break
      depth--
    } else if (depth === 0) {
      if (ch === ',') finish()
      else current += ch
    }
  }
  finish()
  return columns
}

/** Every column list the app asks of `profiles`, with where it was found. */
function profileSelects(): { file: string; columns: string[] }[] {
  const out: { file: string; columns: string[] }[] = []
  for (const [file, text] of Object.entries(sources)) {
    // .from('profiles') … .select('a, b, c')
    for (const m of text.matchAll(/\.from\('profiles'\)\s*\.select\('([^']*)'/g)) {
      out.push({ file, columns: m[1].split(',').map((c) => c.trim()) })
    }
    // an embed: profiles(a, b), sender:profiles(a, b), profiles!fk(a, b).
    // The list may itself embed another table — profiles(a, teams:x(y)) —
    // so read to the matching bracket, and leave nested embeds to their
    // own tables: only the top-level names are profiles' columns.
    for (const m of text.matchAll(/\bprofiles(?:![a-z_]+)?\(/g)) {
      out.push({ file, columns: topLevelColumns(text, m.index! + m[0].length) })
    }
  }
  return out
}

describe('what the app reads from profiles (0127)', () => {
  it('opens names and dates, and keeps contact details and marital status closed', () => {
    expect(granted).toContain('first_name')
    expect(granted).toContain('dob')
    for (const closed of ['email', 'phone', 'marital_status']) expect(granted).not.toContain(closed)
  })

  it('reads past a nested embed and still sees every profile column beside it', () => {
    const text = "voter:profiles(first_name, email, teams:department_members(member_type, department:departments(name)))"
    expect(topLevelColumns(text, text.indexOf('(') + 1)).toEqual(['first_name', 'email'])
  })

  it('finds the selects it is meant to be checking', () => {
    expect(profileSelects().length).toBeGreaterThan(10)
  })

  it('never asks for a column the grant does not open', () => {
    const refused = profileSelects().flatMap(({ file, columns }) =>
      columns.filter((c) => c && !granted.has(c)).map((c) => `${file.replace('../', 'src/')}: ${c}`),
    )
    expect(refused).toEqual([])
  })
})
