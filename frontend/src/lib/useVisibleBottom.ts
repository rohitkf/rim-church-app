import { useEffect, useState } from 'react'

/*
 * Keeping the bottom menu on the bottom of what you can see.
 *
 * A `position: fixed; bottom: 0` bar sits on the bottom of the *layout*
 * viewport. On an iPhone that is not always the bottom of the screen:
 * after the keyboard closes, iOS can leave the page scrolled past its end
 * with the layout viewport still shifted, and the bar floats a keyboard's
 * height up the screen until something else makes the page settle. People
 * saw the menu "flying here and there".
 *
 * So the bar is moved by the difference between the layout viewport's
 * bottom and the visual viewport's (window.visualViewport), and when an
 * input is focused with the keyboard up it steps out of the way rather than
 * riding on top of it. When the keyboard goes, the page is nudged to its own
 * scroll position, which is what makes iOS put the viewports back together.
 */

const editable = (el: Element | null) =>
  !!el &&
  (el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el as HTMLElement).isContentEditable)

export interface VisibleBottom {
  /** Pixels to lift the bar by, so it sits on the visible bottom edge. */
  lift: number
  /** The keyboard is up: the bar keeps out of its way. */
  keyboard: boolean
}

export function useVisibleBottom(): VisibleBottom {
  const [state, setState] = useState<VisibleBottom>({ lift: 0, keyboard: false })

  useEffect(() => {
    const vv = typeof window === 'undefined' ? undefined : window.visualViewport
    if (!vv) return

    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const gap = window.innerHeight - (vv.height + vv.offsetTop)
        const keyboard = editable(document.activeElement) && vv.height < window.innerHeight * 0.8
        // Only ever up, and only by a real amount: a pixel of rounding is
        // not worth a repaint, and down would push it off the screen.
        const lift = keyboard ? 0 : gap > 2 ? Math.round(gap) : 0
        setState((prev) => (prev.lift === lift && prev.keyboard === keyboard ? prev : { lift, keyboard }))
      })
    }

    let settle = 0
    const onFocusOut = () => {
      window.clearTimeout(settle)
      settle = window.setTimeout(() => {
        if (editable(document.activeElement)) return
        // Scrolling to where it already is makes iOS line the viewports up again.
        window.scrollTo(window.scrollX, window.scrollY)
        measure()
      }, 120)
    }

    measure()
    vv.addEventListener('resize', measure)
    vv.addEventListener('scroll', measure)
    window.addEventListener('scroll', measure, { passive: true })
    document.addEventListener('focusin', measure)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(settle)
      vv.removeEventListener('resize', measure)
      vv.removeEventListener('scroll', measure)
      window.removeEventListener('scroll', measure)
      document.removeEventListener('focusin', measure)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  return state
}
