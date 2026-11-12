import { useState } from 'react'
import { arrivalWords } from '../lib/arrivalWords'
import { CHART_EARLY_MIN, CHART_LATE_MIN, barExtent, type Arrival } from '../lib/clockInPunctuality'

/**
 * One person's clock-ins over the weeks kept, each held against the call
 * time it was for (0280).
 *
 * The question is "above or below a line": was this arrival before the
 * call or after it, and by how much. So it is a bar a clock-in, growing
 * up from the call-time line when it came after and down when it came
 * before, oldest on the left. A second line marks where late begins. Two
 * colours for two states — on time, late — and the state is never colour
 * alone: the legend names both, the readout says "late" in words, and the
 * list under the chart has every figure.
 *
 * The scale stops at two hours after and one hour before. A bar that
 * would pass it stops at the edge with a notch near its end, the mark of
 * a bar cut short, so one four-hour morning does not flatten every other
 * bar into the line; its real figure is in the readout and the list.
 *
 * It is drawn in HTML, not SVG: the columns flex, so it fits a phone and
 * a desktop without a number in it, and each bar is a button — hovered,
 * focused or tapped, it puts that day in the readout underneath, which
 * works under a thumb where a floating tooltip does not.
 */

const SPAN = CHART_EARLY_MIN + CHART_LATE_MIN
/** Where the call-time line sits, from the top of the plot. */
const CALL_LINE = (CHART_LATE_MIN / SPAN) * 100

const shortDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })

function Bar({ arrival, mini = false }: { arrival: Arrival; mini?: boolean }) {
  if (arrival.minutes === null) {
    // No call time to hold it against: a ring on the line. They clocked in; that is all that is known.
    return (
      <span
        className={`absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-on-surface-faint ${mini ? 'h-1.5 w-1.5 border' : 'h-2 w-2'}`}
        style={{ top: `${CALL_LINE}%` }}
      />
    )
  }
  const { share, over } = barExtent(arrival.minutes)
  const up = arrival.minutes >= 0
  const height = `max(2px, ${Math.abs(share) * 100}%)`
  const color = arrival.late ? 'bg-accent-red' : 'bg-accent-blue'
  return (
    <span
      className={`absolute left-1/2 w-full -translate-x-1/2 ${mini ? 'max-w-[6px]' : 'max-w-[24px]'} ${color} ${
        up ? (mini ? 'rounded-t-[2px]' : 'rounded-t-[4px]') : mini ? 'rounded-b-[2px]' : 'rounded-b-[4px]'
      }`}
      style={up ? { bottom: `${100 - CALL_LINE}%`, height } : { top: `${CALL_LINE}%`, height }}
    >
      {/* Cut short at the edge of the scale: a notch in the surface colour near the end. */}
      {over && !mini && (
        <span className={`absolute inset-x-0 h-[2px] bg-surface-lowest ${up ? 'top-[5px]' : 'bottom-[5px]'}`} />
      )}
    </span>
  )
}

/** The same bars with nothing round them, for a row in a list: the words beside it carry the figures. */
export function ArrivalStrip({ arrivals }: { arrivals: readonly Arrival[] }) {
  // The newest that fit: a strip is a glance at how it has gone lately.
  const shown = arrivals.slice(-14)
  return (
    <span aria-hidden="true" className="relative flex h-7 w-[92px] shrink-0 items-stretch justify-end gap-[2px]">
      <span className="absolute inset-x-0 h-px bg-outline-variant" style={{ top: `${CALL_LINE}%` }} />
      {shown.map((a) => (
        <span key={`${a.on_date}-${a.clocked_at}`} className="relative w-[6px] shrink-0">
          <Bar arrival={a} mini />
        </span>
      ))}
    </span>
  )
}

export function ArrivalChart({
  arrivals,
  lateAfter,
  timeZone,
  name,
}: {
  arrivals: readonly Arrival[]
  lateAfter: number
  timeZone: string
  name: string
}) {
  const [picked, setPicked] = useState<number | null>(null)
  const few = arrivals.length <= 8
  const anyUnknown = arrivals.some((a) => a.minutes === null)
  const lateLine = ((CHART_LATE_MIN - Math.min(lateAfter, CHART_LATE_MIN)) / SPAN) * 100
  // The scale's own marks are at the call, +1 h and +2 h; a quarter of an hour is a line of text apart.
  const lateLabelFits = [0, 60, CHART_LATE_MIN].every((mark) => Math.abs(lateAfter - mark) >= 15)
  const shownIndex = picked ?? arrivals.length - 1
  const shown = arrivals[shownIndex]

  return (
    <figure className="rounded-[var(--radius-row)] bg-surface-lowest p-3 hairline sm:p-4" aria-label={`${name}: clock-ins against call time`}>
      <div className="flex gap-2">
        {/* The scale: minutes after the call, upward. */}
        <div aria-hidden="true" className="relative h-36 w-9 shrink-0 font-mono text-label-sm tabular-nums text-on-surface-faint">
          <span className="absolute right-0 top-0 -translate-y-1/2">+2 h</span>
          <span className="absolute right-0 -translate-y-1/2" style={{ top: `${(60 / SPAN) * 100}%` }}>
            +1 h
          </span>
          <span className="absolute right-0 -translate-y-1/2 text-on-surface-variant" style={{ top: `${CALL_LINE}%` }}>
            Call
          </span>
          {/* Where late begins, named on the scale unless it would sit on another mark; the legend says it either way. */}
          {lateLabelFits && (
            <span className="absolute right-0 -translate-y-1/2 text-on-surface-variant" style={{ top: `${lateLine}%` }}>
              Late
            </span>
          )}
          <span className="absolute bottom-0 right-0 translate-y-1/2">−1 h</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative h-36">
            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-border-subtle" />
            <span aria-hidden="true" className="absolute inset-x-0 h-px bg-border-subtle" style={{ top: `${(60 / SPAN) * 100}%` }} />
            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px bg-border-subtle" />
            {/* Where late begins. */}
            <span aria-hidden="true" className="absolute inset-x-0 h-px bg-accent-red/50" style={{ top: `${lateLine}%` }} />
            {/* The call time: the line everything is measured from. */}
            <span aria-hidden="true" className="absolute inset-x-0 h-px bg-on-surface-faint" style={{ top: `${CALL_LINE}%` }} />

            <div className={`absolute inset-0 flex items-stretch ${few ? 'justify-start gap-3' : 'gap-[2px]'}`}>
              {arrivals.map((a, i) => (
                <button
                  key={`${a.on_date}-${a.clocked_at}`}
                  type="button"
                  aria-label={arrivalWords(a, timeZone)}
                  aria-pressed={picked === i}
                  onMouseEnter={() => setPicked(i)}
                  onFocus={() => setPicked(i)}
                  onClick={() => setPicked(i)}
                  className={`relative min-w-[6px] rounded-[4px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-secondary ${
                    few ? 'w-7 shrink-0' : 'max-w-[28px] flex-1'
                  } ${shownIndex === i ? 'bg-raised-strong' : 'hover:bg-raised'}`}
                >
                  <Bar arrival={a} />
                </button>
              ))}
            </div>
          </div>

          {/* The days: every one when there are few, the first and last when there are many. */}
          <div aria-hidden="true" className="mt-1.5 font-mono text-label-sm text-on-surface-faint">
            {few ? (
              <div className="flex gap-3">
                {arrivals.map((a) => (
                  <span key={`${a.on_date}-${a.clocked_at}`} className="w-7 shrink-0 whitespace-nowrap text-center">
                    {new Date(`${a.on_date}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', timeZone: 'UTC' })}
                    <span className="block text-[0.85em] leading-none">
                      {new Date(`${a.on_date}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' })}
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <div className="flex justify-between">
                <span>{shortDay(arrivals[0].on_date)}</span>
                <span>{shortDay(arrivals[arrivals.length - 1].on_date)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* The day under the pointer, the finger or the focus; the latest until one is picked. */}
      {shown && (
        <p aria-live="polite" className="mt-3 flex items-baseline gap-2 text-body-sm text-on-surface">
          <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 rounded-[2px] ${shown.minutes === null ? 'border border-on-surface-faint' : shown.late ? 'bg-accent-red' : 'bg-accent-blue'}`} />
          <span className="min-w-0 [overflow-wrap:anywhere]">{arrivalWords(shown, timeZone)}</span>
        </p>
      )}

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-label-md text-on-surface-variant">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2 w-2 rounded-[2px] bg-accent-blue" />
          On time
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2 w-2 rounded-[2px] bg-accent-red" />
          Late: {lateAfter} min or more after call
        </span>
        {anyUnknown && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2 w-2 rounded-full border border-on-surface-faint" />
            Call time not known
          </span>
        )}
      </figcaption>
    </figure>
  )
}
