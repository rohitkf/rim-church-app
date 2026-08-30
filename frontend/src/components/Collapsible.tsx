import { useState } from 'react'

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
