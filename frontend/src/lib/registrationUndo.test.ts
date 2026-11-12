import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { UNDO_KEPT_MS, UNDO_OFFER_MS, holdBack, offerUndo, orderIdOfCode, recentUndo, resetUndoForTests, runUndo, undoOrder, useRecentUndo } from './registrationUndo'

/*
 * Undo on the registration pages (0281), the app's half: the offer in a
 * toast, the email held back until the offer has passed, and what this
 * browser did lately for the row's menu. What is put back, and who may,
 * is the database's and is proved there.
 */

const db = vi.hoisted(() => ({
  calls: [] as [string, unknown][],
  refuse: null as null | { message: string },
  order: { id: 'o-walk' } as { id: string } | null,
}))
const toasts = vi.hoisted(() => [] as { text: string; tone?: string; ms?: number; action?: { label: string; run: () => void } }[])

vi.mock('./supabaseClient', () => ({
  supabase: {
    rpc: (fn: string, args: unknown) => {
      db.calls.push([fn, args])
      return Promise.resolve(db.refuse ? { data: null, error: db.refuse } : { data: 'payment', error: null })
    },
    from: (table: string) => ({
      select: (cols: string) => ({
        eq: (col: string, value: string) => ({
          maybeSingle: () => {
            db.calls.push([`${table}.${cols}`, { [col]: value }])
            return Promise.resolve({ data: db.order, error: null })
          },
        }),
      }),
    }),
  },
}))
const dismissed = vi.hoisted(() => [] as number[])
vi.mock('./toast', () => ({
  // A toast's id is its place in the list, from one.
  showToast: (text: string, tone?: string, ms?: number, action?: { label: string; run: () => void }) => {
    toasts.push({ text, tone, ms, action })
    return toasts.length
  },
  dismissToast: (id: number) => {
    dismissed.push(id)
  },
}))

const words = (error: unknown, fallback: string) => (error as { message?: string })?.message ?? fallback
// Let the promises inside an undo settle.
const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers()
  db.calls = []
  db.refuse = null
  db.order = { id: 'o-walk' }
  toasts.length = 0
  dismissed.length = 0
  resetUndoForTests()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('asking the database', () => {
  it('undoes a registration by its id', async () => {
    await expect(undoOrder('o1')).resolves.toBe('payment')
    expect(db.calls).toEqual([['registration_order_undo', { p_id: 'o1' }]])
  })

  it('hands the database’s refusal on', async () => {
    db.refuse = { message: 'That was too long ago to undo. Use the menu to put it right.' }
    await expect(undoOrder('o1')).rejects.toEqual(db.refuse)
  })

  it('finds a walk-in’s registration from its code, and says so when it has gone', async () => {
    await expect(orderIdOfCode('WALKIN123456')).resolves.toBe('o-walk')
    expect(db.calls).toEqual([['registration_orders.id', { code: 'WALKIN123456' }]])
    db.order = null
    await expect(orderIdOfCode('WALKIN123456')).rejects.toThrow('That registration is not there any more.')
  })
})

describe('what waits for the offer to pass', () => {
  it('is sent when the time is up, once', () => {
    const send = vi.fn()
    holdBack(send)
    vi.advanceTimersByTime(UNDO_OFFER_MS - 1)
    expect(send).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(send).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(UNDO_OFFER_MS)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('is never sent once dropped', () => {
    const send = vi.fn()
    const waiting = holdBack(send)
    waiting.drop()
    vi.advanceTimersByTime(UNDO_OFFER_MS * 2)
    expect(send).not.toHaveBeenCalled()
    // And cannot be brought back.
    waiting.now()
    expect(send).not.toHaveBeenCalled()
  })

  it('is sent at once when asked, and not again when its time comes', () => {
    const send = vi.fn()
    const waiting = holdBack(send)
    waiting.now()
    expect(send).toHaveBeenCalledTimes(1)
    waiting.now()
    vi.advanceTimersByTime(UNDO_OFFER_MS * 2)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('all goes when the page is leaving: the press stands', () => {
    const first = vi.fn()
    const second = vi.fn()
    const dropped = vi.fn()
    holdBack(first)
    holdBack(second)
    holdBack(dropped).drop()
    window.dispatchEvent(new Event('pagehide'))
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    expect(dropped).not.toHaveBeenCalled()
    vi.advanceTimersByTime(UNDO_OFFER_MS * 2)
    expect(first).toHaveBeenCalledTimes(1)
  })

  it('all goes when the app is put in the background, and stays when it is only looked at again', () => {
    const send = vi.fn()
    holdBack(send)
    const visibility = vi.spyOn(document, 'visibilityState', 'get')
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(send).not.toHaveBeenCalled()
    visibility.mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(send).toHaveBeenCalledTimes(1)
    visibility.mockRestore()
  })
})

describe('the offer', () => {
  it('says what was done, with Undo on it, for as long as the email waits', () => {
    offerUndo({ text: 'Marked as received', orderId: 'o1', refresh: () => undefined, words })
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({ text: 'Marked as received', tone: 'success', ms: UNDO_OFFER_MS })
    expect(toasts[0].action?.label).toBe('Undo')
    // Nothing is asked of the database until it is pressed.
    expect(db.calls).toEqual([])
  })

  it('pressed: the registration is put back, the email never goes, the page reads again', async () => {
    const email = vi.fn()
    const refresh = vi.fn()
    const onUndone = vi.fn()
    offerUndo({ text: 'Marked as received', orderId: 'o1', then: email, refresh, onUndone, words })
    toasts[0].action!.run()
    await settle()
    expect(db.calls).toEqual([['registration_order_undo', { p_id: 'o1' }]])
    expect(toasts.at(-1)).toMatchObject({ text: 'Undone' })
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(onUndone).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(UNDO_OFFER_MS * 2)
    expect(email).not.toHaveBeenCalled()
    // Taken back: there is nothing left for the menu to offer.
    expect(recentUndo('o1')).toBeNull()
  })

  it('not pressed: the email goes when the offer has passed', () => {
    const email = vi.fn()
    offerUndo({ text: 'Marked as received', orderId: 'o1', then: email, refresh: () => undefined, words })
    vi.advanceTimersByTime(UNDO_OFFER_MS)
    expect(email).toHaveBeenCalledTimes(1)
    expect(db.calls).toEqual([])
  })

  it('refused: says why in the database’s words, and the email goes after all', async () => {
    db.refuse = { message: 'This registration has changed since. Use the menu to put it right.' }
    const email = vi.fn()
    const refresh = vi.fn()
    const onUndone = vi.fn()
    offerUndo({ text: 'Marked as received', orderId: 'o1', then: email, refresh, onUndone, words })
    toasts[0].action!.run()
    await settle()
    expect(toasts.at(-1)).toMatchObject({ text: 'This registration has changed since. Use the menu to put it right.', tone: 'error' })
    expect(email).toHaveBeenCalledTimes(1)
    // The page reads again all the same: what is on it may be stale. Nothing was taken back.
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(onUndone).not.toHaveBeenCalled()
    // And it is still there for the row to offer.
    expect(recentUndo('o1')).toBe('Marked as received')
    vi.advanceTimersByTime(UNDO_OFFER_MS * 2)
    expect(email).toHaveBeenCalledTimes(1)
  })

  it('finds the registration first when only its code is known (a walk-in)', async () => {
    const onUndone = vi.fn()
    offerUndo({ text: 'Registered Joel', orderId: () => orderIdOfCode('WALKIN123456'), refresh: () => undefined, onUndone, words })
    toasts[0].action!.run()
    await settle()
    expect(db.calls).toEqual([
      ['registration_orders.id', { code: 'WALKIN123456' }],
      ['registration_order_undo', { p_id: 'o-walk' }],
    ])
    expect(toasts.at(-1)).toMatchObject({ text: 'Undone' })
    expect(onUndone).toHaveBeenCalledTimes(1)
  })

  it('answers the undo itself, for a page with a button of its own: pressed twice, asked once', async () => {
    const onUndone = vi.fn()
    const undo = offerUndo({ text: 'Registered Joel', orderId: () => orderIdOfCode('WALKIN123456'), refresh: () => undefined, onUndone, words })
    const both = Promise.all([undo(), undo()])
    toasts[0].action!.run()
    await expect(both).resolves.toEqual([true, true])
    await expect(undo()).resolves.toBe(true)
    expect(db.calls.filter(([fn]) => fn === 'registration_order_undo')).toHaveLength(1)
    expect(onUndone).toHaveBeenCalledTimes(1)
  })

  it('can be asked again after a refusal: the signal dropped, then came back', async () => {
    db.refuse = { message: 'Failed to fetch' }
    const undo = offerUndo({ text: 'Checked in', orderId: 'o1', refresh: () => undefined, words })
    await expect(undo()).resolves.toBe(false)
    db.refuse = null
    await expect(undo()).resolves.toBe(true)
    expect(db.calls).toHaveLength(2)
  })

  it('gives way to a second press on the same registration: the first toast comes down, its email still goes', async () => {
    const paid = vi.fn()
    const unmatched = vi.fn()
    offerUndo({ text: 'Marked as received', orderId: 'o1', then: paid, refresh: () => undefined, words })
    offerUndo({ text: 'Checked in', orderId: 'o2', refresh: () => undefined, words })
    expect(dismissed).toEqual([])
    offerUndo({ text: 'Back to awaiting payment', orderId: 'o1', then: unmatched, refresh: () => undefined, words })
    // Toast 1 was the first press on o1; o2's stays.
    expect(dismissed).toEqual([1])
    // The row's Undo takes back the second press, and drops what the second was holding.
    await runUndo({ orderId: 'o1', refresh: () => undefined, words })
    expect(dismissed).toEqual([1, 3])
    vi.advanceTimersByTime(UNDO_OFFER_MS)
    expect(unmatched).not.toHaveBeenCalled()
    expect(paid).toHaveBeenCalledTimes(1)
  })

  it('drops the email from the row’s Undo as it would from the toast’s', async () => {
    const email = vi.fn()
    offerUndo({ text: 'Marked as received', orderId: 'o1', then: email, refresh: () => undefined, words })
    await runUndo({ orderId: 'o1', refresh: () => undefined, words })
    vi.advanceTimersByTime(UNDO_OFFER_MS * 2)
    expect(email).not.toHaveBeenCalled()
    expect(dismissed).toEqual([1])
  })

  it('answers whether it worked, for a caller with no toast of its own (the menu)', async () => {
    await expect(runUndo({ orderId: 'o1', refresh: () => undefined, words })).resolves.toBe(true)
    db.refuse = { message: 'There is nothing to undo on this registration.' }
    await expect(runUndo({ orderId: 'o1', refresh: () => undefined, words })).resolves.toBe(false)
    expect(toasts.map((t) => t.text)).toEqual(['Undone', 'There is nothing to undo on this registration.'])
  })
})

describe('what this browser did lately', () => {
  it('is remembered for as long as the database will take it back, and no longer', () => {
    vi.setSystemTime(new Date('2026-11-21T18:00:00Z'))
    expect(recentUndo('o1')).toBeNull()
    offerUndo({ text: 'Checked in', orderId: 'o1', refresh: () => undefined, words })
    expect(recentUndo('o1')).toBe('Checked in')
    expect(recentUndo('o2')).toBeNull()
    vi.setSystemTime(new Date(Date.parse('2026-11-21T18:00:00Z') + UNDO_KEPT_MS - 1))
    expect(recentUndo('o1')).toBe('Checked in')
    vi.setSystemTime(new Date(Date.parse('2026-11-21T18:00:00Z') + UNDO_KEPT_MS))
    expect(recentUndo('o1')).toBeNull()
  })

  it('is the last thing done, not the first', () => {
    offerUndo({ text: 'Marked as received', orderId: 'o1', refresh: () => undefined, words })
    offerUndo({ text: 'Checked in', orderId: 'o1', refresh: () => undefined, words })
    expect(recentUndo('o1')).toBe('Checked in')
  })

  it('tells a page that is drawing it: when something is done, taken back, and when its time is up', async () => {
    const { result } = renderHook(() => {
      const last = useRecentUndo()
      return last('o1')
    })
    expect(result.current).toBeNull()
    act(() => offerUndo({ text: 'Checked in', orderId: 'o1', refresh: () => undefined, words }))
    expect(result.current).toBe('Checked in')
    await act(async () => {
      await runUndo({ orderId: 'o1', refresh: () => undefined, words })
    })
    expect(result.current).toBeNull()
    act(() => offerUndo({ text: 'Marked as received', orderId: 'o1', refresh: () => undefined, words }))
    expect(result.current).toBe('Marked as received')
    act(() => {
      vi.advanceTimersByTime(UNDO_KEPT_MS)
    })
    expect(result.current).toBeNull()
  })

  it('does not remember a walk-in by a code it has not looked up', () => {
    offerUndo({ text: 'Registered Joel', orderId: () => Promise.resolve('o-walk'), refresh: () => undefined, words })
    expect(recentUndo('o-walk')).toBeNull()
  })
})
