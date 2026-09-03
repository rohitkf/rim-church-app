import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useDragReorder } from './useDragReorder'

const ROW_HEIGHT = 40

/**
 * jsdom lays nothing out, so a drag measures a page of zeroes and never
 * swaps anything. This gives every row the position it would have in a
 * plain stacked list — read at the moment it is asked, so the rows report
 * their new positions the instant the list reorders, which is exactly the
 * reflow the hook is written against.
 */
function layOutRows() {
  return vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      const items = Array.from(document.querySelectorAll('li'))
      const index = items.indexOf(this as HTMLLIElement)
      const top = index < 0 ? 0 : index * ROW_HEIGHT
      return {
        top,
        bottom: top + ROW_HEIGHT,
        height: ROW_HEIGHT,
        left: 0,
        right: 100,
        width: 100,
        x: 0,
        y: top,
        toJSON: () => ({}),
      } as DOMRect
    })
}

function List({
  ids,
  onCommit,
  enabled = true,
}: {
  ids: string[]
  onCommit: (next: string[]) => void
  enabled?: boolean
}) {
  const { ordered, handleProps, rowProps } = useDragReorder(ids, onCommit, { enabled })
  return (
    <ul>
      {ordered.map((id) => (
        <li key={id} {...rowProps(id)}>
          <button aria-label={`Reorder ${id}`} {...handleProps(id)} />
          {id}
        </li>
      ))}
    </ul>
  )
}

describe('useDragReorder', () => {
  it('moves a row down a place on Arrow Down', async () => {
    const onCommit = vi.fn()
    render(<List ids={['a', 'b', 'c']} onCommit={onCommit} />)
    screen.getByLabelText('Reorder a').focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(onCommit).toHaveBeenCalledWith(['b', 'a', 'c'])
  })

  it('moves a row up a place on Arrow Up', async () => {
    const onCommit = vi.fn()
    render(<List ids={['a', 'b', 'c']} onCommit={onCommit} />)
    screen.getByLabelText('Reorder c').focus()
    await userEvent.keyboard('{ArrowUp}')
    expect(onCommit).toHaveBeenCalledWith(['a', 'c', 'b'])
  })

  it('writes nothing when the row is already at the end it is pushed against', async () => {
    const onCommit = vi.fn()
    render(<List ids={['a', 'b']} onCommit={onCommit} />)
    screen.getByLabelText('Reorder a').focus()
    await userEvent.keyboard('{ArrowUp}')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('does nothing at all for somebody who may not reorder the list', async () => {
    const onCommit = vi.fn()
    render(<List ids={['a', 'b']} onCommit={onCommit} enabled={false} />)
    screen.getByLabelText('Reorder a').focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('leaves keys it does not own alone, so typing still works', async () => {
    const onCommit = vi.fn()
    render(<List ids={['a', 'b']} onCommit={onCommit} />)
    screen.getByLabelText('Reorder a').focus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(onCommit).not.toHaveBeenCalled()
  })

  describe('dragging with a pointer', () => {
    let rects: ReturnType<typeof layOutRows>

    beforeEach(() => {
      rects = layOutRows()
      // The slide releases its transform on the next frame; run it at once
      // so a test never waits on a paint that jsdom will not schedule.
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        cb(0)
        return 0
      })
    })

    afterEach(() => {
      rects.mockRestore()
      vi.unstubAllGlobals()
    })

    const drag = (id: string, toY: number) => {
      const grip = screen.getByLabelText(`Reorder ${id}`)
      fireEvent.pointerDown(grip, { button: 0, clientY: 0 })
      act(() => {
        fireEvent.pointerMove(window, { clientY: toY })
      })
    }

    const order = () => Array.from(document.querySelectorAll('li')).map((li) => li.textContent)

    it('swaps with the row below once the pointer passes its middle', () => {
      const onCommit = vi.fn()
      render(<List ids={['a', 'b', 'c']} onCommit={onCommit} />)
      drag('a', ROW_HEIGHT)
      expect(order()).toEqual(['b', 'a', 'c'])
      fireEvent.pointerUp(window)
      expect(onCommit).toHaveBeenCalledWith(['b', 'a', 'c'])
    })

    it('does not swap back while the displaced row is still sliding', () => {
      // The row that moved out of the way is drawn part-way between two
      // places for a quarter of a second. Deciding the next swap on where
      // it is drawn, rather than where it is settling, makes the list
      // oscillate under a held finger.
      const onCommit = vi.fn()
      render(<List ids={['a', 'b', 'c']} onCommit={onCommit} />)
      drag('a', ROW_HEIGHT)
      expect(order()).toEqual(['b', 'a', 'c'])

      // Held exactly where it was let go: nothing further should move.
      act(() => {
        fireEvent.pointerMove(window, { clientY: ROW_HEIGHT })
      })
      expect(order()).toEqual(['b', 'a', 'c'])
    })

    it('writes nothing when the drag ends where it started', () => {
      const onCommit = vi.fn()
      render(<List ids={['a', 'b', 'c']} onCommit={onCommit} />)
      drag('a', 4)
      fireEvent.pointerUp(window)
      expect(onCommit).not.toHaveBeenCalled()
    })

    it('lifts the row it is holding, and sets it down rather than dropping it', () => {
      vi.useFakeTimers()
      const onCommit = vi.fn()
      render(<List ids={['a', 'b', 'c']} onCommit={onCommit} />)
      drag('a', ROW_HEIGHT)

      const held = screen.getByText('a', { selector: 'li' })
      expect(held.style.boxShadow).toBe('var(--shadow-lifted)')

      act(() => {
        fireEvent.pointerUp(window)
      })
      // Still raised, on its way down — not flat in the same frame.
      const landed = screen.getByText('a', { selector: 'li' })
      expect(landed.style.transition).toContain('box-shadow')

      act(() => {
        vi.advanceTimersByTime(400)
      })
      expect(screen.getByText('a', { selector: 'li' }).style.transition).toBe('')
      vi.useRealTimers()
    })
  })
})