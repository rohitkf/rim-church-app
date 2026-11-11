import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { errorMessage } from './errorMessage'

describe('errorMessage', () => {
  it('uses a real Error message', () => {
    expect(errorMessage(new Error('boom'), 'fallback')).toBe('boom')
  })

  it('reads a Supabase-style rejection, which is not an Error instance', () => {
    const supabaseError = {
      message: 'relation "public.rota_assignments" does not exist',
      details: null,
      hint: null,
      code: '42P01',
    }
    expect(errorMessage(supabaseError, 'fallback')).toBe(
      'relation "public.rota_assignments" does not exist',
    )
  })

  it('appends the details Postgres puts alongside the message', () => {
    const err = { message: 'duplicate key value violates unique constraint', details: 'Key already exists.' }
    expect(errorMessage(err, 'fallback')).toBe(
      'duplicate key value violates unique constraint — Key already exists.',
    )
  })

  it('does not repeat details that merely echo the message', () => {
    const err = { message: 'same', details: 'same' }
    expect(errorMessage(err, 'fallback')).toBe('same')
  })

  it('accepts a bare string', () => {
    expect(errorMessage('plain failure', 'fallback')).toBe('plain failure')
  })

  it('falls back for shapes carrying nothing useful', () => {
    expect(errorMessage(null, 'fallback')).toBe('fallback')
    expect(errorMessage(undefined, 'fallback')).toBe('fallback')
    expect(errorMessage({}, 'fallback')).toBe('fallback')
    expect(errorMessage({ message: '   ' }, 'fallback')).toBe('fallback')
    expect(errorMessage(new Error(''), 'fallback')).toBe('fallback')
  })

  /*
   * What came back was not in the shape the app expects. Zod's own
   * message is every mismatch as a page of JSON, which is what an Admin
   * used to be shown in a red box.
   */
  it('says a data-shape mismatch in a line: where, and what was wrong with it', () => {
    const result = z.object({ id: z.string(), name: z.string() }).safeParse({ id: 'd1', name: null })
    const said = errorMessage(result.error, 'fallback')
    expect(said).toMatch(/^The data that came back was not in the shape the app expects: name — /)
    expect(said).not.toContain('[')
    expect(said).not.toContain('{')
    expect(said).not.toContain('\n')
  })

  it('names the first mismatch by its path and counts the rest', () => {
    const rows = z.array(z.object({ id: z.string(), starts_at: z.string() }))
    const result = rows.safeParse([{ id: 'a', starts_at: 't' }, { id: 7, starts_at: null }])
    expect(errorMessage(result.error, 'fallback')).toMatch(/expects: 1\.id — .* \(and 1 more\)$/)
  })

  it('says where when the whole answer is the wrong kind of thing', () => {
    const result = z.array(z.string()).safeParse(null)
    expect(errorMessage(result.error, 'fallback')).toMatch(/expects: the answer itself — /)
  })
})
