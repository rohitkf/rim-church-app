import { describe, expect, it, vi } from 'vitest'
import { RequestTimeoutError, fetchWithTimeout } from './fetchTimeout'

const never = () => new Promise<Response>(() => {})

describe('fetchWithTimeout', () => {
  it('passes a normal response straight through', async () => {
    const base = vi.fn(() => Promise.resolve(new Response('ok', { status: 200 })))
    const wrapped = fetchWithTimeout(base as unknown as typeof fetch, 50)
    const res = await wrapped('https://example.test/')
    expect(res.status).toBe(200)
  })

  it('gives up on a request that never comes back', async () => {
    const wrapped = fetchWithTimeout(never as unknown as typeof fetch, 20)
    await expect(wrapped('https://example.test/')).rejects.toBeInstanceOf(RequestTimeoutError)
  })

  it('says what to do about it, rather than just "aborted"', async () => {
    const wrapped = fetchWithTimeout(never as unknown as typeof fetch, 20)
    await expect(wrapped('https://example.test/')).rejects.toThrow(/connection/i)
  })

  it('aborts the underlying request rather than leaving it running', async () => {
    let seen: AbortSignal | undefined
    const base = (_input: unknown, init?: RequestInit) => {
      seen = init?.signal ?? undefined
      return never()
    }
    const wrapped = fetchWithTimeout(base as unknown as typeof fetch, 20)
    await expect(wrapped('https://example.test/')).rejects.toBeInstanceOf(RequestTimeoutError)
    expect(seen?.aborted).toBe(true)
  })

  it("still honours the caller's own abort signal", async () => {
    const controller = new AbortController()
    const wrapped = fetchWithTimeout(never as unknown as typeof fetch, 10_000)
    const pending = wrapped('https://example.test/', { signal: controller.signal })
    controller.abort(new Error('caller changed their mind'))
    await expect(pending).rejects.toThrow('caller changed their mind')
  })

  it('does not start a request the caller has already abandoned', async () => {
    const controller = new AbortController()
    controller.abort(new Error('too late'))
    const base = vi.fn(() => Promise.resolve(new Response('ok')))
    const wrapped = fetchWithTimeout(base as unknown as typeof fetch, 50)
    await expect(wrapped('https://example.test/', { signal: controller.signal })).rejects.toThrow(
      'too late',
    )
  })

  it('lets a real network error through unchanged', async () => {
    const base = () => Promise.reject(new TypeError('Failed to fetch'))
    const wrapped = fetchWithTimeout(base as unknown as typeof fetch, 50)
    await expect(wrapped('https://example.test/')).rejects.toThrow('Failed to fetch')
  })
})
