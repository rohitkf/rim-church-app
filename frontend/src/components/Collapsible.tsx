import { useId, useState, type ReactNode } from 'react'

/**
 * Which of a list's sections are open, when most of them should be shut.
 *
 * Finished services are the case this exists for. They cannot be answered,
 * assigned or changed — they are a record — but they still have to be
 * reachable, because the week after is exactly when somebody wants to know
 * who actually served. Closed by default, opened by touching the header.
 */
export function useExpanded(): {
  isExpanded: (id: string) => boolean
  toggle: (id: string) => void
} {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  return {
    isExpanded: (id) => !!open[id],
    toggle: (id) => setOpen((s) => ({ ...s, [id]: !s[id] })),
  }
}

/** The one affordance that says "there is more under here". */
export function Chevron({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 select-none text-on-surface-variant transition-transform duration-300 ease-[var(--ease-glide)] ${
        open ? 'rotate-90' : ''
      }`}
    >
      ›
    </span>
  )
}

/**
 * A part of a card that is there when asked for: a heading that opens and
 * shuts what is under it.
 *
 * For the second zoom level of something a card already says. The
 * Dashboard's "Service readiness" is one number for the whole service; how
 * each team stands is the same question closer up, and wanted by fewer
 * people on fewer mornings. Shut, it is one line; the card says its
 * headline and the rest is a tap away.
 *
 * It remembers nothing: shut again the next time the card is drawn, unless
 * `defaultOpen` says otherwise.
 */
export function Fold({
  label,
  summary,
  defaultOpen = false,
  className = '',
  children,
}: {
  label: string
  /** A few words at the heading's end, read while it is shut: "6 teams". */
  summary?: ReactNode
  defaultOpen?: boolean
  className?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((was) => !was)}
        className="tap flex w-full items-center justify-between gap-3 border-t border-outline-variant pt-4 text-left"
      >
        <span className="font-mono text-eyebrow text-on-surface-variant">{label}</span>
        <span className="flex shrink-0 items-center gap-2.5">
          {summary && <span className="font-mono text-label-sm text-on-surface-faint">{summary}</span>}
          <Chevron open={open} />
        </span>
      </button>
      {open && (
        <div id={id} className="mt-4">
          {children}
        </div>
      )}
    </div>
  )
}

