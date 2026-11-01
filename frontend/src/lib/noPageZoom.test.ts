import { describe, expect, it } from 'vitest'
import { stopPageZoom } from './noPageZoom'

describe('stopPageZoom', () => {
  it("cancels iOS's pinch gestures on the page", () => {
    const target = new EventTarget()
    stopPageZoom(target as unknown as Document)
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
      const e = new Event(type, { cancelable: true })
      target.dispatchEvent(e)
      expect(e.defaultPrevented).toBe(true)
    }
  })

  it('leaves touches alone, so pinching the stage or the map still works', () => {
    const target = new EventTarget()
    stopPageZoom(target as unknown as Document)
    const e = new Event('touchmove', { cancelable: true })
    target.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
  })
})
