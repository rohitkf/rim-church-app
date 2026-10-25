import { useEffect, useRef } from 'react'

/**
 * Keeps `--app-header-h` on the page equal to the top strip's height, so
 * whatever floats under it (FloatingServiceTitle) sits flush beneath it
 * rather than under a guess — the strip is taller on a desktop, and taller
 * again on a phone with a notch.
 */
export function useHeaderHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const root = document.documentElement
    const write = () => root.style.setProperty('--app-header-h', `${Math.round(el.getBoundingClientRect().height)}px`)
    write()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(write)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return ref
}
