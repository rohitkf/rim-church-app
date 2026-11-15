import { describe, expect, it } from 'vitest'
import pushSource from '../../../supabase/functions/push-notify/index.ts?raw'
import handsOver from '../../../supabase/migrations/0291_one_call_to_the_sender_for_each_transaction.sql?raw'

/*
 * Sending a batch of notifications to phones (0290, 0291): which rows a
 * call is about, what goes to which device and in what order, how many
 * sends are out at once, and what App Health is told.
 *
 * The function's own file, found by pattern rather than named in an
 * import, for the reason registrationEmailNews.test.ts gives: the Docker
 * image is built from frontend/ alone and type-checks the tests.
 */
interface Device {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}
interface Waiting {
  id: string
  user_id: string
  type: string
  body: string | null
  reference_id: string | null
  devices: Device[]
}
interface Batch {
  MOST_IDS: number
  idsFrom: (body: unknown) => string[]
  byDevice: (batch: Waiting[]) => { device: Device; rows: Waiting[] }[]
  inPool: <T>(items: T[], limit: number, work: (item: T) => Promise<void>) => Promise<void>
  reasonFor: (err: unknown) => string
  isGone: (err: unknown) => boolean
  failureLine: (failed: Record<string, number>, attempted: number) => string | null
}
const [batch] = Object.values(import.meta.glob('../../../supabase/functions/push-notify/batch.ts', { eager: true })) as Batch[]

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const device = (name: string): Device => ({ id: name, endpoint: `https://push.example/${name}`, p256dh: 'k', auth: 'a' })
const row = (n: number, devices: Device[], type = 'call_time'): Waiting => ({
  id: id(n),
  user_id: id(100 + n),
  type,
  body: null,
  reference_id: null,
  devices,
})

describe('which notifications a call is about', () => {
  it('reads the list the database sends when a transaction commits', () => {
    expect(batch.idsFrom({ ids: [id(1), id(2)] })).toEqual([id(1), id(2)])
  })

  it('still reads the one row the old webhook sent, so the function can go first', () => {
    expect(batch.idsFrom({ type: 'INSERT', table: 'notifications', record: { id: id(7), user_id: id(8), type: 'mention' } })).toEqual([id(7)])
  })

  it('counts a notification once however often it is named', () => {
    expect(batch.idsFrom({ ids: [id(1), id(1).toUpperCase(), id(1)] })).toEqual([id(1)])
  })

  it('passes over what is not an id rather than failing the rest', () => {
    expect(batch.idsFrom({ ids: [id(1), 7, null, 'not-an-id', { id: id(2) }, id(3)] })).toEqual([id(1), id(3)])
  })

  it('has nothing to do for anything else', () => {
    for (const nothing of [null, undefined, 'ids', 12, [], {}, { ids: 'x' }, { ids: [] }, { record: null }, { record: {} }, { user_id: id(1), type: 'mention' }]) {
      expect(batch.idsFrom(nothing)).toEqual([])
    }
  })

  it('stops at a number no honest call reaches', () => {
    const many = Array.from({ length: batch.MOST_IDS + 50 }, (_, n) => id(n))
    expect(batch.idsFrom({ ids: many })).toHaveLength(batch.MOST_IDS)
  })
})

describe('what goes to which device', () => {
  it('names each device once, with everything going to it in the order given', () => {
    const phone = device('phone')
    const laptop = device('laptop')
    const other = device('other')
    const parcels = batch.byDevice([row(1, [phone, laptop]), row(2, [other]), row(3, [phone])])
    expect(parcels.map((p) => [p.device.id, p.rows.map((r) => r.id)])).toEqual([
      ['phone', [id(1), id(3)]],
      ['laptop', [id(1)]],
      ['other', [id(2)]],
    ])
  })

  it('has nothing for a batch nobody is to be buzzed for', () => {
    expect(batch.byDevice([])).toEqual([])
  })
})

describe('how many sends are out at once', () => {
  it('does every one, never more than the limit together', async () => {
    let out = 0
    let most = 0
    const done: number[] = []
    await batch.inPool(
      Array.from({ length: 41 }, (_, n) => n),
      16,
      async (n) => {
        out += 1
        most = Math.max(most, out)
        await new Promise((r) => setTimeout(r, 1))
        out -= 1
        done.push(n)
      },
    )
    expect(done.sort((a, b) => a - b)).toEqual(Array.from({ length: 41 }, (_, n) => n))
    expect(most).toBe(16)
  })

  it('finishes at once with nothing to do', async () => {
    await expect(batch.inPool([], 16, async () => undefined)).resolves.toBeUndefined()
  })
})

describe('what App Health is told', () => {
  it('says nothing when every push went', () => {
    expect(batch.failureLine({}, 41)).toBeNull()
  })

  it('says how many did not, and why, the commonest first', () => {
    expect(batch.failureLine({ 'no answer': 1, '403': 2 }, 41)).toBe('3 of 41 pushes did not reach a phone: 403 ×2, no answer ×1')
    expect(batch.failureLine({ '500': 1 }, 1)).toBe('1 of 1 push did not reach a phone: 500 ×1')
  })

  it('counts a refusal under its status, and silence as no answer', () => {
    expect(batch.reasonFor({ statusCode: 403 })).toBe('403')
    expect(batch.reasonFor(new Error('socket hang up'))).toBe('no answer')
    expect(batch.reasonFor(null)).toBe('no answer')
  })

  it('does not call a subscription the browser threw away a failure', () => {
    expect(batch.isGone({ statusCode: 410 })).toBe(true)
    expect(batch.isGone({ statusCode: 404 })).toBe(true)
    expect(batch.isGone({ statusCode: 403 })).toBe(false)
    expect(batch.isGone(new Error('timeout'))).toBe(false)
  })
})

describe('the two halves agree', () => {
  it('the function asks the database for the batch and reports refusals to it', () => {
    expect(pushSource).toContain("supabase.rpc('push_batch', { p_ids: ids })")
    expect(pushSource).toContain("supabase.rpc('push_note_failures', { p_detail: line })")
  })

  it('the database sends the shape the function reads, no more to a call than it will take', () => {
    expect(handsOver).toContain("jsonb_build_object('ids', to_jsonb(p_ids[first : first + 99]))")
    expect(batch.MOST_IDS).toBeGreaterThanOrEqual(100)
  })
})
