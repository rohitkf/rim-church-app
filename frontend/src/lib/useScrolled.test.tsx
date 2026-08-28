import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useScrolled } from './useScrolled'

function scrollTo(y: number) {
  act(() => {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
    window.dispatchEvent(new Event('scroll'))
  })
}

afterEach(() => scrollTo(0))

describe('useScrolled', () => {
  it('is false at the top, where the strip sits on the ground', () => {
    const { result } = renderHook(() => useScrolled())
    expect(result.current).toBe(false)
  })

  it('turns on once content is passing underneath', () => {
    const { result } = renderHook(() => useScrolled())
    scrollTo(40)
    expect(result.current).toBe(true)
  })

  it('turns off again on the way back up', () => {
    const { result } = renderHook(() => useScrolled())
    scrollTo(40)
    scrollTo(0)
    expect(result.current).toBe(false)
  })

  it('reads the position it was mounted at, not just later changes', () => {
    Object.defineProperty(window, 'scrollY', { value: 200, configurable: true })
    const { result } = renderHook(() => useScrolled())
    expect(result.current).toBe(true)
  })
})
