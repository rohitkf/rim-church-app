import type { ComponentType, ReactNode } from 'react'
import { Panel, Pill, type PillTone } from './Surface'

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

/**
 * A status pill: "On track", "Online", "Waiting".
 *
 * Delegates to Pill so there is exactly one status pill in the app; this
 * name survives because pages read better saying what they mean.
 */
export function StatusChip({
  tone = 'neutral',
  children,
}: {
  tone?: 'good' | 'warn' | 'bad' | 'neutral'
  children: ReactNode
}) {
  const tones: Record<string, PillTone> = {
    good: 'green',
    warn: 'orange',
    bad: 'red',
    neutral: 'neutral',
  }
  return (
    <Pill tone={tones[tone]} dot>
      {children}
    </Pill>
  )
}
