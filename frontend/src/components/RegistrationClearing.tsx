import { Countdown } from './Countdown'
import { useAppSettings } from '../lib/appSettings'
import { useNow } from '../lib/timeLeft'
import { clearingDay, clearingLine, clearingOf } from '../lib/registrationClearing'

/**
 * When a finished event's registrations lose people's details (the
 * Owner's ask, November 2026: a countdown, to know how long is left).
 *
 * Nothing deletes an event on its own, and neither of these says it does.
 * What the nightly job takes is the names, emails and phone numbers on
 * its registrations; the orders and the sums stay until somebody deletes
 * the event. So the words are "names and contact details removed", and
 * the page that has room for it says to export first.
 */

/** One line on an event's card on the Registrations page. */
export function ClearingLine({
  lastEndsAt,
  anonymised,
  now,
}: {
  lastEndsAt: string | null
  anonymised: boolean
  /** The page's own clock, so every card turns over together. */
  now: Date
}) {
  const settings = useAppSettings()
  const clearing = clearingOf({ lastEndsAt, keepDays: settings.registration_retention_days, anonymised, now })
  const line = clearingLine(clearing, now)
  if (!clearing || !line) return null
  const counting = clearing.state === 'counting'
  return (
    <p
      role={counting ? 'timer' : undefined}
      className={`mt-2 text-body-sm tabular ${clearing.state === 'cleared' ? 'text-on-surface-faint' : 'text-accent-orange-soft'}`}
    >
      {line}
    </p>
  )
}

/** The same, with room to say what goes and what stays: on the event's own page. */
export function ClearingNotice({ lastEndsAt, anonymised }: { lastEndsAt: string | null; anonymised: boolean }) {
  const settings = useAppSettings()
  // Once a minute is enough to move from one state to the next; the countdown ticks by itself.
  const now = useNow(true, 60_000)
  const clearing = clearingOf({ lastEndsAt, keepDays: settings.registration_retention_days, anonymised, now })
  if (!clearing) return null
  const stays = 'The orders, their ticket codes and the sums stay, and so does the event, until somebody deletes it.'
  return (
    <section aria-label="When people’s details are removed" className="mb-4 flex flex-col gap-2">
      {clearing.state === 'counting' && (
        <>
          <Countdown to={clearing.at.toISOString()} lead="Names and contact details are removed in" tone="orange" />
          <p className="text-body-sm text-on-surface-variant">
            Overnight on {clearingDay(clearing.at)}, the names, emails and phone numbers of everybody registered are
            removed, with the receipts they sent and their messages. {stays} Export to Excel before then if you need
            the names. How long they are kept is “Registration details are kept for” in Settings.
          </p>
        </>
      )}
      {clearing.state === 'due' && (
        <p className="rounded-[var(--radius-card)] bg-surface-lowest px-4 py-3 text-body-sm text-on-surface hairline">
          <span className="font-medium text-accent-orange-soft">Names and contact details are removed tonight.</span>{' '}
          {stays} Export to Excel now if you need the names.
        </p>
      )}
      {clearing.state === 'cleared' && (
        <p className="rounded-[var(--radius-card)] bg-surface-lowest px-4 py-3 text-body-sm text-on-surface-variant hairline">
          <span className="font-medium text-on-surface">Names and contact details have been removed</span> from this
          event’s registrations, as the church’s setting says. {stays}
        </p>
      )}
      {clearing.state === 'kept' && (
        <p className="rounded-[var(--radius-card)] bg-surface-lowest px-4 py-3 text-body-sm text-on-surface-variant hairline">
          This event has finished. Names and contact details are kept until the event is deleted: nothing removes
          them on its own (“Registration details are kept for” in Settings).
        </p>
      )}
    </section>
  )
}
