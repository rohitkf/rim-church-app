import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { fetchDepartments } from '../lib/queries'
import { fetchPeopleOptions } from '../lib/plannerControls'
import { useErrorText } from '../lib/useErrorText'
import { PERMISSIONS_KEY, usePermissions } from '../lib/usePermissions'
import {
  NEW_DOOR_HOLDER,
  RECEPTION_BUTTONS,
  RECEPTION_KEYS,
  receptionFromGrants,
  receptionGrantChanges,
  toggleDoorButton,
  withDoorHolder,
  type DoorHolderKind,
  type ReceptionAccess,
} from '../lib/receptionAccess'
import {
  RECEPTION_EVENTS_KEY,
  eventDays,
  fetchReceptionEvents,
  holderKey,
  receptionEventChanges,
  saveReceptionEvents,
  toggleEvent,
  withEventLimit,
  type ReceptionEventChoice,
  type ReceptionEventLimits,
} from '../lib/receptionEvents'
import { Select } from './Select'
import { Pill, SectionTile, SegmentedControl, inputClasses } from './Surface'
import { SaveBar } from './SettingRows'
import { ReceptionLockCard } from './ReceptionLockCard'

/**
 * Settings › Reception (0288).
 *
 * The three things the Owner asked where to find: the lock (when the
 * people given Reception may use it), who those people are and which of
 * its buttons each has, and what Undo does there.
 *
 * Who has Reception is not a list kept in this room: each tick is a grant
 * (0208), the same row Access & Privileges › By person and By team write,
 * so the two can never disagree. Changing them is for whoever may change
 * the grid; turning the key is for whoever runs registrations. Each half
 * is drawn for whoever may use it, and read-only for anybody else let in.
 *
 * And which events each holder has Reception for (0313): every event,
 * which is how everybody starts, or the ones ticked. That is kept apart
 * from the grants — a grant knows nothing of events — and saved after
 * them by the same button, so somebody added and kept to one event in one
 * go is on Reception before their limit is written.
 */
export function ReceptionSettingsCard() {
  const { can, grants = [] } = usePermissions()
  const editable = can('app.permissions')
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const departments = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  const people = useQuery({ queryKey: ['people-options'], queryFn: fetchPeopleOptions })

  const stored = useMemo(() => receptionFromGrants(grants), [grants])
  const [draft, setDraft] = useState<ReceptionAccess | null>(null)
  const value = draft ?? stored
  const changes = useMemo(() => receptionGrantChanges(stored, value), [stored, value])
  // Which events each holder is kept to. Absent while it cannot be read: the ticks still work without it.
  const eventsQuery = useQuery({ queryKey: RECEPTION_EVENTS_KEY, queryFn: fetchReceptionEvents, retry: false })
  const storedLimits = useMemo(() => eventsQuery.data?.limits ?? {}, [eventsQuery.data])
  const [limitsDraft, setLimitsDraft] = useState<ReceptionEventLimits | null>(null)
  const limits = limitsDraft ?? storedLimits
  const events = eventsQuery.data?.events ?? []
  const holderKeys = useMemo(
    () => [...Object.keys(value.teams).map((id) => holderKey('teams', id)), ...Object.keys(value.people).map((id) => holderKey('people', id))],
    [value],
  )
  const eventChanges = useMemo(() => receptionEventChanges(storedLimits, limits, holderKeys), [storedLimits, limits, holderKeys])

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const changeLimits = (next: ReceptionEventLimits) => {
    setSaved(false)
    setLimitsDraft(next)
  }
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const change = (next: ReceptionAccess) => {
    setSaved(false)
    setDraft(next)
  }

  const save = async () => {
    setSaving(true)
    setSaved(false)
    // The ticks first: a limit is refused for somebody who is not on Reception yet.
    if (changes.length > 0) {
      const { error: failed } = await supabase.rpc('set_permission_grants', { p_changes: changes })
      if (failed) {
        setSaving(false)
        setError(errorText(failed, 'Could not save who works Reception.'))
        return
      }
      await queryClient.invalidateQueries({ queryKey: PERMISSIONS_KEY })
      setDraft(null)
    }
    try {
      await saveReceptionEvents(eventChanges)
    } catch (failed) {
      setSaving(false)
      setError(errorText(failed, 'The ticks were saved, but not which events each has. Try saving again.'))
      await queryClient.invalidateQueries({ queryKey: RECEPTION_EVENTS_KEY })
      return
    }
    setSaving(false)
    setError(null)
    await queryClient.invalidateQueries({ queryKey: RECEPTION_EVENTS_KEY })
    setLimitsDraft(null)
    setSaved(true)
  }

  const teams = departments.data ?? []
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? null
  const personName = (id: string) => {
    const p = people.data?.find((x) => x.id === id)
    return p ? `${p.first_name} ${p.last_name}`.trim() : null
  }

  // Teams first, then people, each by name; one since gone is left out rather than shown as an id.
  const holders = (() => {
    const rows: { kind: DoorHolderKind; id: string; name: string; given: readonly string[] }[] = []
    for (const [id, given] of Object.entries(value.teams)) {
      const name = teamName(id)
      if (name) rows.push({ kind: 'teams', id, name, given })
    }
    for (const [id, given] of Object.entries(value.people)) {
      const name = personName(id)
      if (name) rows.push({ kind: 'people', id, name, given })
    }
    return rows.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'teams' ? -1 : 1))
  })()

  const teamsLeft = teams.filter((t) => !(t.id in value.teams))
  const needle = search.trim().toLowerCase()
  const found = needle
    ? (people.data ?? [])
        .filter((p) => !(p.id in value.people))
        .filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(needle))
        .slice(0, 6)
    : []

  return (
    <div className="flex flex-col gap-4">
      <ReceptionLockCard />

      <SectionTile
        title="Who works Reception"
        hint="The Owner, an Admin and whoever runs registrations always can, for every event. Add a team (everybody on it, and its Heads) or a person, tick what each may press, and choose whether that is for every event or only some."
      >
        {holders.length === 0 ? (
          <p className="rounded-[var(--radius-row)] bg-raised px-4 py-3 text-body-sm text-on-surface-variant">
            Nobody else yet: only the Owner and whoever runs registrations can open Reception.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Who has Reception">
            {holders.map((h) => (
              <li key={`${h.kind}:${h.id}`} className="rounded-[var(--radius-row)] bg-raised px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-on-surface">{h.name}</span>
                  <Pill tone={h.kind === 'teams' ? 'blue' : 'neutral'}>{h.kind === 'teams' ? 'Team' : 'Person'}</Pill>
                  {editable && (
                    <span className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => change(withDoorHolder(value, h.kind, h.id, RECEPTION_KEYS))}
                        className="tap rounded-full px-2.5 py-1 text-label-md text-accent-blue-soft hover:text-on-surface"
                        aria-label={`Give ${h.name} every button`}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => change(withDoorHolder(value, h.kind, h.id, null))}
                        className="tap rounded-full px-2.5 py-1 text-label-md text-on-surface-variant hover:text-error"
                        aria-label={`Remove ${h.name}`}
                      >
                        Remove
                      </button>
                    </span>
                  )}
                </div>
                <div role="group" aria-label={`What ${h.name} may do at Reception`} className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
                  {RECEPTION_BUTTONS.map((b) => (
                    <label key={b.key} className={`flex items-start gap-2.5 ${editable ? 'cursor-pointer' : 'opacity-80'}`}>
                      <input
                        type="checkbox"
                        checked={h.given.includes(b.key)}
                        disabled={!editable}
                        onChange={() => change(toggleDoorButton(value, h.kind, h.id, b.key))}
                        className="mt-0.5 h-4 w-4 shrink-0"
                      />
                      <span className="min-w-0">
                        <span className="block text-body-sm text-on-surface">{b.label}</span>
                        <span className="block text-label-sm text-on-surface-faint">{b.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {h.given.length === 0 && (
                  <p className="mt-2 text-label-sm text-on-surface-faint">Nothing ticked: {h.name} cannot open Reception.</p>
                )}
                {eventsQuery.isSuccess && (
                  <HolderEvents
                    name={h.name}
                    chosen={limits[holderKey(h.kind, h.id)]}
                    events={events}
                    editable={editable}
                    onMode={(only) => changeLimits(withEventLimit(limits, holderKey(h.kind, h.id), only ? (storedLimits[holderKey(h.kind, h.id)] ?? []) : null))}
                    onToggle={(eventId) => changeLimits(toggleEvent(limits, holderKey(h.kind, h.id), eventId))}
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        {editable ? (
          <>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Select
                aria-label="Add a team"
                placeholder={teamsLeft.length > 0 ? 'Add a team…' : 'Every team is added'}
                value=""
                disabled={teamsLeft.length === 0}
                options={teamsLeft.map((t) => ({ value: t.id, label: t.name }))}
                onChange={(id) => id && change(withDoorHolder(value, 'teams', id, NEW_DOOR_HOLDER))}
              />
              <div>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Add a person…"
                  aria-label="Add a person"
                  className={inputClasses}
                />
                {needle && (
                  <ul className="mt-1.5 flex flex-col gap-1" aria-label="People to add">
                    {found.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => {
                            change(withDoorHolder(value, 'people', p.id, NEW_DOOR_HOLDER))
                            setSearch('')
                          }}
                          className="tap w-full rounded-[var(--radius-row)] bg-raised px-4 py-2 text-left text-body-sm text-on-surface hover:bg-raised-strong"
                        >
                          Add {p.first_name} {p.last_name}
                        </button>
                      </li>
                    ))}
                    {found.length === 0 && <li className="px-1 text-label-sm text-on-surface-faint">Nobody else by that name.</li>}
                  </ul>
                )}
              </div>
            </div>
            <p className="mt-2 text-label-sm text-on-surface-faint">
              Somebody new starts with everything a door does — checking in, payments, walk-ins and sorting out problems — so they can deal with whoever is in front of them; take off any tick they should not have. A whole role can be given Reception too, in{' '}
              <Link to="/settings/access" className="font-medium text-accent-blue-soft hover:underline">
                Access &amp; Privileges
              </Link>
              .
            </p>
          </>
        ) : (
          <p className="mt-3 text-label-sm text-on-surface-faint">
            Changing who works Reception is for whoever may change Access &amp; Privileges.
          </p>
        )}
      </SectionTile>

      <SectionTile title="Undo at Reception" hint="A door is where a thumb lands on the wrong row.">
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body-sm text-on-surface-variant">
          <li>
            Everybody who works Reception has it. After a check-in, a payment or a walk-in, <span className="font-medium text-on-surface">Undo</span>{' '}
            is on the message that says what was done, and stays under that person’s row for ten minutes.
          </li>
          <li>It puts the registration back exactly as it was. An email about the payment waits until the offer has passed, so a slip taken back never reaches the attendee.</li>
          <li>Only whoever pressed it can undo it, and never over a change somebody else has made since. A check-in can be undone by anybody on the door, at any time, with Undo check-in.</li>
        </ul>
      </SectionTile>

      {editable && <SaveBar changed={changes.length > 0 || eventChanges.length > 0} saving={saving} saved={saved} error={error} onSave={() => void save()} label="Save who works Reception" />}
    </div>
  )
}

/**
 * Which events one holder has Reception for (0313): every event, or the
 * ones ticked. "Every event" includes events not made yet; "Chosen events"
 * does not, so a new event is ticked here for whoever is to work it.
 */
function HolderEvents({
  name,
  chosen,
  events,
  editable,
  onMode,
  onToggle,
}: {
  name: string
  /** The events they are kept to; undefined is every event. */
  chosen: string[] | undefined
  events: ReceptionEventChoice[]
  editable: boolean
  onMode: (onlyChosen: boolean) => void
  onToggle: (eventId: string) => void
}) {
  const limited = chosen !== undefined
  const names = events.filter((e) => chosen?.includes(e.id)).map((e) => e.title)

  if (!editable) {
    return (
      <p className="mt-2 text-label-md text-on-surface-variant">
        <span className="text-on-surface-faint">Events: </span>
        {!limited ? 'every event' : names.length > 0 ? names.join(', ') : 'none chosen'}
      </p>
    )
  }

  return (
    <div className="mt-3 border-t border-border-subtle pt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-body-sm font-medium text-on-surface">Events</span>
        <SegmentedControl
          label={`Which events ${name} has Reception for`}
          value={limited ? 'chosen' : 'every'}
          onChange={(next) => onMode(next === 'chosen')}
          options={[
            { value: 'every', label: 'Every event' },
            { value: 'chosen', label: 'Chosen events' },
          ]}
        />
      </div>
      {limited &&
        (events.length === 0 ? (
          <p className="mt-2 text-label-sm text-on-surface-faint">There are no events to choose from yet.</p>
        ) : (
          <div role="group" aria-label={`Events ${name} has Reception for`} className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {events.map((e) => (
              <label key={e.id} className="flex cursor-pointer items-start gap-2.5">
                <input type="checkbox" checked={chosen.includes(e.id)} onChange={() => onToggle(e.id)} className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-body-sm text-on-surface [overflow-wrap:anywhere]">{e.title}</span>
                  <span className="block text-label-sm text-on-surface-faint">
                    {[eventDays(e), e.cancelled ? 'Cancelled' : e.status === 'draft' ? 'Draft' : null].filter(Boolean).join(' · ') || 'No date yet'}
                  </span>
                </span>
              </label>
            ))}
          </div>
        ))}
      {limited && chosen.length === 0 && events.length > 0 && (
        <p className="mt-2 text-label-sm text-accent-orange-soft">No event chosen: {name} cannot open Reception for any event.</p>
      )}
      {limited && chosen.length > 0 && (
        <p className="mt-2 text-label-sm text-on-surface-faint">An event made later is not theirs until it is ticked here.</p>
      )}
    </div>
  )
}
