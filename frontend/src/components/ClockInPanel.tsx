import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { useAppSettings } from '../lib/appSettings'
import { useMyTeams } from '../lib/useMyTeams'
import { useErrorText } from '../lib/useErrorText'
import {
  MY_CLOCK_IN_KEY,
  askToClockIn,
  cancelClockInAsk,
  churchClock,
  clockInPhase,
  fetchMyClockIn,
  lookUpAddresses,
  refusalWords,
  submitClockIn,
  type ClockInResult,
  type FailedBecause,
  type MyClockIn,
  type Reading,
  clockNow,
  todayAt,
} from '../lib/clockIn'
import { LocationRefused, readBestPosition } from '../lib/clockInReading'
import { useLocationPermission } from '../lib/locationPermission'
import { ActionButton, inputClasses } from './Surface'
import { TimeField } from './DateTimeFields'
import { MapPinIcon } from './icons'
import { AllowLocation } from './AllowLocation'
import { stepsForThisPhone } from '../lib/locationHelp'

const blockedSteps = stepsForThisPhone()

type Step =
  | { at: 'idle' }
  | { at: 'reading'; latest: Reading | null; best: Reading | null; started: number }
  | { at: 'sending' }
  | { at: 'answered'; result: ClockInResult }
  | { at: 'failed'; message: string; blocked?: boolean }


/**
 * CLOCK IN on the Dashboard (0192).
 *
 * The button is there only while clocking in is open: from the minutes
 * before the person's first call time that Settings › Clock in gives,
 * until the day's last service ends. Pressed, it listens to the phone for
 * up to twenty seconds, showing how sure the phone is, and sends the best
 * reading; the database says whether that is at church. Once done, it is
 * one quiet line for the rest of the day.
 *
 * Before any of that, somebody on a team whose phone has refused the
 * location is told how to allow it — on a weekday, not at the door.
 */
export function ClockInPanel({ className = '' }: { className?: string }) {
  const { session, isAdmin, isSuperAdmin } = useAuth()
  const myId = session?.user.id
  const settings = useAppSettings()
  const { teamIds } = useMyTeams()
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const [now, setNow] = useState(() => Date.now())
  const [step, setStep] = useState<Step>({ at: 'idle' })
  const permission = useLocationPermission()
  const cancelRef = useRef<(() => void) | null>(null)
  // What the last failed try had, for asking instead (0194).
  const [lastTry, setLastTry] = useState<{ reading: Reading | null; failedBecause: FailedBecause } | null>(null)

  const todayQuery = useQuery({
    queryKey: [...MY_CLOCK_IN_KEY, myId],
    queryFn: fetchMyClockIn,
    enabled: !!myId,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
  const today = todayQuery.data

  // The button appears on its minute, not on the next refetch; while the
  // phone is being listened to, the seconds count down.
  const listening = step.at === 'reading'
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), listening ? 1_000 : 15_000)
    return () => window.clearInterval(id)
  }, [listening])

  useEffect(() => () => cancelRef.current?.(), [])

  const phase = clockInPhase(today, now)
  const timeZone = settings.timezone
  const neededM = today?.accuracy_m ?? settings.clock_in_accuracy_m

  async function clockIn() {
    const started = Date.now()
    setStep({ at: 'reading', latest: null, best: null, started })
    const reading = readBestPosition({
      neededM,
      onProgress: (latest, best) => setStep({ at: 'reading', latest, best, started }),
    })
    cancelRef.current = reading.cancel
    let best: Reading
    try {
      best = await reading.done
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (err instanceof LocationRefused) {
        setLastTry({ reading: null, failedBecause: err.reason === 'blocked' ? 'blocked' : 'nothing' })
        setStep({
          at: 'failed',
          blocked: err.reason === 'blocked',
          message:
            err.reason === 'nothing'
              ? 'Your phone could not find where it is. Check Location is turned on, step outside or near a window, and try again.'
              : err.message,
        })
        return
      }
      setStep({ at: 'failed', message: errorText(err, 'Could not read where you are.') })
      return
    } finally {
      cancelRef.current = null
    }
    setStep({ at: 'sending' })
    try {
      const result = await submitClockIn(best)
      setStep({ at: 'answered', result })
      if (!result.ok && (result.reason === 'too_rough' || result.reason === 'too_far')) {
        setLastTry({ reading: best, failedBecause: result.reason })
      }
      if (result.ok) {
        lookUpAddresses()
        await queryClient.invalidateQueries({ queryKey: MY_CLOCK_IN_KEY })
        void queryClient.invalidateQueries({ queryKey: ['availability'] })
      }
    } catch (err: unknown) {
      setStep({ at: 'failed', message: errorText(err, 'Could not clock you in. Try again.') })
    }
  }

  // A press answered "done" keeps its message until the page is left;
  // otherwise, once clocked in, one line.
  const justClocked = step.at === 'answered' && step.result.ok ? step.result : null

  if (phase === 'done' && !justClocked && today?.clocked_at) {
    return (
      <div className={className}>
        <p
          role="status"
          className="flex items-center gap-2 rounded-[var(--radius-row)] bg-surface-lowest px-4 py-3 text-body-sm text-on-surface-variant hairline"
        >
          <MapPinIcon className="size-4 shrink-0 text-accent-green-soft" />
          Clocked in at <span className="font-mono tabular-nums text-on-surface">{churchClock(today.clocked_at, timeZone)}</span>
          {today.method === 'added' && ' · added by an Admin'}
          {today.method === 'request' && ' · by request'}
        </p>
      </div>
    )
  }

  const onATeam = teamIds.length > 0 || !!today?.due
  // Only when the phone itself refused: the dot above has already asked
  // (on opening the app), and what the browser says on its own is not
  // to be trusted on an iPhone (lib/locationPermission).
  const askPermission = onATeam && permission === 'denied' && phase !== 'open'

  if (phase !== 'open' && !justClocked && today?.request?.status === 'pending') {
    return (
      <div className={className}>
        <AskedLine today={today} timeZone={settings.timezone} />
      </div>
    )
  }

  if (phase !== 'open' && !justClocked) {
    if (!askPermission) return null
    return (
      <div className={className}>
        <div
          role="note"
          className="flex flex-col gap-3 rounded-[var(--radius-row)] bg-surface-lowest px-4 py-3 hairline sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 flex-1">
            <p className="text-label-sm font-medium uppercase tracking-wide text-on-surface-variant">Clock in</p>
            <p className="mt-0.5 text-body-sm font-medium text-on-surface">
              Location is blocked for this app, so you will not be able to clock in.
            </p>
            <p className="mt-0.5 text-label-sm text-on-surface-variant">
              It is read when you open the app and when you press CLOCK IN — never in the background.
            </p>
            {/* The steps for this phone and browser; asking again says
                plainly when the phone refuses without asking. */}
            <AllowLocation showSteps="always" className="mt-2" />
          </div>
        </div>
      </div>
    )
  }

  if (!today?.place_set && !justClocked) {
    return isAdmin || isSuperAdmin ? (
      <div className={className}>
        <p role="note" className="rounded-[var(--radius-row)] bg-surface-lowest px-4 py-3 text-body-sm text-on-surface-variant hairline">
          Clocking in is open, but nobody can until the church&rsquo;s location is saved —{' '}
          <Link to="/clock-in" className="text-accent-blue-soft hover:underline">
            set it on the Clock In page
          </Link>
          .
        </p>
      </div>
    ) : null
  }

  const busy = step.at === 'reading' || step.at === 'sending'
  const secondsLeft = step.at === 'reading' ? Math.max(0, 20 - Math.floor((now - step.started) / 1000)) : 0

  return (
    <section aria-label="Clock in" data-tour="clock-in" className={className}>
      <div className="rounded-[var(--radius-card)] bg-surface-lowest p-4 hairline sm:p-5">
        {justClocked ? (
          <div role="status" className="text-center">
            <p className="text-label-sm font-medium uppercase tracking-wide text-accent-green-soft">Clocked in</p>
            <p className="mt-1 font-mono text-headline-xl tabular-nums text-on-surface">
              {churchClock(justClocked.clocked_at, timeZone)}
            </p>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              {justClocked.marked > 0
                ? `You are marked Present${justClocked.marked > 1 ? ` on ${justClocked.marked} teams` : ''}.`
                : 'Thank you.'}
            </p>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void clockIn()}
              disabled={busy}
              className="flex w-full flex-col items-center justify-center gap-1 rounded-[var(--radius-card)] bg-primary px-6 py-7 text-on-primary shadow-[0_8px_24px_-12px_var(--color-primary)] transition-[transform,opacity] duration-200 active:scale-[0.98] disabled:opacity-80 sm:py-9"
            >
              <span className="flex items-center gap-3 text-headline-lg uppercase tracking-[0.08em]">
                <MapPinIcon className="size-7" />
                {step.at === 'reading' ? 'Finding you…' : step.at === 'sending' ? 'Checking…' : 'Clock in'}
              </span>
              <span className="text-label-md opacity-90">
                {step.at === 'reading'
                  ? step.best
                    ? `± ${Math.round(step.best.accuracy)} m · needs ± ${neededM} m · ${secondsLeft}s`
                    : `Waiting for your phone… ${secondsLeft}s`
                  : today?.first_call
                    ? `Called for ${churchClock(today.first_call, timeZone)}`
                    : 'Press when you arrive'}
              </span>
            </button>
            {step.at === 'reading' && (
              <div className="mt-3 flex justify-center">
                <ActionButton
                  tone="ghost"
                  size="sm"
                  onClick={() => {
                    cancelRef.current?.()
                    setStep({ at: 'idle' })
                  }}
                >
                  Cancel
                </ActionButton>
              </div>
            )}
            {today?.request && today.request.status !== 'cancelled' && (
              <AskedLine today={today} timeZone={timeZone} />
            )}
            {step.at === 'answered' && !step.result.ok && <Refusal words={refusalWords(step.result, timeZone)} />}
            {step.at === 'failed' && (
              <div role="alert" className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-4 py-3 text-body-sm text-on-error-container">
                <p>{step.message}</p>
                {step.blocked && (
                  <>
                    <p className="mt-1 text-label-md font-medium">{blockedSteps.title}</p>
                    <ol className="mt-0.5 list-decimal pl-5 text-label-md">
                      {blockedSteps.steps.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ol>
                  </>
                )}
              </div>
            )}
            {lastTry && !busy && (!today?.request || today.request.status === 'cancelled') && (
              <AskInstead
                lastTry={lastTry}
                onAsked={() => {
                  setLastTry(null)
                  setStep({ at: 'idle' })
                }}
              />
            )}
          </>
        )}
      </div>
    </section>
  )
}

/** Their request, where it stands — and a way to take it back while it waits. */
function AskedLine({ today, timeZone }: { today: MyClockIn; timeZone: string }) {
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const request = today.request!
  const cancel = useMutation({
    mutationFn: () => cancelClockInAsk(request.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MY_CLOCK_IN_KEY }),
  })
  const declined = request.status === 'declined'
  return (
    <div
      role="status"
      className={`mt-3 rounded-[var(--radius-chip)] px-4 py-3 text-body-sm ${
        declined ? 'bg-error-container text-on-error-container' : 'bg-raised text-on-surface'
      }`}
    >
      {declined ? (
        <p>
          Your request to be clocked in was declined{request.decision_note ? `: ${request.decision_note}` : '.'} You
          can still try CLOCK IN again.
        </p>
      ) : request.status === 'pending' ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p>
            You asked to be clocked in at{' '}
            <span className="font-mono tabular-nums">{churchClock(request.asked_at, timeZone)}</span> — waiting for
            approval.
          </p>
          <ActionButton tone="ghost" size="sm" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            {cancel.isPending ? 'Cancelling…' : 'Cancel request'}
          </ActionButton>
        </div>
      ) : null}
      {cancel.error && <p className="mt-1 text-label-md">{errorText(cancel.error, 'Could not cancel it.')}</p>}
    </div>
  )
}

/**
 * After a CLOCK IN that did not work: ask instead. The request carries
 * what the phone gave on that try — or says it gave nothing — so whoever
 * approves can see where it thought they were.
 */
function AskInstead({
  lastTry,
  onAsked,
}: {
  lastTry: { reading: Reading | null; failedBecause: FailedBecause }
  onAsked: () => void
}) {
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  // When they got there, on their own clock: now unless they say earlier (0225).
  const [arrived, setArrived] = useState(() => clockNow())
  const tooLate = arrived > clockNow()
  const ask = useMutation({
    mutationFn: () =>
      askToClockIn({ reading: lastTry.reading, failedBecause: lastTry.failedBecause, note, arrivedAt: todayAt(arrived) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: MY_CLOCK_IN_KEY })
      onAsked()
    },
  })

  if (!open) {
    return (
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-center">
        <span className="text-label-md text-on-surface-variant">At church, and it still will not work?</span>
        <ActionButton tone="quiet" size="sm" onClick={() => setOpen(true)}>
          Ask to be clocked in
        </ActionButton>
      </div>
    )
  }
  return (
    <form
      aria-label="Ask to be clocked in"
      className="mt-3 flex flex-col gap-2 rounded-[var(--radius-row)] bg-raised px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault()
        ask.mutate()
      }}
    >
      <p className="text-body-sm text-on-surface">
        {lastTry.reading
          ? 'An approver will see where your phone thought you were, and when you say you arrived — approving clocks you in at that time.'
          : 'Your phone gave no location, so the approver will see when you say you arrived — approving clocks you in at that time.'}
      </p>
      <div className="flex flex-wrap items-center gap-2 text-body-sm text-on-surface">
        <span>I arrived at</span>
        <TimeField
          value={arrived}
          onChange={setArrived}
          label="When did you arrive?"
          aria-label="When you arrived"
          className="inline-flex min-w-0 items-center gap-2 rounded-[var(--radius-chip)] bg-surface-lowest px-3 py-1.5 font-mono text-body-sm text-on-surface hairline"
        />
      </div>
      {tooLate && <p className="text-label-md text-accent-red-soft">That is later than now — choose the time you got here.</p>}
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        placeholder="Anything they should know (optional)"
        aria-label="Note for the approver"
        className={inputClasses}
      />
      {ask.error && (
        <p role="alert" className="text-body-sm text-accent-red-soft">
          {errorText(ask.error, 'Could not send the request.')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <ActionButton type="submit" size="sm" disabled={ask.isPending || tooLate}>
          {ask.isPending ? 'Sending…' : 'Send request'}
        </ActionButton>
        <ActionButton tone="quiet" size="sm" onClick={() => setOpen(false)} disabled={ask.isPending}>
          Cancel
        </ActionButton>
      </div>
    </form>
  )
}

function Refusal({ words }: { words: { title: string; tips: string[] } }) {
  return (
    <div role="alert" className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-4 py-3 text-body-sm text-on-error-container">
      <p className="font-medium">{words.title}</p>
      {words.tips.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-label-md">
          {words.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
