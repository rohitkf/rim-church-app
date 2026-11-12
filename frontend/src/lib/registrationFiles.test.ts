import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * An event's files leave with it (0287). The database deletes rows; a
 * payment screenshot and the event's picture are files, which only the
 * Storage API can take away — so the app does, and these hold it to it.
 */

const state = vi.hoisted(() => ({
  steps: [] as string[],
  removed: [] as { bucket: string; names: string[] }[],
  proofs: [] as { proof_path: string | null }[],
  image: null as string | null,
  eventDeleteError: null as { message: string } | null,
  orphans: [] as unknown,
  orphansError: null as { message: string } | null,
  removeThrows: false,
}))

vi.mock('./supabaseClient', () => {
  const from = (table: string) => ({
    select: () => ({
      eq: () => ({
        not: () => Promise.resolve({ data: state.proofs, error: null }),
        maybeSingle: () => Promise.resolve({ data: { image_path: state.image }, error: null }),
      }),
    }),
    delete: () => ({
      eq: () => {
        state.steps.push(`delete ${table}`)
        return Promise.resolve({ error: table === 'registration_events' ? state.eventDeleteError : null })
      },
    }),
  })
  return {
    supabase: {
      from,
      rpc: (fn: string) => {
        state.steps.push(`rpc ${fn}`)
        return Promise.resolve({ data: state.orphansError ? null : state.orphans, error: state.orphansError })
      },
      storage: {
        from: (bucket: string) => ({
          remove: (names: string[]) => {
            if (state.removeThrows) return Promise.reject(new Error('storage is down'))
            state.steps.push(`remove ${bucket}`)
            state.removed.push({ bucket, names })
            return Promise.resolve({ data: names.map((name) => ({ name })), error: null })
          },
        }),
      },
    },
  }
})

import { deleteRegistrationEvent, sweepRegistrationFiles } from './registrations'

beforeEach(() => {
  state.steps = []
  state.removed = []
  state.proofs = []
  state.image = null
  state.eventDeleteError = null
  state.orphans = []
  state.orphansError = null
  state.removeThrows = false
})

describe('deleting an event', () => {
  it('takes its receipts and its picture with it, after the rows have gone', async () => {
    state.proofs = [{ proof_path: 'AAAAAAAAAAA1/one.png' }, { proof_path: 'AAAAAAAAAAA2/two.pdf' }]
    state.image = 'events/harvest.jpg'
    await deleteRegistrationEvent('e1')
    expect(state.steps).toEqual(['delete registration_orders', 'delete registration_events', 'remove registration-proofs', 'remove registration-images'])
    expect(state.removed).toEqual([
      { bucket: 'registration-proofs', names: ['AAAAAAAAAAA1/one.png', 'AAAAAAAAAAA2/two.pdf'] },
      { bucket: 'registration-images', names: ['events/harvest.jpg'] },
    ])
  })

  it('touches no storage for an event with no files', async () => {
    await deleteRegistrationEvent('e1')
    expect(state.removed).toEqual([])
  })

  it('keeps every file of an event that refused to be deleted', async () => {
    state.proofs = [{ proof_path: 'AAAAAAAAAAA1/one.png' }]
    state.image = 'events/harvest.jpg'
    state.eventDeleteError = { message: 'Some people on this event have paid and are not refunded yet.' }
    await expect(deleteRegistrationEvent('e1')).rejects.toMatchObject({ message: expect.stringContaining('not refunded yet') })
    expect(state.removed).toEqual([])
  })

  it('is still deleted when the files could not be removed: the sweep finds them later', async () => {
    state.proofs = [{ proof_path: 'AAAAAAAAAAA1/one.png' }]
    state.removeThrows = true
    await expect(deleteRegistrationEvent('e1')).resolves.toBeUndefined()
  })
})

describe('the sweep', () => {
  it('removes what the database says nothing points at, a bucket at a time', async () => {
    state.orphans = [
      { bucket: 'registration-proofs', name: 'ZZZZZZZZZZZ9/gone.png' },
      { bucket: 'registration-images', name: 'events/old.jpg' },
      { bucket: 'registration-proofs', name: 'ZZZZZZZZZZZ8/gone.pdf' },
    ]
    expect(await sweepRegistrationFiles()).toBe(3)
    expect(state.removed).toEqual([
      { bucket: 'registration-proofs', names: ['ZZZZZZZZZZZ9/gone.png', 'ZZZZZZZZZZZ8/gone.pdf'] },
      { bucket: 'registration-images', names: ['events/old.jpg'] },
    ])
  })

  it('does nothing when there is nothing, or the database would not say', async () => {
    expect(await sweepRegistrationFiles()).toBe(0)
    state.orphansError = { message: 'function public.registration_orphan_files() does not exist' }
    expect(await sweepRegistrationFiles()).toBe(0)
    expect(state.removed).toEqual([])
  })

  it('ignores a row that is not a file, and never throws', async () => {
    state.orphans = [{ bucket: 'registration-proofs' }, null, { bucket: 'registration-images', name: 'events/old.jpg' }]
    expect(await sweepRegistrationFiles()).toBe(1)
    state.removeThrows = true
    expect(await sweepRegistrationFiles()).toBe(0)
  })
})
