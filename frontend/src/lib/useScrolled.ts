import { useEffect, useState } from 'react'

/**
 * Whether the page has been scrolled past a threshold.
 *
 * Used by the sticky top strip to decide whether it needs a background: at
 * the top of a page it sits on the ground and needs nothing, but once
 * content is passing underneath it, the two collide unless the strip stands
 * on something.
 *
 * The listener is passive and only ever flips one boolean, so it does not
 * re-render on every pixel of a scroll.
 */
export function useScrolled(threshold = 8): boolean {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const read = () => setScrolled(window.scrollY > threshold)
    read()
    window.addEventListener('scroll', read, { passive: true })
    return () => window.removeEventListener('scroll', read)
  }, [threshold])

  return scrolled
}
