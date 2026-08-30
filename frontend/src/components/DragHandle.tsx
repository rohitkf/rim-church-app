import type { ComponentProps } from 'react'

/**
 * The grip that says a row can be moved, and the only place a drag starts.
 *
 * Dragging from anywhere on the row would fight every button, field and
 * link inside it — and on a phone it would fight the scroll. A grip is a
 * small promise: hold here, and nothing else on this row will misread it.
 */
export function DragHandle({
  label,
  className = '',
  ...props
}: { label: string } & ComponentProps<'button'>) {
  return (
    <button
      type="button"
      aria-label={`Reorder ${label}. Hold to drag, or use the arrow keys.`}
      className={`tap-square shrink-0 cursor-grab select-none rounded-[var(--radius-chip)] px-1.5 text-on-surface-faint hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary active:cursor-grabbing ${className}`}
      {...props}
    >
      {/* Two columns of dots: the grip every list on every platform uses,
          which is why it needs no label to be understood. */}
      <span aria-hidden="true" className="text-body-md leading-none tracking-[-0.15em]">
        ⠿
      </span>
    </button>
  )
}
