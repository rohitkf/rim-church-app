import { type FormEvent, useState } from 'react'
import { ActionButton, Overlay } from './Surface'
import { DateTimeField } from './DateTimeFields'
import { deadlineWords } from '../lib/availabilityDeadline'

/**
 * When availability answers close for this service, said on its own page
 * — and, for whoever manages services, the way to give this one service a
 * deadline of its own (0310).
 *
 * The church has one rule for every service (Settings › Page by Page ›
 * Availability): the night before, or a number of hours before it begins.
 * That is what most services want. A conference that should close two
 * days ahead does not, and until now could not say so.
 *
 * It is said here because this is where the deadline is moved without
 * anybody meaning to: under "hours before the service", changing the first
 * session's time changes when answers close, and whoever does that should
 * see it happen.
 *
 * The database decides (`availability_closes_at()`): this shows the same
 * moment and saves `services.availability_closes_override`, or null for
 * the church's rule again.
 */

/** "YYYY-MM-DDTHH:MM" on this device's clock, which is what the date and time fields hold. */
function fieldValue(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`
}

export function AnswersCloseControl({
  closesAt,
  byRule,
  ruleWords,
  override,
  startsAt,
  now,
  canEdit,
  busy,
  error,
  onSave,
}: {
  /** When answers close for this service, as the database has it. */
  closesAt: Date
  /** When they would close by the church's rule alone. */
  byRule: Date
  /** The rule in words: "the night before", "6 hours before the service". */
  ruleWords: string
  /** This service's own deadline, if it has one. */
  override: string | null | undefined
  /** When the service begins, to say so if a deadline is put after it. */
  startsAt: string | null
  /** The page's clock, so "close" turns to "closed" as it passes without this asking the time while it draws. */
  now: number
  canEdit: boolean
  busy: boolean
  error: string | null
  onSave: (patch: { availability_closes_override: string | null }, done: () => void) => void
}) {
  const [open, setOpen] = useState(false)
  const [own, setOwn] = useState(false)
  const [when, setWhen] = useState('')
  const [asked, setAsked] = useState(false)
  const has = !!override
  const past = closesAt.getTime() <= now

  const start = () => {
    setOwn(has)
    setWhen(fieldValue(has ? closesAt : byRule))
    setAsked(false)
    setOpen(true)
  }
  const chosen = when ? new Date(when) : null
  const valid = !!chosen && Number.isFinite(chosen.getTime())
  const late = own && valid && !!startsAt && chosen!.getTime() > new Date(startsAt).getTime()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setAsked(true)
    if (own && !valid) return
    onSave({ availability_closes_override: own ? chosen!.toISOString() : null }, () => setOpen(false))
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
      <p className="text-label-md text-on-surface-variant">
        Availability answers {past ? 'closed' : 'close'} <span className="font-medium text-on-surface">{deadlineWords(closesAt)}</span>
        <span className="text-on-surface-faint"> · {has ? 'set for this service' : ruleWords}</span>
      </p>
      {canEdit && (
        <button type="button" onClick={start} className="tap rounded-full px-3 py-1.5 text-label-md text-on-surface-variant hairline hover:text-on-surface">
          Change
        </button>
      )}
      {open && (
        <Overlay label="When answers close for this service" align="sheet" onDismiss={() => setOpen(false)}>
          <form
            onSubmit={submit}
            noValidate
            className="w-full rounded-t-[var(--radius-card)] bg-surface-lowest p-6 shadow-[inset_0_0_0_1px_var(--color-outline-variant),var(--shadow-lifted)] sm:max-w-md sm:rounded-[var(--radius-card)]"
          >
            <h2 className="text-headline-md">When answers close</h2>
            <p className="mt-2 text-body-sm text-on-surface-variant">
              The deadline for saying whether you can serve at this service. After it only an Admin or the team’s head can change an answer.
            </p>
            <div role="radiogroup" aria-label="When answers close for this service" className="mt-4 flex flex-col gap-3">
              <label className="flex items-start gap-2.5 text-body-md text-on-surface">
                <input type="radio" name="answers-close" checked={!own} onChange={() => setOwn(false)} className="mt-1 accent-[var(--color-primary)]" />
                <span>
                  The church’s rule
                  <span className="block text-body-sm text-on-surface-variant">
                    {deadlineWords(byRule)} — {ruleWords}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2.5 text-body-md text-on-surface">
                <input type="radio" name="answers-close" checked={own} onChange={() => setOwn(true)} className="mt-1 accent-[var(--color-primary)]" />
                <span>
                  A time of its own
                  <span className="block text-body-sm text-on-surface-variant">For this service only. Every other service keeps the rule.</span>
                </span>
              </label>
            </div>
            {own && (
              <div className="mt-3">
                <DateTimeField value={when} onChange={setWhen} label="Answers close" clearable={false} />
                {asked && !valid && (
                  <p role="alert" className="mt-1.5 text-label-md text-error">
                    Choose the date and the time.
                  </p>
                )}
                {late && <p className="mt-1.5 text-label-md text-accent-orange-soft">That is after the service begins: answers would still be changing while it is on.</p>}
              </div>
            )}
            {error && (
              <p role="alert" className="mt-3 text-label-md text-error">
                {error}
              </p>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <ActionButton type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save'}
              </ActionButton>
              <ActionButton tone="ghost" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </ActionButton>
            </div>
          </form>
        </Overlay>
      )}
    </div>
  )
}
