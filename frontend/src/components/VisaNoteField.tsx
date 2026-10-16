/**
 * The free-text note under a visa status.
 *
 * For what a date cannot say: an application still being decided, a
 * renewal sent off. Any status can carry one. It lives here because the
 * Profile page and the first-time form ask it identically, and two copies
 * of a character limit are two limits.
 */
export const VISA_NOTE_MAX = 300

export function VisaNoteField({
  value,
  onChange,
  labelClassName = 'flex flex-col gap-1.5 text-body-sm text-on-surface-variant',
}: {
  value: string
  onChange: (next: string) => void
  labelClassName?: string
}) {
  return (
    <label className={labelClassName}>
      <span className="flex items-baseline justify-between gap-2">
        <span>
          Comment <span className="font-normal text-on-surface-faint">(optional)</span>
        </span>
        <span className="font-mono text-label-sm tabular text-on-surface-faint">
          {value.length}/{VISA_NOTE_MAX}
        </span>
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={VISA_NOTE_MAX}
        rows={3}
        placeholder="e.g. Applied for a Graduate visa on 3 October, waiting on a decision"
        className="w-full rounded-[var(--radius-chip)] bg-raised px-3 py-2 text-body-sm text-on-surface hairline placeholder:text-on-surface-faint focus:outline-none focus:ring-1 focus:ring-secondary"
      />
    </label>
  )
}
