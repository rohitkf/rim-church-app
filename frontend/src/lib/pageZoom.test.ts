import { afterEach, describe, expect, it } from 'vitest'
import { applyPageZoom, readPageZoom, VIEWPORT_FIXED, VIEWPORT_ZOOMABLE, writePageZoom } from './pageZoom'

function withViewport() {
  const meta = document.createElement('meta')
  meta.name = 'viewport'
  meta.content = VIEWPORT_FIXED
  document.head.appendChild(meta)
  return meta
}

function pinch(type = 'gesturestart') {
  const e = new Event(type, { cancelable: true })
  document.dispatchEvent(e)
  return e.defaultPrevented
}

afterEach(() => {
  applyPageZoom(true)
  document.head.querySelectorAll('meta[name="viewport"]').forEach((m) => m.remove())
  window.localStorage.clear()
})

describe('page zoom', () => {
  it('is off until somebody turns it on', () => {
    expect(readPageZoom()).toBe(false)
    writePageZoom(true)
    expect(readPageZoom()).toBe(true)
    writePageZoom(false)
    expect(readPageZoom()).toBe(false)
  })

  it('off: the viewport forbids it and iOS pinch gestures are cancelled', () => {
    const meta = withViewport()
    applyPageZoom(false)
    expect(meta.content).toBe(VIEWPORT_FIXED)
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) expect(pinch(type)).toBe(true)
  })

  it('on: the viewport allows it and gestures pass through', () => {
    const meta = withViewport()
    applyPageZoom(false)
    applyPageZoom(true)
    expect(meta.content).toBe(VIEWPORT_ZOOMABLE)
    expect(meta.content).not.toMatch(/user-scalable|maximum-scale/)
    expect(pinch()).toBe(false)
  })

  it('leaves touches alone either way, so the stage plan and the map still pinch', () => {
    applyPageZoom(false)
    const e = new Event('touchmove', { cancelable: true })
    document.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
  })
})
