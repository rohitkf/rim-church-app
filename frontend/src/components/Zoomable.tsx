import { useState, type ReactNode } from 'react'
import { Overlay } from './Surface'

/**
 * A picture you can tap to see big.
 *
 * The thumbnail is a button; it opens the same picture across the screen,
 * where it can be zoomed in further (the Zoom button, or a double tap) and
 * dragged around. For a QR code that is the difference between a phone
 * at the back of the hall reading it and not: a 176px square on somebody
 * else's screen is too small to scan.
 *
 * `children` is drawn twice — small in the button, large in the preview —
 * so it should size itself to its box (`h-full w-full` or `h-auto w-full`).
 */
export function Zoomable({
  label,
  thumbnail,
  children,
  href,
}: {
  /** What the picture is, said by the button and the preview. */
  label: string
  /** The small one, already sized. */
  thumbnail: ReactNode
  /** The large one; fills the width it is given. */
  children: ReactNode
  /** The picture itself, to open in a tab of its own. */
  href?: string
}) {
  const [open, setOpen] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const close = () => {
    setOpen(false)
    setZoomed(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Enlarge ${label}`}
        className="tap group relative cursor-zoom-in rounded-[var(--radius-chip)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {thumbnail}
        <span
          aria-hidden="true"
          className="absolute bottom-1.5 right-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-surface-container/90 text-on-surface shadow-[var(--shadow-lifted)] ring-1 ring-black/10 transition-transform group-hover:scale-110 dark:ring-white/15"
        >
          <MagnifierGlyph plus />
        </span>
      </button>

      {open && (
        <Overlay label={label} onDismiss={close}>
          <figure className="flex w-full max-w-lg flex-col gap-3 rounded-[var(--radius-shell)] bg-surface-lowest p-4 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12">
            <figcaption className="pr-10 text-headline-sm text-on-surface">{label}</figcaption>
            <div className="max-h-[70vh] overflow-auto rounded-[var(--radius-chip)] bg-white">
              <div
                onDoubleClick={() => setZoomed((z) => !z)}
                className={`p-3 transition-[width] duration-300 ${zoomed ? 'w-[220%] cursor-zoom-out' : 'w-full cursor-zoom-in'}`}
              >
                {children}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setZoomed((z) => !z)}
                aria-pressed={zoomed}
                className="tap inline-flex items-center gap-1.5 rounded-full bg-surface-container px-4 py-2 text-body-sm font-medium text-on-surface hover:bg-surface-low"
              >
                <MagnifierGlyph plus={!zoomed} />
                {zoomed ? 'Zoom out' : 'Zoom in'}
              </button>
              {href && (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tap inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-body-sm font-medium text-primary hover:bg-surface-container"
                >
                  Open full size <span aria-hidden="true">↗</span>
                </a>
              )}
            </div>
          </figure>
        </Overlay>
      )}
    </>
  )
}

function MagnifierGlyph({ plus }: { plus: boolean }) {
  return (
    <span aria-hidden="true" className="inline-flex">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2" />
        <path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M7.5 10.5h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        {plus && <path d="M10.5 7.5v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
      </svg>
    </span>
  )
}
