import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { ActionButton, PageHeader, SectionTile, inputClasses } from '../components/Surface'
import { QueryState } from '../components/QueryState'
import { ClockInPlaceCard } from '../components/ClockInPlaceCard'
import { ClockInRequests } from '../components/ClockInRequests'
import { DateField, TimeField } from '../components/DateTimeFields'
import { Select } from '../components/Select'
import { useAppSettings } from '../lib/appSettings'
import { useErrorText } from '../lib/useErrorText'
import { fetchPeopleOptions } from '../lib/plannerControls'
import { fetchDepartments } from '../lib/queries'
import {
  addClockIn,
  changeClockInTime,
  churchClock,
  churchInstant,
  fetchClockInHistory,
  fetchClockIns,
  fetchClockInTeams,
  fetchStillOut,
  formatDistance,
  groupClockIns,
  lookUpAddresses,
  removeClockIn,
  type ClockIn,
  type ClockInHistoryEntry,
} from '../lib/clockIn'
import { todayIso } from '../lib/monthGrid'
import { teamWash } from '../lib/teamGradient'
import { useTeamStyle } from '../lib/useTeamStyle'
import { formatServiceDay } from '../lib/sunday'
import { formatRelativeTime } from '../lib/relativeTime'

const METHOD_LABEL: Record<ClockIn['method'], string> = {
  location: 'Phone at church',
  request: 'Request approved',
  added: 'Added by an Admin',
}

const fullName = (p: { first_name: string; last_name: string } | null | undefined, otherwise = 'Unknown') =>
  p ? `${p.first_name} ${p.last_name}`.trim() : otherwise

/** Still waiting for its street address — and not given up on. */
const awaitingAddress = (row: ClockIn) => row.address === null && row.latitude !== null && (row.address_tries ?? 0) < 3

/**
 * Clock In (0191, 0192): who arrived, when, and where they were.
 *
 * People clock in from their Dashboard; this is the watchers' page — the
 * Owner, Admins and Overwatch, and whoever the church named in Settings ›
 * Clock in. Where the church is, which every clock-in is checked against,
 * sits at the top for the Owner and Admins alone, and so does putting a
 * clock-in right: its time changed, one added for somebody whose phone
 * would not, or one taken away — each with a reason, each in the history.
 */
export function ClockInPage() {
  const { isAdmin, isSuperAdmin } = useAuth()
  const runsIt = isAdmin || isSuperAdmin
  const settings = useAppSettings()
  const timeZone = settings.timezone
  const queryClient = useQueryClient()
  const { teamStyle } = useTeamStyle()
  const [day, setDay] = useState(todayIso)
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const rowsQuery = useQuery({
    queryKey: ['clock-ins', day],
    queryFn: () => fetchClockIns(day),
    // While an address is being looked up, look again — for a minute or two.
    refetchInterval: (query) =>
      (query.state.data ?? []).some(awaitingAddress) && query.state.dataUpdateCount < 24 ? 5_000 : false,
  })
  const teamsQuery = useQuery({ queryKey: ['clock-in-teams', day], queryFn: () => fetchClockInTeams(day) })
  const stillOutQuery = useQuery({
    queryKey: ['clock-in-still-out', day],
    queryFn: () => fetchStillOut(day),
    refetchInterval: day === todayIso() ? 60_000 : false,
  })
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  const peopleQuery = useQuery({ queryKey: ['people-options'], queryFn: fetchPeopleOptions })
  const personName = (id: string) => fullName(peopleQuery.data?.find((p) => p.id === id), 'Somebody')
  const historyQuery = useQuery({ queryKey: ['clock-in-history', day], queryFn: () => fetchClockInHistory(day) })
  const rows = useMemo(() => rowsQuery.data ?? [], [rowsQuery.data])
  // Each person's own lines in the day's history: how their time came, and every change to it.
  const historyOf = (uid: string) => (historyQuery.data ?? []).filter((e) => e.user_id === uid)
  const groups = groupClockIns(
    rows,
    teamsQuery.data ?? [],
    (id) => departmentsQuery.data?.find((d) => d.id === id)?.name ?? null,
    stillOutQuery.data ?? [],
  )

  // Anything still without an address is asked for once a visit; the
  // lookup itself goes one a second, whoever starts it.
  const asked = useRef(new Set<string>())
  useEffect(() => {
    const waiting = rows.filter(awaitingAddress).map((r) => r.id)
    if (waiting.length === 0 || waiting.every((id) => asked.current.has(id))) return
    waiting.forEach((id) => asked.current.add(id))
    lookUpAddresses()
  }, [rows])

  const refresh = async () => {
    setEditing(null)
    setAdding(false)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['clock-ins', day] }),
      queryClient.invalidateQueries({ queryKey: ['clock-in-teams', day] }),
      queryClient.invalidateQueries({ queryKey: ['clock-in-still-out', day] }),
      queryClient.invalidateQueries({ queryKey: ['clock-in-history', day] }),
    ])
  }

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <PageHeader
        eyebrow="Who has arrived"
        title="Clock In"
        description="Everybody on the day’s rota clocks in from their Dashboard when they arrive. Their phone is read once, there and then."
      />

      <div className="flex flex-col gap-5">
        {runsIt && <ClockInPlaceCard />}
        <ClockInRequests />

        <SectionTile
          title="Clock-ins"
          collapsible
          defaultOpen={false}
          hint={`${formatServiceDay(day)} · ${rows.length} clocked in${
            (stillOutQuery.data ?? []).length > 0
              ? ` · ${new Set((stillOutQuery.data ?? []).map((o) => o.user_id)).size} still to arrive`
              : ''
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-body-sm text-on-surface-variant">
              <span aria-hidden="true">Day</span>
              <DateField
                value={day}
                max={todayIso()}
                onChange={(next) => {
                  if (!next) return
                  setDay(next)
                  setEditing(null)
                  setAdding(false)
                }}
                label="Which day’s clock-ins"
                aria-label="Which day’s clock-ins"
              />
            </div>
            {runsIt && !adding && (
              <ActionButton tone="quiet" size="sm" onClick={() => setAdding(true)} glyph="+">
                Add a clock-in
              </ActionButton>
            )}
          </div>

          {runsIt && adding && (
            <AddClockIn day={day} rows={rows} timeZone={timeZone} onDone={refresh} onCancel={() => setAdding(false)} />
          )}

          <QueryState
            isLoading={rowsQuery.isLoading || teamsQuery.isLoading}
            error={rowsQuery.error ?? teamsQuery.error}
            isEmpty={groups.length === 0}
            emptyMessage="Nobody was due, and nobody has clocked in, on this day."
          >
            {/* A card a team, washed in its colour as the Team Rota's are,
                so the page reads at a glance: who is in, who is still to come. */}
            <ul aria-label={`Who clocked in on ${formatServiceDay(day)}`} className="mt-4 flex flex-col gap-3">
              {groups.map((group) => {
                const color = departmentsQuery.data?.find((d) => d.id === group.teamId)?.color ?? null
                const quiet = group.rows.length === 0
                return (
                  <li
                    key={group.teamId ?? 'none'}
                    aria-label={group.name}
                    className={`rounded-[var(--radius-panel)] px-4 py-4 sm:px-5 ${
                      quiet ? 'border border-dashed border-outline-variant' : 'bg-raised hairline'
                    }`}
                    style={quiet ? undefined : teamWash(color, teamStyle)}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="mt-1 h-9 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: color ?? 'var(--color-outline-variant)' }}
                      />
                      <div className="min-w-0 flex-1">
                        <h3 className="break-words text-body-lg font-semibold text-on-surface">{group.name}</h3>
                        <p className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
                          {group.rows.length} in
                          {group.stillOut.length > 0 && ` · ${group.stillOut.length} to come`}
                        </p>
                      </div>
                    </div>

                    {group.rows.length > 0 && (
                      <ul aria-label={`${group.name}: clocked in`} className="mt-3 flex flex-col divide-y divide-border-subtle">
                        {group.rows.map((row) => {
                          const name = fullName(row.person)
                          // Somebody on two teams is in two cards: the form opens in the one pressed.
                          const editKey = `${group.teamId ?? 'none'}:${row.id}`
                          const open = runsIt && editing === editKey
                          const theirs = historyOf(row.user_id)
                          const fixed = theirs.some((e) => e.kind === 'changed')
                          return (
                            <li
                              key={row.id}
                              className={`py-2.5 ${open ? 'rounded-[var(--radius-row)] bg-surface-lowest/60 px-2' : ''}`}
                            >
                              <div className="flex items-start gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="break-words text-body-sm font-medium text-on-surface">{name}</p>
                                <p className="break-words text-label-md text-on-surface-variant">
                                  {row.address ??
                                    (row.latitude === null
                                      ? row.method === 'request'
                                        ? 'No location given'
                                        : METHOD_LABEL[row.method]
                                      : awaitingAddress(row)
                                        ? 'Looking up the address…'
                                        : 'Address not found')}
                                </p>
                                <p className="font-mono text-label-sm text-on-surface-faint">
                                  {METHOD_LABEL[row.method]}
                                  {fixed && ' · time fixed'}
                                  {row.distance_m !== null && ` · ${formatDistance(row.distance_m)} from church`}
                                  {row.accuracy_m !== null && ` · ± ${Math.round(row.accuracy_m)} m`}
                                </p>
                              </div>
                              <span className="shrink-0 font-mono text-body-lg tabular-nums text-on-surface">
                                {churchClock(row.clocked_at, timeZone)}
                              </span>
                              {runsIt && (
                                <ActionButton
                                  tone="ghost"
                                  size="sm"
                                  aria-label={`Fix ${name}’s clock-in`}
                                  aria-expanded={open}
                                  onClick={() => setEditing(open ? null : editKey)}
                                >
                                  Fix
                                </ActionButton>
                              )}
                              </div>
                              {/* Right under the row pressed: below every card, it opened off the screen. */}
                              {open && (
                                <PutRight
                                  key={row.id}
                                  row={row}
                                  name={name}
                                  timeZone={timeZone}
                                  onDone={refresh}
                                  onCancel={() => setEditing(null)}
                                />
                              )}
                              {open && theirs.length > 0 && (
                                <div className="mt-3">
                                  <p className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
                                    Their clock-in history
                                  </p>
                                  <ul aria-label={`${name}’s clock-in history`} className="flex flex-col">
                                    {theirs.map((entry) => (
                                      <HistoryLine key={entry.id} entry={entry} timeZone={timeZone} />
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}

                    {group.stillOut.length > 0 && (
                      <div className="mt-3">
                        <p className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">Still to arrive</p>
                        <ul aria-label={`${group.name}: still to arrive`} className="mt-1.5 flex flex-wrap gap-1.5">
                          {group.stillOut.map((o) => (
                            <li
                              key={o.user_id}
                              className="rounded-full bg-surface-lowest/70 px-2.5 py-1 text-label-md text-on-surface hairline"
                            >
                              {personName(o.user_id)}{' '}
                              <span className="font-mono text-on-surface-faint">
                                {o.asked ? 'asked' : churchClock(o.call_at, timeZone)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
            {rows.some((r) => r.address) && (
              <p className="mt-3 text-label-sm text-on-surface-faint">Addresses © OpenStreetMap contributors</p>
            )}
          </QueryState>
        </SectionTile>

        <SectionTile
          title="History"
          collapsible
          defaultOpen={false}
          hint={`Every clock-in, and every change to one, on ${formatServiceDay(day)}${
            historyQuery.data ? ` · ${historyQuery.data.length} ${historyQuery.data.length === 1 ? 'entry' : 'entries'}` : ''
          }.`}
        >
          <QueryState
            isLoading={historyQuery.isLoading}
            error={historyQuery.error}
            isEmpty={(historyQuery.data ?? []).length === 0}
            emptyMessage="Nothing has happened on this day."
          >
            <ul className="flex flex-col">
              {(historyQuery.data ?? []).map((entry) => (
                <HistoryLine key={entry.id} entry={entry} timeZone={timeZone} />
              ))}
            </ul>
          </QueryState>
        </SectionTile>
      </div>
    </div>
  )
}

function PutRight({
  row,
  name,
  timeZone,
  onDone,
  onCancel,
}: {
  row: ClockIn
  name: string
  timeZone: string
  onDone: () => Promise<void>
  onCancel: () => void
}) {
  const errorText = useErrorText()
  const [mode, setMode] = useState<'time' | 'remove'>('time')
  const [time, setTime] = useState(() => churchClock(row.clocked_at, timeZone))
  const [note, setNote] = useState('')
  const save = useMutation({
    mutationFn: () =>
      mode === 'time'
        ? changeClockInTime(row.id, churchInstant(row.on_date, time, timeZone), note)
        : removeClockIn(row.id, note),
    onSuccess: onDone,
  })

  return (
    <form
      aria-label={`Fix ${name}’s clock-in`}
      className="mt-3 flex flex-col gap-3 rounded-[var(--radius-row)] bg-raised px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <p className="text-body-sm text-on-surface">
        {mode === 'time'
          ? `What time did ${name} arrive?`
          : `Take away ${name}’s clock-in? Present on their teams stays as it is; a head can still change it.`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {mode === 'time' && (
          <div className="w-full sm:w-44">
            <TimeField value={time} onChange={setTime} minuteStep={1} label="Arrived at" aria-label="Arrived at" />
          </div>
        )}
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="Why (kept in the history)"
          aria-label="Why"
          className={`${inputClasses} min-w-0 basis-full sm:basis-0 sm:flex-1`}
        />
      </div>
      {save.error && (
        <p role="alert" className="text-body-sm text-accent-red-soft">
          {errorText(save.error, 'Could not save that.')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <ActionButton
          type="submit"
          size="sm"
          tone={mode === 'remove' ? 'danger' : 'primary'}
          disabled={save.isPending || (mode === 'time' && !time)}
        >
          {save.isPending ? 'Saving…' : mode === 'time' ? 'Save the time' : 'Remove it'}
        </ActionButton>
        <ActionButton tone="quiet" size="sm" onClick={onCancel} disabled={save.isPending}>
          Cancel
        </ActionButton>
        <ActionButton
          tone="ghost"
          size="sm"
          onClick={() => setMode(mode === 'time' ? 'remove' : 'time')}
          disabled={save.isPending}
          className="sm:ml-auto"
        >
          {mode === 'time' ? 'Remove it instead' : 'Change the time instead'}
        </ActionButton>
      </div>
    </form>
  )
}

function AddClockIn({
  day,
  rows,
  timeZone,
  onDone,
  onCancel,
}: {
  day: string
  rows: ClockIn[]
  timeZone: string
  onDone: () => Promise<void>
  onCancel: () => void
}) {
  const errorText = useErrorText()
  const peopleQuery = useQuery({ queryKey: ['people-options'], queryFn: fetchPeopleOptions })
  const [person, setPerson] = useState('')
  const [time, setTime] = useState(() => (day === todayIso() ? churchClock(new Date().toISOString(), timeZone) : ''))
  const [note, setNote] = useState('')
  const save = useMutation({
    mutationFn: () => addClockIn(person, churchInstant(day, time, timeZone), note),
    onSuccess: onDone,
  })
  const options = (peopleQuery.data ?? []).map((p) => ({ value: p.id, label: fullName(p) }))
  // Already in that day: saving moves their time, and the history keeps both (0229).
  const already = person ? rows.find((r) => r.user_id === person) ?? null : null

  return (
    <form
      aria-label="Add a clock-in"
      className="mt-3 flex flex-col gap-3 rounded-[var(--radius-row)] bg-raised px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <p className="text-body-sm text-on-surface">
        For somebody whose phone would not clock them in. They are marked Present on their teams that day.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 basis-full sm:basis-64">
          <Select value={person} onChange={setPerson} options={options} placeholder="Who" aria-label="Who arrived" />
        </div>
        <div className="w-full sm:w-44">
            <TimeField value={time} onChange={setTime} minuteStep={1} label="Arrived at" aria-label="Arrived at" />
          </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="Why (kept in the history)"
          aria-label="Why"
          className={`${inputClasses} min-w-0 basis-full sm:basis-0 sm:flex-1`}
        />
      </div>
      {already && (
        <p role="note" className="text-body-sm text-on-surface-variant">
          Already clocked in at{' '}
          <span className="font-mono tabular-nums text-on-surface">{churchClock(already.clocked_at, timeZone)}</span> ·{' '}
          {METHOD_LABEL[already.method].toLowerCase()}. Saving changes it to the time above, and the history keeps both.
        </p>
      )}
      {save.error && (
        <p role="alert" className="text-body-sm text-accent-red-soft">
          {errorText(save.error, 'Could not add that.')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <ActionButton type="submit" size="sm" disabled={save.isPending || !person || !time}>
          {already ? (save.isPending ? 'Changing…' : 'Change the time') : save.isPending ? 'Adding…' : 'Add'}
        </ActionButton>
        <ActionButton tone="quiet" size="sm" onClick={onCancel} disabled={save.isPending}>
          Cancel
        </ActionButton>
      </div>
    </form>
  )
}

const KIND_WORDS: Record<ClockInHistoryEntry['kind'], string> = {
  clocked_in: 'clocked in',
  approved: 'clocked in by request',
  added: 'clock-in added by hand',
  changed: 'time fixed by hand',
  removed: 'clock-in removed',
}

function HistoryLine({ entry, timeZone }: { entry: ClockInHistoryEntry; timeZone: string }) {
  const who = fullName(entry.person, 'Somebody no longer on the app')
  const by =
    entry.changed_by && entry.changed_by !== entry.user_id
      ? ` · by ${fullName(entry.changer, 'somebody no longer on the app')}`
      : ''
  const times =
    entry.kind === 'changed' && entry.previous_at && entry.clocked_at
      ? `${churchClock(entry.previous_at, timeZone)} → ${churchClock(entry.clocked_at, timeZone)}`
      : entry.kind === 'removed' && entry.previous_at
        ? `was ${churchClock(entry.previous_at, timeZone)}`
        : entry.clocked_at
          ? churchClock(entry.clocked_at, timeZone)
          : null
  return (
    <li className="border-t border-border-subtle py-2.5 first:border-t-0">
      <p className="text-body-sm text-on-surface">
        <span className="font-medium">{who}</span> {KIND_WORDS[entry.kind]}
        {times && <span className="font-mono tabular-nums text-on-surface-variant"> · {times}</span>}
        <span className="text-on-surface-variant">{by}</span>
      </p>
      {entry.note && <p className="mt-0.5 text-label-md text-on-surface-variant">“{entry.note}”</p>}
      <p className="mt-0.5 text-label-sm text-on-surface-faint">{formatRelativeTime(entry.changed_at)}</p>
    </li>
  )
}
