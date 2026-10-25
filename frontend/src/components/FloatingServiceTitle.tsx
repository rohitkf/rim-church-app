import { useEffect, useRef, useState } from 'react'

/** How much of the service has to be left on screen for the title to stay. */
const LINGER_PX = 48

/**
 * Which service this is, kept in view while its details are.
 *
 * An opened service can run to several screens — teams, answers, songs,
 * a checklist — and by the middle of it the heading that said which
 * service it was is long gone above. This is that heading again, small,
 * pinned under the app's top strip (`--app-header-h`, AppShell): it appears
 * once the top of the opened part has scrolled under the strip, stays while
 * any of it is on screen, and leaves with it.
 *
 * Put it first inside the element that holds the opened part — that
 * element is what it watches and what it is pinned within. It takes no
 * room of its own, so the card looks exactly as it did until it is needed.
 */
export function FloatingServiceTitle({
  title,
  detail,
  className = '',
}: {
  title: string
  detail?: string | null
  /** For a parent that spaces its children with a gap: a margin to take it back. */
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    const section = el?.parentElement
    if (!el || !section) return
    let frame = 0
    const measure = () => {
      frame = 0
      const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-header-h')) || 0
      const box = section.getBoundingClientRect()
      setShown(box.top < top && box.bottom > top + LINGER_PX)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [])

  return (
    <div
      ref={ref}
      data-testid="floating-service-title"
      data-shown={shown}
      className={`pointer-events-none sticky top-[calc(var(--app-header-h,4.5rem)+0.5rem)] z-10 h-0 ${className}`}
    >
      <div
        aria-hidden="true"
        className={`bg-[color-mix(in_oklab,var(--color-surface-lowest)_95%,transparent)] backdrop-blur-xl mx-auto flex w-fit max-w-full items-baseline gap-2 rounded-full px-4 py-1.5 shadow-[var(--shadow-lifted)] hairline transition-[opacity,transform] duration-200 ease-[var(--ease-glide)] ${
          shown ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0'
        }`}
      >
        {/* Drawn by CSS rather than written into the page: it repeats the
            heading for the eye, and is no second copy of it for anything
            reading the page's text. */}
        <span
          data-label={title}
          className="min-w-0 truncate text-body-sm font-medium text-on-surface before:content-[attr(data-label)]"
        />
        {detail && (
          <span
            data-label={detail}
            className="shrink-0 font-mono text-label-sm text-on-surface-variant before:content-[attr(data-label)]"
          />
        )}
      </div>
    </div>
  )
}
