import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useVisibleBottom } from './useVisibleBottom'

/*
 * The bottom menu sat part-way up the screen after a list loaded: a lift
 * read while the page was changing height stayed until the next scroll.
 * It is read again when the page changes height, and once things settle.
 */

class FakeViewport extends EventTarget {
  height = 800
  offsetTop = 0
}

let observed: (() => void) | null = null

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number)
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: () => void) {
        observed = cb
      }
      observe() {}
      disconnect() {}
    },
  )
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  observed = null
})

describe('useVisibleBottom', () => {
  it('drops a lift read mid-change once the page settles', () => {
    const vv = new FakeViewport()
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv })
    const { result } = renderHook(() => useVisibleBottom())

    // A list loads: for a moment the viewports disagree.
    vv.height = 700
    act(() => {
      observed?.()
      vi.advanceTimersByTime(1)
    })
    expect(result.current.lift).toBe(100)

    // They agree again a beat later, with no scroll to say so.
    vv.height = 800
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(result.current.lift).toBe(0)
  })
})
