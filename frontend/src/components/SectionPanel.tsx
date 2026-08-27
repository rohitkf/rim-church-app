import type { ComponentType, ReactNode } from 'react'
import { Panel } from './Surface'

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
/**
 * A titled panel. Kept as its own name because pages read better saying
 * what they mean, but the enclosure itself is the app's one card.
 */
export function SectionPanel({ title, icon, aside, children, className = '' }: SectionPanelProps) {
  return (
    <Panel title={title} icon={icon} aside={aside} className={className}>
      {children}
    </Panel>
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
    good: 'bg-success/12 text-success ring-success/20',
    warn: 'bg-warning/12 text-warning ring-warning/20',
    bad: 'bg-error/12 text-error ring-error/20',
    neutral: 'bg-surface-container text-on-surface-variant ring-black/5 dark:ring-white/10',
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] ring-1 ring-inset ${tones[tone]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  )
}
