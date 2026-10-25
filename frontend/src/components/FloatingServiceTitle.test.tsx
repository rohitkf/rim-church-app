import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { FloatingServiceTitle } from './FloatingServiceTitle'

/*
 * When the floating title shows: once the opened part of a service has
 * scrolled under the app's top strip, and only while some of it is still
 * on screen beneath.
 */

function placeSection(top: number, bottom: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    top,
    bottom,
    left: 0,
    right: 400,
    width: 400,
    height: bottom - top,
    x: 0,
    y: top,
    toJSON: () => ({}),
  })
}

function scroll() {
  act(() => {
    window.dispatchEvent(new Event('scroll'))
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  document.documentElement.style.removeProperty('--app-header-h')
})

describe('the floating service title', () => {
  it('stays out of sight while the service’s own heading is on screen', () => {
    document.documentElement.style.setProperty('--app-header-h', '72px')
    placeSection(300, 1200)
    render(
      <section>
        <FloatingServiceTitle title="English Service" detail="Sun 1 Nov" />
      </section>,
    )
    expect(screen.getByTestId('floating-service-title')).toHaveAttribute('data-shown', 'false')
  })

  it('appears once the service has scrolled under the top strip, and goes as it leaves', async () => {
    document.documentElement.style.setProperty('--app-header-h', '72px')
    // A frame that comes at once, as the browser's would by the next paint.
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 0
    })
    placeSection(300, 1200)
    render(
      <section>
        <FloatingServiceTitle title="English Service" detail="Sun 1 Nov" />
      </section>,
    )
    placeSection(-400, 600)
    scroll()
    expect(screen.getByTestId('floating-service-title')).toHaveAttribute('data-shown', 'true')
    // Nearly all of it gone above: it leaves with the service.
    placeSection(-1000, 90)
    scroll()
    expect(screen.getByTestId('floating-service-title')).toHaveAttribute('data-shown', 'false')
  })

  it('names the service without repeating it in the page’s text', () => {
    render(<FloatingServiceTitle title="English Service" detail="Sun 1 Nov" />)
    expect(screen.queryByText('English Service')).not.toBeInTheDocument()
    expect(document.querySelector('[data-label="English Service"]')).not.toBeNull()
    expect(document.querySelector('[data-label="Sun 1 Nov"]')).not.toBeNull()
  })
})
