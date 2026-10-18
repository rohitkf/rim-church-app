import type { ReactNode } from 'react'
import { pageName, type Draft, type Patch, type SettingEntry as Entry } from '../lib/settingsCatalog'
import { shortDuration } from '../lib/settingsReadout'
import { NumberDial } from './NumberDial'
import { TimeField } from './DateTimeFields'
import { Select, selectPillClasses } from './Select'
import { InlineRow, SettingRow, Switch } from './SettingRows'

/**
 * One setting from the catalog, drawn as a row.
 *
 * A number opens to its dial; a switch, a short list or a time sits in
 * the row itself. The row says its value as a person would, marks itself
 * while it is changed and unsaved, and offers its default back — the
 * same in every room and on every page, because it is the same row.
 */

/**
 * A few zones to pick from without typing. Free text underneath, because
 * a list of the ones we thought of is a list somebody's church is missing
 * from — and the database checks the name against its own tz database
 * either way.
 */
const TIMEZONES = [
  'Europe/London',
  'Europe/Dublin',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Africa/Lagos',
  'Africa/Nairobi',
  'Australia/Sydney',
  'UTC',
]

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function SettingEntryRow({
  entry,
  draft,
  stored,
  set,
  open,
  onToggle,
}: {
  entry: Entry
  /** The room's working copy. */
  draft: Draft
  /** What is saved, for the "changed" mark. */
  stored: Draft
  set: (patch: Patch) => void
  /** Whether this row is the one open to its dial. */
  open: boolean
  onToggle: () => void
}) {
  if (entry.when && !entry.when(draft)) return null
  const affects = entry.affects.map(pageName)
  const changed = !same(entry.get(draft), entry.get(stored))

  if (entry.kind === 'dial') {
    const value = entry.get(draft)
    const said = (n: number) => (entry.unit === 'notifications' ? `${n} newest` : shortDuration(n, entry.unit))
    return (
      <SettingRow
        label={entry.label}
        summary={entry.summary}
        value={said(value)}
        changed={changed}
        open={open}
        onToggle={onToggle}
        help={entry.help}
        affects={affects}
        defaultText={said(entry.fallback)}
        onDefault={value === entry.fallback ? undefined : () => set(entry.put(draft, entry.fallback))}
      >
        {/* A window of days is a length, and a length is easier to judge
            against its neighbours than to type into a box: 7 with 14 and
            30 in view is a decision, 7 alone is a guess. */}
        <NumberDial
          value={value}
          onChange={(next) => set(entry.put(draft, next))}
          min={entry.min}
          max={entry.dialMax ?? entry.max}
          step={entry.dialStep ?? 1}
          majorEvery={entry.majorEvery ?? 5}
          unit={entry.unit}
          label={entry.label}
        />
      </SettingRow>
    )
  }

  if (entry.kind === 'forever') {
    const value = entry.get(draft)
    const said = (n: number | null) => (n === null ? 'For ever' : shortDuration(n, 'days'))
    return (
      <SettingRow
        label={entry.label}
        summary={entry.summary}
        value={said(value)}
        changed={changed}
        open={open}
        onToggle={onToggle}
        help={entry.help}
        affects={affects}
        defaultText={entry.fallback === null ? 'for ever' : shortDuration(entry.fallback, 'days')}
        onDefault={value === entry.fallback ? undefined : () => set(entry.put(draft, entry.fallback))}
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 text-body-sm text-on-surface">
            <span>Keep for ever</span>
            <Switch
              checked={value === null}
              onChange={(forever) => set(entry.put(draft, forever ? null : (entry.fallback ?? 90)))}
              label={`Keep for ever: ${entry.label}`}
            />
          </div>
          {value !== null && (
            <NumberDial
              value={value}
              onChange={(n) => set(entry.put(draft, n))}
              min={1}
              max={365}
              majorEvery={7}
              unit="days"
              label={entry.label}
            />
          )}
        </div>
      </SettingRow>
    )
  }

  if (entry.kind === 'switch') {
    const control = (
      <Switch
        checked={entry.get(draft)}
        onChange={(on) => set(entry.put(draft, on))}
        label={entry.controlLabel ?? entry.label}
      />
    )
    if (entry.compact) {
      return (
        <li className="flex items-center gap-3 rounded-[var(--radius-row)] px-3 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block text-body-sm text-on-surface">
              {entry.label}
              {changed && (
                <span
                  title="Changed, not saved yet"
                  aria-label="Changed, not saved yet"
                  className="ml-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-accent-orange align-middle"
                />
              )}
            </span>
            <span className="block text-label-md text-on-surface-variant">{entry.summary}</span>
          </span>
          {control}
        </li>
      )
    }
    return (
      <InlineRow
        label={entry.label}
        summary={entry.summary}
        changed={changed}
        help={entry.help}
        affects={affects}
        defaultText={entry.fallback ? 'on' : 'off'}
      >
        {control}
      </InlineRow>
    )
  }

  if (entry.kind === 'choice') {
    const value = entry.get(draft)
    const labelOf = (v: string) => entry.options.find((o) => o.value === v)?.label ?? v
    const control: ReactNode =
      entry.style === 'segmented' ? (
        <Segmented label={entry.ariaLabel} value={value} options={entry.options} onChange={(v) => set(entry.put(draft, v))} />
      ) : (
        <Select
          value={value}
          onChange={(v) => set(entry.put(draft, v))}
          aria-label={entry.ariaLabel}
          className={selectPillClasses}
          options={entry.options}
        />
      )
    return (
      <InlineRow
        label={entry.label}
        summary={entry.summary}
        changed={changed}
        help={entry.help}
        affects={affects}
        defaultText={entry.fallbackText ?? labelOf(entry.fallback)}
      >
        {control}
      </InlineRow>
    )
  }

  if (entry.kind === 'time') {
    return (
      <InlineRow
        label={entry.label}
        summary={entry.summary}
        changed={changed}
        help={entry.help}
        affects={affects}
        defaultText={entry.fallback}
      >
        <TimeField
          value={entry.get(draft)}
          onChange={(t) => t && set(entry.put(draft, t))}
          label={entry.ariaLabel}
          aria-label={entry.ariaLabel}
          minuteStep={1}
          className="inline-flex items-center gap-2 rounded-full bg-raised px-3 py-1.5 font-mono text-body-sm text-on-surface hairline focus:outline-none focus:ring-1 focus:ring-secondary"
        />
      </InlineRow>
    )
  }

  // A timezone: typed, with a few to pick from.
  return (
    <InlineRow
      label={entry.label}
      summary={entry.summary}
      changed={changed}
      help={entry.help}
      affects={affects}
      defaultText={entry.fallback}
    >
      <input
        type="text"
        value={entry.get(draft)}
        onChange={(e) => set(entry.put(draft, e.target.value))}
        aria-label="Church timezone"
        list="church-timezones"
        className="w-44 rounded-full bg-raised px-3 py-1.5 font-mono text-body-sm text-on-surface hairline focus:outline-none focus:ring-1 focus:ring-secondary"
      />
      <datalist id="church-timezones">
        {TIMEZONES.map((zone) => (
          <option key={zone} value={zone} />
        ))}
      </datalist>
    </InlineRow>
  )
}

/** A short list of choices drawn as pills, for a choice with three or four. */
export function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: ReactNode }[]
  onChange: (value: string) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-full bg-inset p-1 hairline">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`tap min-w-9 rounded-full px-3 py-1.5 text-label-md transition-colors duration-300 ${
            value === o.value ? 'bg-primary font-medium text-on-primary' : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * A stack of catalog rows, one open at a time, for a room or a page.
 * `set` takes a patch of columns, as the entries write them.
 */
export function SettingEntries({
  entries,
  draft,
  stored,
  set,
  open,
  onToggle,
}: {
  entries: readonly Entry[]
  draft: Draft
  stored: Draft
  set: (patch: Patch) => void
  open: string | null
  onToggle: (id: string) => void
}) {
  return (
    <>
      {entries.map((entry) => (
        <SettingEntryRow
          key={entry.id}
          entry={entry}
          draft={draft}
          stored={stored}
          set={set}
          open={open === entry.id}
          onToggle={() => onToggle(entry.id)}
        />
      ))}
    </>
  )
}
