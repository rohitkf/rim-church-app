import { timeLeft, useNow } from '../lib/timeLeft'

/**
 * "Registration closes in 2 days 04 : 12 : 05", ticking. Says `over` once
 * the moment has passed (or nothing, if there is no `over`).
 */
export function Countdown({ to, lead, over, tone = 'blue' }: { to: string; lead: string; over?: string; tone?: 'blue' | 'orange' }) {
  const now = useNow()
  const left = timeLeft(to, now)
  if (!left) return over ? <p className="text-body-sm text-on-surface-variant">{over}</p> : null
  const pad = (n: number) => String(n).padStart(2, '0')
  const urgent = left.days === 0 && left.hours < 24
  const colour = tone === 'orange' || urgent ? 'text-accent-orange-soft' : 'text-accent-blue-soft'
  const units: [number, string][] = [
    [left.days, left.days === 1 ? 'day' : 'days'],
    [left.hours, 'hrs'],
    [left.minutes, 'min'],
    [left.seconds, 'sec'],
  ]
  const shown = left.days > 0 ? units : units.slice(1)
  const spoken = `${lead} ${shown.map(([n, u]) => `${n} ${u}`).join(' ')}`
  return (
    <div role="timer" aria-label={spoken} className="rounded-[var(--radius-card)] bg-surface-lowest px-4 py-3 hairline">
      <p className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">{lead}</p>
      <div aria-hidden="true" className={`mt-1 flex items-baseline gap-3 ${colour}`}>
        {shown.map(([n, u], i) => (
          <span key={u} className="flex items-baseline gap-1">
            <span className="text-headline-md font-semibold tabular">{i === 0 && left.days > 0 ? n : pad(n)}</span>
            <span className="font-mono text-label-sm text-on-surface-faint">{u}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
