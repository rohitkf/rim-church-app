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

/** Every column list the app asks of `profiles`, with where it was found. */
function profileSelects(): { file: string; columns: string[] }[] {
  const out: { file: string; columns: string[] }[] = []
  for (const [file, text] of Object.entries(sources)) {
    // .from('profiles') … .select('a, b, c')
    for (const m of text.matchAll(/\.from\('profiles'\)\s*\.select\('([^']*)'/g)) {
      out.push({ file, columns: m[1].split(',').map((c) => c.trim()) })
    }
    // an embed: profiles(a, b), sender:profiles(a, b), profiles!fk(a, b)
    for (const m of text.matchAll(/\bprofiles(?:![a-z_]+)?\(([^)]*)\)/g)) {
      out.push({ file, columns: m[1].split(',').map((c) => c.trim()) })
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
