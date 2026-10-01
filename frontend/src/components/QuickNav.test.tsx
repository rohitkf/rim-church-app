import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { HOLD_MS, QuickNavButton } from './QuickNav'

const Icon = () => null
const items = [
  { to: '/', label: 'Dashboard', icon: Icon },
  { to: '/rota', label: 'Team Rota', icon: Icon, group: 'Sunday' },
  { to: '/set-lists', label: 'Set Lists', icon: Icon, group: 'Sunday' },
  { to: '/messages', label: 'Messages', icon: Icon, group: 'Talk' },
]

// jsdom lays nothing out, so each row is given a 40px band of its own.
const ROW = 40
beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const i = items.findIndex((it) => this.id === `quicknav-${it.to}`)
    const top = i >= 0 ? 100 + i * ROW : 0
    return { top, bottom: top + ROW, height: ROW, left: 0, right: 360, width: 360, x: 0, y: top, toJSON: () => ({}) } as DOMRect
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function show(onTap = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/rota']}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <QuickNavButton items={items} onTap={onTap} expanded={false} className="">
                ⋯
              </QuickNavButton>
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
  return { onTap, more: screen.getByRole('button', { name: 'More' }) }
}

const at = (i: number) => 100 + i * ROW + ROW / 2

describe('holding More', () => {
  it('still opens the sheet on a tap', () => {
    const { onTap, more } = show()
    fireEvent.pointerDown(more, { clientX: 300, clientY: 700 })
    fireEvent.pointerUp(window)
    fireEvent.click(more)
    expect(onTap).toHaveBeenCalledOnce()
    expect(screen.queryByRole('listbox', { name: 'Quick navigation' })).toBeNull()
  })

  it('rises over the page after a moment, lit on the page you are on', () => {
    const { more } = show()
    fireEvent.pointerDown(more, { clientX: 300, clientY: 700 })
    act(() => vi.advanceTimersByTime(HOLD_MS))
    expect(screen.getByRole('listbox', { name: 'Quick navigation' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Team Rota' })).toHaveAttribute('aria-selected', 'true')
  })

  it('follows the finger and goes where it is lifted', () => {
    const { onTap, more } = show()
    fireEvent.pointerDown(more, { clientX: 300, clientY: 700 })
    act(() => vi.advanceTimersByTime(HOLD_MS))
    fireEvent.pointerMove(window, { clientX: 300, clientY: at(3) })
    expect(screen.getByRole('option', { name: 'Messages' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.pointerMove(window, { clientX: 300, clientY: at(0) })
    expect(screen.getByRole('option', { name: 'Dashboard' })).toHaveAttribute('aria-selected', 'true')
    act(() => {
      fireEvent.pointerUp(window)
    })
    fireEvent.click(more)
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/)
    expect(screen.queryByRole('listbox')).toBeNull()
    // The release is the gesture's end, not a tap that opens the sheet.
    expect(onTap).not.toHaveBeenCalled()
  })

  it('stays put when lifted without moving', () => {
    const { more } = show()
    fireEvent.pointerDown(more, { clientX: 300, clientY: 700 })
    act(() => vi.advanceTimersByTime(HOLD_MS))
    act(() => {
      fireEvent.pointerUp(window)
    })
    expect(screen.getByTestId('where')).toHaveTextContent('/rota')
  })

  it('is a scroll, not a hold, when the finger moves first', () => {
    const { more } = show()
    fireEvent.pointerDown(more, { clientX: 300, clientY: 700 })
    fireEvent.pointerMove(window, { clientX: 300, clientY: 660 })
    act(() => vi.advanceTimersByTime(HOLD_MS * 2))
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('closes without going anywhere when the browser cuts the gesture short', () => {
    const { more } = show()
    fireEvent.pointerDown(more, { clientX: 300, clientY: 700 })
    act(() => vi.advanceTimersByTime(HOLD_MS))
    fireEvent.pointerMove(window, { clientX: 300, clientY: at(3) })
    act(() => {
      fireEvent.pointerCancel(window)
    })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.getByTestId('where')).toHaveTextContent('/rota')
  })
})
