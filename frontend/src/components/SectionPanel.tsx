import type { ComponentType, ReactNode } from 'react'

interface SectionPanelProps {
  title: string
  icon?: ComponentType<{ className?: string; width?: number; height?: number }>
  /** Right-hand side of the header strip: a count, a chip, an action. */
  aside?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * A titled panel: a tinted header strip carrying an icon and the panel's
 * name in small caps, then its content on the card surface.
 *
 * The strip is what makes a screenful of panels readable at a glance —
 * every section announces itself the same way, so the eye can skip to the
 * one it wants instead of reading headings that look like body text.
 */
export function SectionPanel({ title, icon: Icon, aside, children, className = '' }: SectionPanelProps) {
  return (
    <section
      className={`overflow-hidden rounded-lg border border-border-subtle bg-surface-lowest ${className}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border-subtle bg-surface-low px-4 py-2.5">
        <span className="flex items-center gap-2">
          {Icon && <Icon className="shrink-0 text-secondary" width={16} height={16} />}
          <span className="font-mono text-label-sm uppercase tracking-wide text-on-surface">
            {title}
          </span>
        </span>
        {aside}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

/** A status pill: "On track", "Online", "Waiting". */
export function StatusChip({
  tone = 'neutral',
  children,
}: {
  tone?: 'good' | 'warn' | 'bad' | 'neutral'
  children: ReactNode
}) {
  const tones = {
    good: 'bg-success/15 text-success',
    warn: 'bg-warning/15 text-warning',
    bad: 'bg-error/15 text-error',
    neutral: 'bg-surface-container text-on-surface-variant',
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-label-sm uppercase tracking-wide ${tones[tone]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  )
}
