import { useEffect, useMemo, useRef, useState } from 'react'
import { monthGrid, todayIso } from '../lib/monthGrid'
import { Overlay, fieldTriggerClasses, inputClasses } from './Surface'
import { Select } from './Select'
import { formatDateValue, formatTimeValue } from '../lib/dateTimeFormat'

/*
 * Date and time fields, drawn by the app.
 *
 * `<input type="date">` and `type="time"` hand the choosing to the phone:
 * a grey spinning wheel on Android, a different sheet on iOS, a third
 * popup on a laptop — none of them this app, and the wheel is the worst
 * way there is to reach a birthday forty years back. These are a button
 * that says the value in words and opens the app's own sheet: a calendar
 * with the month and year one tap away, or two columns of hours and
 * minutes.
 *
 * Values stay in the shape the native inputs used ("YYYY-MM-DD",
 * "HH:MM"), so everything that stores or compares them is unchanged.
 */

const MONTHS = Array.from({ length: 12 }, (_, m) =>
  new Date(2000, m, 1).toLocaleDateString(undefined, { month: 'long' }),
)


function pad(n: number) {
  return String(n).padStart(2, '0')
}


function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

/** The field itself: the value in words, and a button to change it. */
function Trigger({
  id,
  ariaLabel,
  text,
  placeholder,
  icon,
  onOpen,
  disabled,
  className,
}: {
  id?: string
  ariaLabel?: string
  text: string | null
  placeholder: string
  icon: React.ReactNode
  onOpen: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      id={id}
      aria-label={ariaLabel}
      aria-haspopup="dialog"
      disabled={disabled}
      onClick={onOpen}
      className={className ?? fieldTriggerClasses}
    >
      <span className={`min-w-0 truncate ${text ? 'text-on-surface' : 'text-on-surface-faint'}`}>
        {text ?? placeholder}
      </span>
      <span className="text-on-surface-faint">{icon}</span>
    </button>
  )
}

function Sheet({
  label,
  onDismiss,
  children,
}: {
  label: string
  onDismiss: () => void
  children: React.ReactNode
}) {
  return (
    <Overlay label={label} onDismiss={onDismiss} align="sheet">
      <div className="w-full max-w-sm rounded-t-[var(--radius-card)] bg-surface-lowest p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[var(--shadow-lifted)] sm:rounded-[var(--radius-card)] sm:pb-4">
        <p className="mb-3 font-mono text-label-sm uppercase tracking-[0.12em] text-on-surface-variant">{label}</p>
        {children}
      </div>
    </Overlay>
  )
}

/* ------------------------------------------------------------------ *
 * A date
 * ------------------------------------------------------------------ */

export function DateField({
  value,
  onChange,
  label = 'Choose a date',
  placeholder = 'Choose a date',
  min,
  max,
  clearable = false,
  id,
  'aria-label': ariaLabel,
  disabled,
  className,
}: {
  /** "YYYY-MM-DD", or "" for none. */
  value: string
  onChange: (next: string) => void
  /** Said at the top of the sheet. */
  label?: string
  placeholder?: string
  min?: string
  max?: string
  /** Offer "No date" — for a field that may be left empty. */
  clearable?: boolean
  id?: string
  'aria-label'?: string
  disabled?: boolean
  /** Replaces the trigger's classes, for a compact inline field. */
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Trigger
        id={id}
        ariaLabel={ariaLabel ?? label}
        text={value ? formatDateValue(value) : null}
        placeholder={placeholder}
        icon={<CalendarIcon />}
        onOpen={() => setOpen(true)}
        disabled={disabled}
        className={className}
      />
      {open && (
        <Sheet label={label} onDismiss={() => setOpen(false)}>
          <Calendar
            value={value}
            min={min}
            max={max}
            onPick={(iso) => {
              onChange(iso)
              setOpen(false)
            }}
          />
          <div className="mt-3 flex flex-wrap justify-between gap-2">
            {clearable && value ? (
              <button
                type="button"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
                className="tap rounded-full px-3 py-1.5 text-label-md text-on-surface-variant hairline hover:text-error"
              >
                No date
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="tap rounded-full px-4 py-1.5 text-label-md text-on-surface hairline"
            >
              Cancel
            </button>
          </div>
        </Sheet>
      )}
    </>
  )
}

function Calendar({
  value,
  min,
  max,
  onPick,
}: {
  value: string
  min?: string
  max?: string
  onPick: (iso: string) => void
}) {
  const today = todayIso()
  const anchor = value || (max && max < today ? max : today)
  const [cursor, setCursor] = useState(() => ({
    year: Number(anchor.slice(0, 4)),
    month: Number(anchor.slice(5, 7)) - 1,
  }))
  const weeks = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor])
  const shift = (delta: number) =>
    setCursor(({ year, month }) => {
      const at = new Date(year, month + delta, 1)
      return { year: at.getFullYear(), month: at.getMonth() }
    })

  // Years reachable in one tap: from the earliest allowed (or a hundred
  // years back, for birthdays) to the latest (or five years on).
  const thisYear = new Date().getFullYear()
  const firstYear = min ? Number(min.slice(0, 4)) : thisYear - 100
  const lastYear = max ? Number(max.slice(0, 4)) : thisYear + 5
  const years = []
  for (let y = lastYear; y >= firstYear; y--) years.push({ value: String(y), label: String(y) })

  const outOfRange = (iso: string) => (!!min && iso < min) || (!!max && iso > max)

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="Previous month"
          className="tap flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-raised-strong"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <div className="grid min-w-0 flex-1 grid-cols-[1fr_auto] gap-1.5">
          <Select
            aria-label="Month"
            value={String(cursor.month)}
            onChange={(m) => setCursor((c) => ({ ...c, month: Number(m) }))}
            options={MONTHS.map((name, m) => ({ value: String(m), label: name }))}
          />
          <Select
            aria-label="Year"
            value={String(cursor.year)}
            onChange={(y) => setCursor((c) => ({ ...c, year: Number(y) }))}
            options={years}
          />
        </div>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="Next month"
          className="tap flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-raised-strong"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-0.5 font-mono text-label-sm text-on-surface-faint">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
          <div key={d} className="py-1 text-center">
            {d}
          </div>
        ))}
      </div>
      <div role="grid" aria-label="Days" className="grid grid-cols-7 gap-y-0.5">
        {weeks.flat().map((cell) => {
          const chosen = cell.iso === value
          const blocked = outOfRange(cell.iso)
          return (
            <button
              key={cell.iso}
              type="button"
              role="gridcell"
              aria-label={cell.iso}
              aria-pressed={chosen}
              disabled={blocked}
              onClick={() => onPick(cell.iso)}
              className={`h-10 rounded-[var(--radius-chip)] text-body-sm transition-colors ${
                chosen
                  ? 'bg-primary font-semibold text-on-primary'
                  : blocked
                    ? 'text-on-surface-faint opacity-40'
                    : cell.inMonth
                      ? 'text-on-surface hover:bg-raised-strong'
                      : 'text-on-surface-faint hover:bg-raised'
              } ${cell.iso === today && !chosen ? 'ring-1 ring-secondary/60' : ''}`}
            >
              {cell.day}
            </button>
          )
        })}
      </div>
      {!outOfRange(today) && (
        <button
          type="button"
          onClick={() => onPick(today)}
          className="tap mt-2 rounded-full px-3 py-1.5 text-label-md text-secondary hover:underline"
        >
          Today
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * A time
 * ------------------------------------------------------------------ */

export function TimeField({
  value,
  onChange,
  label = 'Choose a time',
  placeholder = 'Choose a time',
  minuteStep = 5,
  clearable = false,
  id,
  'aria-label': ariaLabel,
  disabled,
  className,
}: {
  /** "HH:MM", or "" for none. */
  value: string
  onChange: (next: string) => void
  label?: string
  placeholder?: string
  /** How finely the minute column steps; the current minute is always offered. */
  minuteStep?: number
  clearable?: boolean
  id?: string
  'aria-label'?: string
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Trigger
        id={id}
        ariaLabel={ariaLabel ?? label}
        text={value ? formatTimeValue(value.slice(0, 5)) : null}
        placeholder={placeholder}
        icon={<ClockIcon />}
        onOpen={() => setOpen(true)}
        disabled={disabled}
        className={className}
      />
      {open && (
        <Sheet label={label} onDismiss={() => setOpen(false)}>
          <TimeColumns
            value={value.slice(0, 5)}
            minuteStep={minuteStep}
            onDone={(hhmm) => {
              onChange(hhmm)
              setOpen(false)
            }}
            onClear={
              clearable && value
                ? () => {
                    onChange('')
                    setOpen(false)
                  }
                : undefined
            }
            onCancel={() => setOpen(false)}
          />
        </Sheet>
      )}
    </>
  )
}

function TimeColumns({
  value,
  minuteStep,
  onDone,
  onClear,
  onCancel,
}: {
  value: string
  minuteStep: number
  onDone: (hhmm: string) => void
  onClear?: () => void
  onCancel: () => void
}) {
  const [h0, m0] = value ? value.split(':').map(Number) : [9, 0]
  const [hour, setHour] = useState(h0)
  const [minute, setMinute] = useState(m0)

  const minutes = useMemo(() => {
    const list = new Set<number>()
    for (let m = 0; m < 60; m += Math.max(1, minuteStep)) list.add(m)
    list.add(m0)
    return [...list].sort((a, b) => a - b)
  }, [minuteStep, m0])

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <Column label="Hour" items={Array.from({ length: 24 }, (_, i) => i)} value={hour} onPick={setHour} />
        <Column label="Minute" items={minutes} value={minute} onPick={setMinute} />
      </div>
      <p className="mt-3 text-center font-mono text-headline-md tabular text-on-surface">
        {formatTimeValue(`${pad(hour)}:${pad(minute)}`)}
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="tap rounded-full px-3 py-1.5 text-label-md text-on-surface-variant hairline hover:text-error"
          >
            No time
          </button>
        ) : (
          <span />
        )}
        <span className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="tap rounded-full px-4 py-1.5 text-label-md text-on-surface hairline"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onDone(`${pad(hour)}:${pad(minute)}`)}
            className="tap rounded-full bg-primary px-4 py-1.5 text-label-md font-medium text-on-primary"
          >
            Done
          </button>
        </span>
      </div>
    </div>
  )
}

function Column({
  label,
  items,
  value,
  onPick,
}: {
  label: string
  items: number[]
  value: number
  onPick: (n: number) => void
}) {
  const list = useRef<HTMLDivElement>(null)
  // Open on the chosen one rather than at midnight.
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'center' })
  }, [])
  return (
    <div>
      <p className="mb-1 text-center font-mono text-label-sm uppercase tracking-[0.12em] text-on-surface-faint">{label}</p>
      <div
        ref={list}
        role="listbox"
        aria-label={label}
        className="h-48 overflow-y-auto overscroll-contain rounded-[var(--radius-chip)] bg-inset p-1"
      >
        {items.map((n) => (
          <button
            key={n}
            type="button"
            role="option"
            aria-selected={n === value}
            onClick={() => onPick(n)}
            className={`block w-full rounded-[var(--radius-chip)] py-2 text-center font-mono text-body-md tabular transition-colors ${
              n === value ? 'bg-primary font-semibold text-on-primary' : 'text-on-surface hover:bg-raised-strong'
            }`}
          >
            {pad(n)}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * A date and a time together
 * ------------------------------------------------------------------ */

/** "YYYY-MM-DDTHH:MM" (what datetime-local produced), or "". */
export function DateTimeField({
  value,
  onChange,
  label = 'Choose when',
  clearable = true,
  min,
}: {
  value: string
  onChange: (next: string) => void
  label?: string
  clearable?: boolean
  min?: string
}) {
  const date = value.slice(0, 10)
  const time = value.slice(11, 16)
  return (
    <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
      <DateField
        value={date}
        min={min}
        placeholder="Date"
        label={`${label} — date`}
        aria-label={`${label}, date`}
        clearable={clearable}
        onChange={(d) => onChange(d ? `${d}T${time || '23:59'}` : '')}
      />
      <TimeField
        value={time}
        placeholder="Time"
        label={`${label} — time`}
        aria-label={`${label}, time`}
        disabled={!date}
        onChange={(t) => onChange(date ? `${date}T${t}` : '')}
        className={`${inputClasses} flex items-center justify-between gap-2 disabled:opacity-50`}
      />
    </div>
  )
}
