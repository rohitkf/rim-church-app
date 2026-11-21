import { describe, expect, it } from 'vitest'
import { NOTE_MAX, noteOf, tidyNote } from './sessionNote'

describe('tidyNote', () => {
  it('keeps what was typed', () => {
    expect(tidyNote('Communion follows. Elements on the table by 10:40.')).toBe('Communion follows. Elements on the table by 10:40.')
  })

  it('takes the space off either end and makes one line of it', () => {
    expect(tidyNote('  Two songs only \n\n mic 3 for the lead  ')).toBe('Two songs only mic 3 for the lead')
  })

  it('is nothing when nothing is left, which takes the note off', () => {
    expect(tidyNote('')).toBeNull()
    expect(tidyNote('   \n ')).toBeNull()
    expect(tidyNote(null)).toBeNull()
    expect(tidyNote(undefined)).toBeNull()
  })

  it('stops at the most a note may be, as the database does', () => {
    expect(tidyNote('a'.repeat(NOTE_MAX))).toHaveLength(NOTE_MAX)
    expect(tidyNote('a'.repeat(NOTE_MAX + 40))).toHaveLength(NOTE_MAX)
    // Cut on a space, it does not end on one: the database refuses nothing it is sent.
    expect(tidyNote(`${'a'.repeat(NOTE_MAX - 1)} b`)).toBe('a'.repeat(NOTE_MAX - 1))
  })
})

describe('noteOf', () => {
  it('reads a session’s note', () => {
    expect(noteOf({ note: 'In Malayalam, translated.' })).toBe('In Malayalam, translated.')
  })

  it('is null for a session with none, or one read before there were notes', () => {
    expect(noteOf({ note: null })).toBeNull()
    expect(noteOf({})).toBeNull()
    expect(noteOf({ note: '  ' })).toBeNull()
  })
})
