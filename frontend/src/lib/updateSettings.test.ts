import { describe, expect, it, vi } from 'vitest'

/*
 * A settings write that row security refuses changes nothing and is no
 * error to Postgres; updateSettings asks for the row back, so a page
 * cannot say "Saved" when nothing was.
 */
const answer = vi.hoisted(() => ({ rows: [{ id: true }] as unknown[], writes: [] as unknown[] }))
vi.mock('./supabaseClient', () => ({
  supabase: {
    from: () => ({
      update: (patch: unknown) => ({
        eq: () => ({
          select: () => {
            answer.writes.push(patch)
            return Promise.resolve({ data: answer.rows, error: null })
          },
        }),
      }),
    }),
  },
}))

import { updateSettings } from './appSettings'

describe('saving the church’s settings', () => {
  it('saves, when the row comes back', async () => {
    answer.rows = [{ id: true }]
    await expect(updateSettings({ stage_clear_hour: 5 })).resolves.toBeUndefined()
    expect(answer.writes).toContainEqual({ stage_clear_hour: 5 })
  })

  it('says so when the write was refused and nothing changed', async () => {
    answer.rows = []
    await expect(updateSettings({ stage_clear_hour: 5 })).rejects.toThrow(/not saved/)
  })
})
