import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Overlay } from './Surface'

/*
 * A modal that lets the page scroll behind it is not a modal.
 *
 * On a phone this was not cosmetic: dragging anywhere on the inventory's
 * edit form scrolled the page underneath instead of the form, so the
 * bottom half of the longest form in the app could not be reached at all.
 */

// Testing Library unmounts between tests, which runs the overlay's own
// cleanup and balances the open-overlay count — so no reset seam is needed.
afterEach(() => {
  document.body.style.position = ''
  document.body.style.top = ''
})

const show = (onDismiss = vi.fn()) =>
  render(
    <Overlay label="A dialog" onDismiss={onDismiss}>
      <div>the dialog</div>
    </Overlay>,
  )

describe('Overlay', () => {
  it('holds the page still while it is open', () => {
    show()
    expect(document.body.style.position).toBe('fixed')
  })

  it('lets the page go again when it closes', () => {
    const { unmount } = show()
    unmount()
    expect(document.body.style.position).toBe('')
  })

  it('does not release the page while another overlay is still open', () => {
    // A dialog opened from inside another used to unlock the page on its
    // own way out, leaving the one behind it scrollable underneath.
    const first = show()
    const second = show()
    second.unmount()
    expect(document.body.style.position).toBe('fixed')
    first.unmount()
    expect(document.body.style.position).toBe('')
  })

  it('scrolls itself rather than clipping a dialog taller than the screen', () => {
    // `items-center` on the scroll container is the flexbox trap: content
    // taller than the viewport has both its ends pushed outside the
    // scrollable area, so the top of a long form is unreachable. The
    // scroll belongs on the outside, the centring within.
    show()
    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toContain('overflow-y-auto')
    expect(dialog.className).toContain('overscroll-contain')
    expect(dialog.className).not.toContain('items-center')

    const centring = dialog.firstElementChild as HTMLElement
    expect(centring.className).toContain('min-h-full')
    expect(centring.className).toContain('items-center')
  })

  it('closes on a click outside, on either wrapper', async () => {
    const onDismiss = vi.fn()
    show(onDismiss)
    const user = userEvent.setup()
    const dialog = screen.getByRole('dialog')

    await user.click(dialog)
    expect(onDismiss).toHaveBeenCalledTimes(1)

    // The inner centring element is the one a click on the padding now
    // actually lands on, so it has to dismiss too.
    await user.click(dialog.firstElementChild as HTMLElement)
    expect(onDismiss).toHaveBeenCalledTimes(2)
  })

  it('stays open when the click is on the dialog itself', async () => {
    const onDismiss = vi.fn()
    show(onDismiss)
    const user = userEvent.setup()
    await user.click(screen.getByText('the dialog'))
    expect(onDismiss).not.toHaveBeenCalled()
  })
})
