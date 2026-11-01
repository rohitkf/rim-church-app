import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { useAppSettings } from '../lib/appSettings'
import { useErrorText } from '../lib/useErrorText'
import {
  CLOCK_IN_REQUESTS_KEY,
  FAILED_BECAUSE_WORDS,
  churchClock,
  decideClockInRequest,
  fetchClockInPlace,
  fetchClockInRequestsToAnswer,
  formatDistance,
  lookUpAddresses,
  type ClockInRequest,
} from '../lib/clockIn'
import { ActionButton, SectionTile, inputClasses } from './Surface'

const PlaceMap = lazy(() => import('./PlaceMap').then((m) => ({ default: m.PlaceMap })))

const waitingForAddress = (r: ClockInRequest) => r.address === null && r.latitude !== null && (r.address_tries ?? 0) < 3

/**
 * Requests to be clocked in, waiting on this person (0194).
 *
 * Shown to whoever may answer them — the Owner, Admins and the teams named
 * in Settings › Clock in — and to nobody else: the database hands an
 * approver every request, anybody else none but their own, which this
 * leaves out. Each says where the phone thought it was on the attempt
 * that failed; the Owner and Admins also get the map, which shows where
 * the church's pin is. Nothing at all when nothing is waiting.
 */
export function ClockInRequests({ className = '' }: { className?: string }) {
  const { session, isAdmin, isSuperAdmin } = useAuth()
  const myId = session?.user.id
  const runsIt = isAdmin || isSuperAdmin
  const query = useQuery({
    queryKey: [...CLOCK_IN_REQUESTS_KEY, myId],
    queryFn: () => fetchClockInRequestsToAnswer(myId!),
    enabled: !!myId,
    refetchInterval: (q) => ((q.state.data ?? []).some(waitingForAddress) ? 5_000 : 60_000),
  })
  const requests = useMemo(() => query.data ?? [], [query.data])

  // A street for anything that has not got one yet — asked once a visit.
  const asked = useRef(new Set<string>())
  useEffect(() => {
    const waiting = requests.filter(waitingForAddress).map((r) => r.id)
    if (waiting.length === 0 || waiting.every((id) => asked.current.has(id))) return
    waiting.forEach((id) => asked.current.add(id))
    lookUpAddresses()
  }, [requests])

  if (requests.length === 0) return null
  return (
    <SectionTile
      title={requests.length === 1 ? 'A request to be clocked in' : `${requests.length} requests to be clocked in`}
      hint="Their phone could not clock them in. Approved, they are clocked in at the time they asked."
      className={className}
    >
      <ul className="flex flex-col gap-3">
        {requests.map((r) => (
          <RequestItem key={r.id} request={r} withMap={runsIt} />
        ))}
      </ul>
    </SectionTile>
  )
}

function RequestItem({ request: r, withMap }: { request: ClockInRequest; withMap: boolean }) {
  const settings = useAppSettings()
  const timeZone = settings.timezone
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [declining, setDeclining] = useState(false)
  const [note, setNote] = useState('')
  const placeQuery = useQuery({ queryKey: ['clock-in-place'], queryFn: fetchClockInPlace, enabled: withMap })
  const name = r.person ? `${r.person.first_name} ${r.person.last_name}`.trim() : 'Somebody'

  const decide = useMutation({
    mutationFn: (approve: boolean) => decideClockInRequest(r.id, approve, note),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: CLOCK_IN_REQUESTS_KEY }),
        queryClient.invalidateQueries({ queryKey: ['clock-ins'] }),
        queryClient.invalidateQueries({ queryKey: ['clock-in-history'] }),
        queryClient.invalidateQueries({ queryKey: ['clock-in-teams'] }),
        queryClient.invalidateQueries({ queryKey: ['clock-in-still-out'] }),
      ]),
  })

  const place = placeQuery.data
  return (
    <li aria-label={`${name}’s request`} className="rounded-[var(--radius-row)] bg-raised px-4 py-3">
      <p className="text-body-sm text-on-surface">
        <span className="font-medium">{name}</span>{' '}
        {r.arrived_at ? (
          <>
            says they arrived at <span className="font-mono tabular-nums">{churchClock(r.arrived_at, timeZone)}</span>
            <span className="text-on-surface-variant">
              {' '}· asked at <span className="font-mono tabular-nums">{churchClock(r.asked_at, timeZone)}</span>
            </span>
          </>
        ) : (
          <>
            asked at <span className="font-mono tabular-nums">{churchClock(r.asked_at, timeZone)}</span>
          </>
        )}
      </p>
      {r.arrived_at && (
        <p className="mt-0.5 text-label-md text-on-surface-variant">Approving clocks them in at the time they arrived.</p>
      )}
      {r.failed_because && <p className="mt-0.5 text-label-md text-on-surface-variant">{FAILED_BECAUSE_WORDS[r.failed_because]}</p>}

      <div className="mt-2 text-body-sm text-on-surface-variant">
        {r.latitude === null ? (
          <p>No location — their phone gave none.</p>
        ) : (
          <>
            <p>
              {r.address ?? (waitingForAddress(r) ? 'Looking up the address…' : 'Address not found')}
            </p>
            <p className="font-mono text-label-sm text-on-surface-faint">
              {r.distance_m !== null ? `${formatDistance(r.distance_m)} from church` : 'Distance unknown'}
              {r.accuracy_m !== null && ` · ± ${Math.round(r.accuracy_m)} m`}
              {r.read_at && ` · read ${churchClock(r.read_at, timeZone)}`}
            </p>
          </>
        )}
      </div>
      {r.note && <p className="mt-1 text-label-md text-on-surface">“{r.note}”</p>}

      {withMap && r.latitude !== null && r.longitude !== null && place && (
        <Suspense fallback={<div className="mt-3 h-56 rounded-[var(--radius-card)] bg-surface-lowest" />}>
          <PlaceMap
            lat={place.latitude}
            lng={place.longitude}
            radius={settings.clock_in_radius_m}
            editable={false}
            reading={{ lat: r.latitude, lng: r.longitude, accuracy: r.accuracy_m ?? 0 }}
            className="mt-3 h-56"
          />
        </Suspense>
      )}

      {declining && (
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="Why (they will see this)"
          aria-label="Why not"
          className={`${inputClasses} mt-3`}
        />
      )}
      {decide.error && (
        <p role="alert" className="mt-2 text-body-sm text-accent-red-soft">
          {errorText(decide.error, 'Could not answer that.')}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {declining ? (
          <>
            <ActionButton size="sm" tone="danger" onClick={() => decide.mutate(false)} disabled={decide.isPending}>
              {decide.isPending ? 'Declining…' : 'Decline'}
            </ActionButton>
            <ActionButton size="sm" tone="quiet" onClick={() => setDeclining(false)} disabled={decide.isPending}>
              Back
            </ActionButton>
          </>
        ) : (
          <>
            <ActionButton size="sm" tone="success" onClick={() => decide.mutate(true)} disabled={decide.isPending}>
              {decide.isPending ? 'Approving…' : 'Approve'}
            </ActionButton>
            <ActionButton size="sm" tone="quiet" onClick={() => setDeclining(true)} disabled={decide.isPending}>
              Decline…
            </ActionButton>
          </>
        )}
      </div>
    </li>
  )
}
