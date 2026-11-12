import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dismissToast, showToast, subscribeToasts, type Toast } from './toast'

/*
 * The toast store. A toast says what happened and goes; one with
 * something to press on it (0281, "Undo") is never folded into another,
 * because two people checked in are two things to take back.
 */

let seen: Toast[] = []
let stop = () => {}

beforeEach(() => {
  vi.useFakeTimers()
  stop = subscribeToasts((list) => {
    seen = list
  })
})

afterEach(() => {
  // Every toast runs out: nothing is left for the next test.
  vi.runAllTimers()
  stop()
  vi.useRealTimers()
})

const texts = () => seen.map((t) => t.text)

describe('a toast', () => {
  it('shows, and goes after its time', () => {
    showToast('Saved')
    expect(texts()).toEqual(['Saved'])
    expect(seen[0].tone).toBe('success')
    vi.advanceTimersByTime(2599)
    expect(texts()).toEqual(['Saved'])
    vi.advanceTimersByTime(1)
    expect(texts()).toEqual([])
  })

  it('replaces the same words said twice, and keeps different words side by side', () => {
    showToast('Saved')
    showToast('Saved')
    showToast('Could not save', 'error')
    expect(texts()).toEqual(['Saved', 'Could not save'])
    expect(seen[1].tone).toBe('error')
  })

  it('stays as long as it is asked to', () => {
    showToast('Checked in Ama', 'success', 10_000, { label: 'Undo', run: () => undefined })
    vi.advanceTimersByTime(9_999)
    expect(texts()).toEqual(['Checked in Ama'])
    vi.advanceTimersByTime(1)
    expect(texts()).toEqual([])
  })
})

describe('a toast with something to press', () => {
  const undo = () => ({ label: 'Undo', run: () => undefined })

  it('carries its button', () => {
    const run = vi.fn()
    showToast('Marked as received', 'success', 10_000, { label: 'Undo', run })
    expect(seen[0].action?.label).toBe('Undo')
    seen[0].action!.run()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('is never folded into another, even with the same words', () => {
    showToast('Checked in', 'success', 10_000, undo())
    showToast('Checked in', 'success', 10_000, undo())
    expect(texts()).toEqual(['Checked in', 'Checked in'])
    // And a plain one with those words does not take them down either.
    showToast('Checked in')
    expect(seen.filter((t) => t.action)).toHaveLength(2)
  })

  it('keeps the newest three: the oldest gives way', () => {
    for (const name of ['Ama', 'Ben', 'Dan', 'Grace']) showToast(`Checked in ${name}`, 'success', 10_000, undo())
    expect(texts()).toEqual(['Checked in Ben', 'Checked in Dan', 'Checked in Grace'])
  })

  it('comes down at once when dismissed, and its timer running out afterwards changes nothing', () => {
    const first = showToast('Checked in Ama', 'success', 10_000, undo())
    showToast('Checked in Ben', 'success', 10_000, undo())
    dismissToast(first)
    expect(texts()).toEqual(['Checked in Ben'])
    const heard = vi.fn()
    const off = subscribeToasts(heard)
    heard.mockClear()
    // Dismissing what is already gone tells nobody.
    dismissToast(first)
    expect(heard).not.toHaveBeenCalled()
    off()
  })
})
