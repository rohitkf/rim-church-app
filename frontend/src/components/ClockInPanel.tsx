import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { useAppSettings } from '../lib/appSettings'
import { useMyTeams } from '../lib/useMyTeams'
import { useErrorText } from '../lib/useErrorText'
import {
  MY_CLOCK_IN_KEY,
  churchClock,
  clockInPhase,
  fetchMyClockIn,
  lookUpAddresses,
  refusalWords,
  submitClockIn,
  type ClockInResult,
  type Reading,
} from '../lib/clockIn'
import { LocationRefused, locationPermission, readBestPosition, type LocationPermission } from '../lib/clockInReading'
import { ActionButton } from './Surface'
import { MapPinIcon } from './icons'

type Step =
  | { at: 'idle' }
  | { at: 'reading'; latest: Reading | null; best: Reading | null; started: number }
  | { at: 'sending' }
  | { at: 'answered'; result: ClockInResult }
  | { at: 'failed'; message: string; blocked?: boolean }

const BLOCKED_HELP = [
  'iPhone: Settings › Privacy & Security › Location Services › your browser (or this app) › While Using, with Precise Location on.',
  'Android: tap the padlock beside the address › Permissions › Location › Allow — or Settings › Apps › your browser › Permissions.',
]

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
 * Before any of that, somebody on a team who has not yet let the app read
 * their location is asked to — on a weekday, not at the door.
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
  const [permission, setPermission] = useState<LocationPermission>('unknown')
  const cancelRef = useRef<(() => void) | null>(null)

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

  useEffect(() => {
    let status: PermissionStatus | null = null
    const follow = () => status && setPermission(status.state)
    void locationPermission().then((found) => {
      setPermission(found.state)
      status = found.status
      status?.addEventListener('change', follow)
    })
    return () => status?.removeEventListener('change', follow)
  }, [])

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
        if (err.reason === 'blocked') setPermission('denied')
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
    setPermission('granted')
    setStep({ at: 'sending' })
    try {
      const result = await submitClockIn(best)
      setStep({ at: 'answered', result })
      if (result.ok) {
        lookUpAddresses()
        await queryClient.invalidateQueries({ queryKey: MY_CLOCK_IN_KEY })
        void queryClient.invalidateQueries({ queryKey: ['availability'] })
      }
    } catch (err: unknown) {
      setStep({ at: 'failed', message: errorText(err, 'Could not clock you in. Try again.') })
    }
  }

  function askForLocation() {
    navigator.geolocation?.getCurrentPosition(
      () => setPermission('granted'),
      (err) => err.code === err.PERMISSION_DENIED && setPermission('denied'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    )
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
  const askPermission = onATeam && (permission === 'prompt' || permission === 'denied') && phase !== 'open'

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
              {permission === 'denied'
                ? 'Location is blocked for this app, so you will not be able to clock in.'
                : 'Let the app use your location, so you can clock in when you arrive on a day you serve.'}
            </p>
            <p className="mt-0.5 text-label-sm text-on-surface-variant">
              It is read once, when you press CLOCK IN at church — never in the background.
            </p>
            {permission === 'denied' && (
              <ul className="mt-1 list-disc pl-5 text-label-sm text-on-surface-variant">
                {BLOCKED_HELP.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </div>
          {permission === 'prompt' && (
            <ActionButton size="sm" onClick={askForLocation} className="shrink-0 self-start sm:self-center">
              Allow location
            </ActionButton>
          )}
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
    <section aria-label="Clock in" className={className}>
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
            {step.at === 'answered' && !step.result.ok && <Refusal words={refusalWords(step.result, timeZone)} />}
            {step.at === 'failed' && (
              <div role="alert" className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-4 py-3 text-body-sm text-on-error-container">
                <p>{step.message}</p>
                {step.blocked && (
                  <ul className="mt-1 list-disc pl-5 text-label-md">
                    {BLOCKED_HELP.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
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
