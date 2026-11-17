import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hedge, watch } from './signInHedge'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('the second road to signing in', () => {
  it('is not taken once the first has answered — a sign-in is made once', async () => {
    // What production showed: every sign-in arriving twice, six seconds apart.
    const attempt = vi.fn(() => Promise.resolve({ ok: true }))
    void hedge(6_000, () => false, attempt)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(attempt).not.toHaveBeenCalled()
  })

  it('is not taken before its wait is over', async () => {
    const attempt = vi.fn(() => Promise.resolve({ ok: true }))
    void hedge(6_000, () => true, attempt)
    await vi.advanceTimersByTimeAsync(5_999)
    expect(attempt).not.toHaveBeenCalled()
  })

  it('is taken, once, when the first is still silent, and wins if it works', async () => {
    const attempt = vi.fn(() => Promise.resolve({ ok: true }))
    const won = hedge(6_000, () => true, attempt)
    await vi.advanceTimersByTimeAsync(6_000)
    await expect(won).resolves.toBe('signed-in')
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('never answers when it fails, so it cannot cut the first road short', async () => {
    for (const attempt of [() => Promise.resolve({ ok: false, message: 'Invalid login credentials' }), () => Promise.reject(new Error('down'))]) {
      const settled = vi.fn()
      void hedge(6_000, () => true, attempt).then(settled, settled)
      await vi.advanceTimersByTimeAsync(60_000)
      expect(settled).not.toHaveBeenCalled()
    }
  })

  it('knows a request is silent until it settles, either way', async () => {
    let answer!: (v: string) => void
    const yes = watch(new Promise<string>((resolve) => (answer = resolve)))
    expect(yes.silent()).toBe(true)
    answer('ok')
    await expect(yes.answer).resolves.toBe('ok')
    expect(yes.silent()).toBe(false)

    const no = watch(Promise.reject(new Error('down')))
    await expect(no.answer).rejects.toThrow('down')
    expect(no.silent()).toBe(false)
  })
})
