import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * Asking where somebody stands (lib/standing). The database answers only
 * somebody signed in, so the app does not ask for anybody else.
 */

const state = vi.hoisted(() => ({ session: null as { user: { id: string } } | null, asked: 0, answer: null as unknown, error: null as unknown }))
vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: state.session } }) },
    rpc: (fn: string) => {
      if (fn === 'my_standing') state.asked += 1
      return Promise.resolve({ data: state.error ? null : state.answer, error: state.error })
    },
  },
}))

import { OPEN, fetchStanding } from './standing'

beforeEach(() => {
  state.session = null
  state.asked = 0
  state.answer = { closed: null, may_enter: true, blocked: null }
  state.error = null
})

describe('asking where somebody stands', () => {
  it('does not ask for a visitor: the database would only refuse, and that is not an error', async () => {
    state.error = { code: '42501', message: 'permission denied for function my_standing' }
    await expect(fetchStanding()).resolves.toEqual(OPEN)
    expect(state.asked).toBe(0)
  })

  it('asks for somebody signed in, and gives what was answered', async () => {
    state.session = { user: { id: 'u1' } }
    state.answer = { closed: null, may_enter: false, blocked: { at: '2026-11-01T10:00:00Z', reason: 'On hold' } }
    const standing = await fetchStanding()
    expect(state.asked).toBe(1)
    expect(standing.may_enter).toBe(false)
  })

  it('still fails out loud when somebody signed in is refused: that would be a real fault', async () => {
    state.session = { user: { id: 'u1' } }
    state.error = { code: '42501', message: 'permission denied for function my_standing' }
    await expect(fetchStanding()).rejects.toMatchObject({ code: '42501' })
  })
})
