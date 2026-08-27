import { describe, expect, it } from 'vitest'
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
})
