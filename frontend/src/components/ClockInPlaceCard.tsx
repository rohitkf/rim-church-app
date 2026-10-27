import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SETTINGS_KEY, useAppSettings } from '../lib/appSettings'
import { useErrorText } from '../lib/useErrorText'
import {
  distanceMetres,
  fetchClockInPlace,
  findPlaces,
  formatDistance,
  saveClockInPlace,
  saveClockInRadius,
  type FoundPlace,
} from '../lib/clockIn'
import { NumberDial } from './NumberDial'
import { reportLocation } from '../lib/locationPermission'
import { ActionButton, SectionTile, inputClasses } from './Surface'
import { QueryState } from './QueryState'
import { formatRelativeTime } from '../lib/relativeTime'
import { settingEntry } from '../lib/settingsCatalog'

// The map library is only for whoever sets the spot, so it is fetched
// only when this card is on screen.
const PlaceMap = lazy(() => import('./PlaceMap').then((m) => ({ default: m.PlaceMap })))

const RADIUS = (() => {
  const entry = settingEntry('clock_in_radius_m')
  if (entry.kind !== 'dial') throw new Error('The radius is a dial')
  return { min: entry.min, dialMax: entry.dialMax ?? entry.max, dialStep: entry.dialStep ?? 10, majorEvery: entry.majorEvery ?? 50 }
})()

type Draft = { label: string | null; postcode: string | null; lat: number; lng: number }

/**
 * Where the church is — at the top of the Clock In page, for the Owner
 * and Admins only (the database will not show it to anybody else).
 *
 * Found by a UK postcode or an address, or by standing at the door and
 * pressing "Use where I am now"; then the pin is dragged to the door. The
 * circle is the radius in Settings › Clock in. Nothing changes until Save.
 */
export function ClockInPlaceCard() {
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const settings = useAppSettings()
  const placeQuery = useQuery({ queryKey: ['clock-in-place'], queryFn: fetchClockInPlace })
  const [draft, setDraft] = useState<Draft | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FoundPlace[] | null>(null)
  const [finding, setFinding] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [radiusDraft, setRadiusDraft] = useState<number | null>(null)
  const radius = radiusDraft ?? settings.clock_in_radius_m
  const radiusMoved = radiusDraft !== null && radiusDraft !== settings.clock_in_radius_m

  const stored = placeQuery.data
  const shown: Draft | null =
    draft ?? (stored ? { label: stored.label, postcode: stored.postcode, lat: stored.latitude, lng: stored.longitude } : null)
  const moved = draft && stored ? distanceMetres({ lat: stored.latitude, lng: stored.longitude }, draft) : null

  const save = useMutation({
    mutationFn: async () => {
      if (draft) await saveClockInPlace(draft)
      if (radiusMoved) await saveClockInRadius(radiusDraft!)
    },
    onSuccess: async () => {
      setDraft(null)
      setRadiusDraft(null)
      setResults(null)
      setError(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['clock-in-place'] }),
        queryClient.invalidateQueries({ queryKey: SETTINGS_KEY }),
      ])
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not save where the church is.')),
  })

  async function find() {
    setFinding(true)
    setError(null)
    try {
      const found = await findPlaces(query)
      setResults(found)
      if (found.length === 1) choose(found[0])
    } catch (err: unknown) {
      setError(errorText(err, 'Could not search for that.'))
    } finally {
      setFinding(false)
    }
  }

  function choose(place: FoundPlace) {
    setDraft({ label: place.label, postcode: place.postcode, lat: place.lat, lng: place.lng })
  }

  function useHere() {
    if (!('geolocation' in navigator)) {
      setError('This browser cannot tell where it is.')
      return
    }
    setLocating(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        reportLocation('granted')
        setLocating(false)
        setDraft({
          label: shown?.label ?? 'Where I stood',
          postcode: shown?.postcode ?? null,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
        if (position.coords.accuracy > 30) {
          setError(
            `Your phone is only sure to ± ${Math.round(position.coords.accuracy)} m here — check the pin and drag it to the door.`,
          )
        }
      },
      (err) => {
        setLocating(false)
        if (err.code === err.PERMISSION_DENIED) reportLocation('denied')
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Location is blocked for this app. Allow it in your browser or phone settings, or find the church by postcode.'
            : 'Could not get a position. Try again, or find the church by postcode.',
        )
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    )
  }

  return (
    <SectionTile
      title="Where the church is"
      collapsible
      defaultOpen={false}
      hint={
        placeQuery.isLoading
          ? 'Only the Owner and Admins see this.'
          : stored
            ? `${stored.label ?? 'Set'} · within ${settings.clock_in_radius_m} m. Only the Owner and Admins see this.`
            : 'Not set yet — nobody can clock in until it is. Only the Owner and Admins see this.'
      }
    >
      <QueryState isLoading={placeQuery.isLoading} error={placeQuery.error}>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (query.trim()) void find()
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Postcode or address, e.g. SW1A 1AA"
            aria-label="Postcode or address of the church"
            className={`${inputClasses} min-w-0 basis-full sm:basis-0 sm:flex-1`}
          />
          <ActionButton type="submit" tone="quiet" disabled={finding || !query.trim()}>
            {finding ? 'Finding…' : 'Find'}
          </ActionButton>
          <ActionButton type="button" tone="quiet" onClick={useHere} disabled={locating}>
            {locating ? 'Locating…' : 'Use where I am now'}
          </ActionButton>
        </form>

        {results && results.length !== 1 && (
          <ul aria-label="Places found" className="mt-2 flex flex-col gap-1">
            {results.map((place) => (
              <li key={`${place.lat},${place.lng}`}>
                <button
                  type="button"
                  onClick={() => choose(place)}
                  className="tap w-full rounded-[var(--radius-row)] bg-raised px-4 py-2 text-left text-body-sm text-on-surface hover:bg-raised-strong"
                >
                  {place.label}
                </button>
              </li>
            ))}
            {results.length === 0 && (
              <li className="px-1 text-label-sm text-on-surface-faint">Nothing found. Try the postcode, or fewer words.</li>
            )}
          </ul>
        )}

        {shown ? (
          <>
            <Suspense fallback={<div className="mt-3 h-72 rounded-[var(--radius-card)] bg-raised" />}>
              <PlaceMap
                lat={shown.lat}
                lng={shown.lng}
                radius={radius}
                editable
                onMove={(to) => setDraft({ ...(shown as Draft), ...to })}
                className="mt-3 h-72"
              />
            </Suspense>
            <p className="mt-2 text-label-sm text-on-surface-faint">
              Map © OpenStreetMap contributors · postcodes from postcodes.io (ONS, OS)
            </p>
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-body-sm sm:grid-cols-2">
              <div>
                <dt className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">Place</dt>
                <dd data-testid="place-label" className="break-words text-on-surface">
                  {shown.label ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">Pin</dt>
                <dd className="font-mono text-label-md text-on-surface-variant">
                  {shown.lat.toFixed(6)}, {shown.lng.toFixed(6)} · within {radius} m
                </dd>
              </div>
            </dl>
            <div className="mt-4">
              <p className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
                Counts as at church within
              </p>
              <p className="mt-0.5 text-label-sm text-on-surface-variant">
                A phone further than this from the pin is told it is too far. About 100 m covers a church and its car
                park.
              </p>
              <NumberDial
                value={radius}
                onChange={(next) => setRadiusDraft(next)}
                min={RADIUS.min}
                max={RADIUS.dialMax}
                step={RADIUS.dialStep}
                majorEvery={RADIUS.majorEvery}
                unit="metres"
                label="Counts as at church within"
                className="mt-2"
              />
            </div>
            <p className="mt-2 text-label-sm text-on-surface-faint">
              Drag the pin, or tap the map, to put it on the door.{' '}
              <Link to="/settings/clock-in" className="text-accent-blue-soft hover:underline">
                More clock-in settings
              </Link>
              .
            </p>
          </>
        ) : (
          <p className="mt-3 rounded-[var(--radius-row)] bg-raised px-4 py-3 text-body-sm text-on-surface-variant">
            Not set yet — nobody can clock in until it is. Find the church by its postcode, or stand at the door
            and press “Use where I am now”.
          </p>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-4 py-3 text-body-sm text-on-error-container">
            {error}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(draft || (radiusMoved && stored)) && (
            <>
              <ActionButton onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending
                  ? 'Saving…'
                  : !draft
                    ? 'Save the radius'
                    : stored
                      ? radiusMoved
                        ? 'Save the spot and radius'
                        : 'Save the new spot'
                      : 'Save'}
              </ActionButton>
              <ActionButton
                tone="quiet"
                onClick={() => {
                  setDraft(null)
                  setRadiusDraft(null)
                }}
                disabled={save.isPending}
              >
                Cancel
              </ActionButton>
              {moved !== null && (
                <span className="text-label-md text-on-surface-variant">{formatDistance(moved)} from the saved spot</span>
              )}
            </>
          )}
          {!draft && !radiusMoved && stored && (
            <span className="text-label-sm text-on-surface-faint">
              Saved {formatRelativeTime(stored.updated_at)}
              {stored.updater ? ` by ${stored.updater.first_name} ${stored.updater.last_name}` : ''}
            </span>
          )}
        </div>
      </QueryState>
    </SectionTile>
  )
}
