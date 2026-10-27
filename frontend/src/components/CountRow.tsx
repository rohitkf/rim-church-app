/**
 * A short row of counts, each in its own box: a label over a number.
 *
 * The Teams page counts who is on a team this way, and Availability counts
 * how a team has answered, so the two read alike. Four boxes are two by
 * two on a phone — a fourth across would leave each too narrow for its
 * label — and one line from `sm` up.
 */
export interface Count {
  label: string
  value: number
  /** Text colour for the number while it is above nought — the colour its
   * segment of the bar beside it wears. Left grey at nought: a red 0 says
   * something is wrong when nothing is. */
  tone?: string
}

export function CountRow({ counts, label, className = 'mt-4' }: { counts: Count[]; label: string; className?: string }) {
  const columns = counts.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'
  return (
    <dl className={`grid gap-2 ${columns} ${className}`} aria-label={label}>
      {counts.map((c) => (
        <div key={c.label} className="min-w-0 rounded-[var(--radius-row)] bg-raised px-3 py-2 hairline">
          <dt className="truncate font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
            {c.label}
          </dt>
          <dd
            className={`text-body-lg font-medium tabular-nums ${c.tone && c.value > 0 ? c.tone : 'text-on-surface'}`}
          >
            {c.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
