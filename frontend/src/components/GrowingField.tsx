import { useLayoutEffect, useRef, type KeyboardEvent } from 'react'

/**
 * A single-value text field that grows instead of scrolling.
 *
 * An `<input>` holding a name longer than its box does not say so: it just
 * scrolls the rest out of sight, with no ellipsis and nothing to click. On a
 * phone that is how "Welcome, Notices & Church Family News" became "Welcome,
 * Notices & Chu" and a service called "Sunday Morning Celebration &
 * Communion" lost its last two words.
 *
 * A textarea sized to its own content wraps and shows all of it. It is still
 * one value, not a paragraph, so Enter commits rather than adding a line —
 * which is what the input it replaces did.
 */
export function GrowingField({
  value,
  onCommit,
  label,
  className = '',
}: {
  /** Uncontrolled: this seeds the box and re-seeds it when the row changes. */
  value: string
  onCommit: (next: string) => void
  label: string
  className?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const fit = () => {
    const el = ref.current
    if (!el) return
    // Back to nothing first, or it can only ever grow.
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  useLayoutEffect(fit, [value])

  return (
    <textarea
      ref={ref}
      rows={1}
      defaultValue={value}
      aria-label={label}
      onInput={fit}
      onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
      onBlur={(e) => {
        const next = e.target.value.trim()
        if (!next || next === value) {
          e.target.value = value
          fit()
          return
        }
        onCommit(next)
      }}
      className={`block w-full resize-none overflow-hidden ${className}`}
    />
  )
}
