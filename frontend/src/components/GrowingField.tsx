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
 *
 * A name cannot be nothing, so emptying the box puts back what it held. A
 * field that may be left empty says so (`allowEmpty`): a session's note is
 * taken off by clearing it, and that is committed as the empty string.
 */
export function GrowingField({
  value,
  onCommit,
  label,
  className = '',
  allowEmpty = false,
  placeholder,
  maxLength,
  autoFocus = false,
  onRest,
}: {
  /** Uncontrolled: this seeds the box and re-seeds it when the row changes. */
  value: string
  onCommit: (next: string) => void
  label: string
  className?: string
  /** Emptying the box is a change to commit, not a slip to put right. */
  allowEmpty?: boolean
  placeholder?: string
  maxLength?: number
  /** Put the cursor in it as it appears: for a box opened by a button. */
  autoFocus?: boolean
  /** Left with nothing to save: what was there is still there. */
  onRest?: () => void
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
      placeholder={placeholder}
      maxLength={maxLength}
      autoFocus={autoFocus}
      onInput={fit}
      onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
      onBlur={(e) => {
        const next = e.target.value.trim()
        if (next === value || (!next && !allowEmpty)) {
          e.target.value = value
          fit()
          onRest?.()
          return
        }
        onCommit(next)
      }}
      className={`block w-full resize-none overflow-hidden ${className}`}
    />
  )
}
