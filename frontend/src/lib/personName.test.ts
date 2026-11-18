import { describe, expect, it } from 'vitest'
import { NAME_EXAMPLES, NotAName, isName, nameProblem, nameToSave, tidyName } from './personName'
import { humanError } from './humanError'

describe('a name is saved the way a name is written', () => {
  it.each(NAME_EXAMPLES.filter(([, kept]) => kept !== null))('"%s" is kept as "%s"', (typed, kept) => {
    expect(tidyName(typed)).toBe(kept)
    expect(isName(typed)).toBe(true)
    expect(nameProblem(typed)).toBeNull()
  })

  it.each(NAME_EXAMPLES.filter(([, kept]) => kept === null))('"%s" is not a name', (typed) => {
    expect(isName(typed)).toBe(false)
    expect(nameProblem(typed)).not.toBeNull()
  })

  it('tidying a name that is already tidy changes nothing', () => {
    for (const [, kept] of NAME_EXAMPLES) {
      if (kept !== null) expect(tidyName(kept)).toBe(kept)
    }
  })

  it('a blank is nothing, and is not called wrong: whether a name is needed is the form’s to say', () => {
    expect(tidyName('')).toBe('')
    expect(tidyName('   ')).toBe('')
    expect(tidyName(null)).toBe('')
    expect(nameProblem('')).toBeNull()
    expect(nameProblem('   ')).toBeNull()
    expect(isName('')).toBe(false)
  })
})

describe('what is wrong is said in words, with what to take out', () => {
  it('names the characters that are not letters', () => {
    expect(nameProblem('y@cht_234', 'First name')).toBe('First name can only have letters in it. Take out @, _, 2, 3 and 4.')
  })

  it('says one character by itself', () => {
    expect(nameProblem('john2', 'Last name')).toBe('Last name can only have letters in it. Take out 2.')
  })

  it('does not list a dozen', () => {
    expect(nameProblem('a1234567890', 'Name')).toBe('Name can only have letters in it. Take out 1, 2, 3, 4, 5, 6 and the rest like them.')
  })

  it('a name of nothing but what goes between letters has no letter to start with', () => {
    expect(nameProblem('...', 'Name')).toBe('Name has to start with a letter.')
  })
})

describe('a name is not sent unless it is one', () => {
  it('goes tidied', () => {
    expect(nameToSave(' mARY  o’neil ')).toBe("Mary O'Neil")
  })

  it('is refused with the same words the form would use, whoever is signed in', () => {
    let refusal: unknown
    try {
      nameToSave('guest_1', 'A guest’s name')
    } catch (err) {
      refusal = err
    }
    expect(refusal).toBeInstanceOf(NotAName)
    const words = 'A guest’s name can only have letters in it. Take out _ and 1.'
    // Not "Could not add that guest": the reason is the only useful thing to say.
    expect(humanError(refusal, 'Could not add that guest.', false)).toBe(words)
    expect(humanError(refusal, 'Could not add that guest.', true)).toBe(words)
  })

  it('a blank goes as a blank: whether a name is needed is not decided here', () => {
    expect(nameToSave('  ')).toBe('')
  })
})

/*
 * The database applies the same rule to whatever reaches it (0306), and
 * its own check at the end of that migration runs these same examples
 * through the SQL. This holds the two lists together: an example added
 * here and not there fails, and the other way round.
 */
describe('the database is held to the same examples', () => {
  const migrations = import.meta.glob('../../../supabase/migrations/0306_*.sql', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>
  const [file, sql = ''] = Object.entries(migrations)[0] ?? []
  const block = sql.slice(sql.indexOf('-- NAME_EXAMPLES begin'), sql.indexOf('-- NAME_EXAMPLES end'))
  const inSql = [...block.matchAll(/^\s*\('((?:[^']|'')*)', (null|'(?:[^']|'')*')\),?$/gm)].map(
    ([, typed, kept]) => [typed.replace(/''/g, "'"), kept === 'null' ? null : kept.slice(1, -1).replace(/''/g, "'")] as const,
  )

  it('the migration carries the list', () => {
    expect(file).toBeDefined()
    expect(inSql.length).toBeGreaterThan(0)
  })

  it('and it is this list, pair for pair', () => {
    expect(inSql).toEqual(NAME_EXAMPLES.map(([typed, kept]) => [typed, kept]))
  })
})
