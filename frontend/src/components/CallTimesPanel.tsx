import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { Chevron } from './Collapsible'
import { Eyebrow, Tile } from './Surface'
import { Select, selectPillClasses, type SelectItem } from './Select'
import { ServiceCountdown } from './ServiceCountdown'
import { TeamMark } from './TeamMark'
import { teamWash } from '../lib/teamGradient'
import { useTeamStyle } from '../lib/useTeamStyle'
import { useErrorText } from '../lib/useErrorText'
import { combineDateAndTime, formatTime, timeInputValue } from '../lib/time'
import { formatServiceDay } from '../lib/sunday'
import {
  DEFAULT_CALL_TIME,
  effectiveCallTime,
  myNextCallTime,
  orderTeamsForCallTimes,
} from '../lib/callTimes'

/**
 * When each team is due at the building, at the top of the rota.
 *
 * The rota answers "who is on"; this answers the question a volunteer
 * actually asks on a Saturday night, which is "what time do I need to be
 * there". Those are different questions, and the second one has been going
 * around WhatsApp because the app could not answer it: the table has been
 * in the schema since the first migration with nothing on either side of
 * it — no way to set a call time and nothing that read one.
 *
 * Every team is here, not only yours. Knowing that Worship is called at
 * eight is how the person opening up knows who will be at the door, and
 * the database has always said as much: any signed-in person may read a
 * call time. Setting one stays with the team — its Head, its Assisting
 * Head, or an Admin.
 *
 * Only your own teams get a countdown. A running clock is a claim on your
 * attention, and eight of them at once is a claim nobody can honour; the
 * rest are a time on a page, which is all they need to be.
 *
 * A team nobody has set is due at seven, and says so. The alternative was
 * eight tiles reading "--:--" until somebody filled them in, which is a
 * feature that does not work on the day it ships and therefore never gets
 * used. The panel marks a default as a default, so "we have not decided"
 * and "we decided seven" stay different facts.
 *
 * Shut by default. It is the answer to a question asked once a week, and
 * the rota underneath it is what the page is for.
 */

const CallTimeRows = z.array(
  z.object({
    department_id: z.string(),
    service_id: z.string(),
    call_time: z.string(),
  }),
)

export interface CallTimesService {
  id: string
  date: string
  service_type: string
}

export interface CallTimesTeam {
  id: string
  name: string
  color: string | null
}

export function CallTimesPanel({
  services,
  teams,
  myTeamIds,
  canManage,
}: {
  /** The upcoming services, soonest first. The first is the one that opens. */
  services: CallTimesService[]
  /** Every team in the church — this panel is not scoped to your own. */
  teams: CallTimesTeam[]
  /** The teams you actually serve on, which is what earns a countdown. */
  myTeamIds: Set<string>
  canManage: (departmentId: string) => boolean
}) {
  const { teamStyle } = useTeamStyle()
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // The next service, unless somebody has picked another. Held as null
  // rather than seeded, so the panel follows the rota forward on its own
  // once a Sunday is over instead of pinning itself to a past date.
  const service = services.find((s) => s.id === chosen) ?? services[0] ?? null

  const callTimes = useQuery({
    queryKey: ['call-times', service?.id],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('department_call_times')
        .select('department_id, service_id, call_time')
        .eq('service_id', service!.id)
      if (err) throw err
      return CallTimeRows.parse(data)
    },
    enabled: !!service,
  })

  const rows = useMemo(() => callTimes.data ?? [], [callTimes.data])
  const ordered = useMemo(
    () => (service ? orderTeamsForCallTimes(teams, rows, myTeamIds, service.date) : teams),
    [teams, rows, myTeamIds, service],
  )
  const mine = service ? myNextCallTime(rows, myTeamIds, service.date) : null

  const save = useMutation({
    mutationFn: async ({ departmentId, at }: { departmentId: string; at: string | null }) => {
      if (!service) return
      if (at === null) {
        const { error: err } = await supabase
          .from('department_call_times')
          .delete()
          .eq('service_id', service.id)
          .eq('department_id', departmentId)
        if (err) throw err
        return
      }
      const { error: err } = await supabase.from('department_call_times').upsert(
        { service_id: service.id, department_id: departmentId, call_time: at },
        { onConflict: 'department_id,service_id' },
      )
      if (err) throw err
    },
    onSuccess: () => {
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['call-times', service?.id] })
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not save that call time.')),
  })

  if (!service) return null

  const serviceOptions: SelectItem[] = services.map((s) => ({
    value: s.id,
    label: `${s.service_type} — ${formatServiceDay(s.date)}`,
  }))

  return (
    <Tile as="section" padded={false} className="mb-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="call-times-body"
        className="flex w-full items-center gap-3 px-5 py-5 text-left sm:px-7"
      >
        <div className="min-w-0 flex-1">
          <Eyebrow>Call times</Eyebrow>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            {service.service_type} · {formatServiceDay(service.date)}
          </p>
        </div>

        {/* Shut, the panel still answers the one question that is yours:
            a head who runs a team but does not serve on it has no personal
            call time, and gets the count of teams instead of a made-up one. */}
        {mine ? (
          <span className="flex shrink-0 flex-col items-end gap-0.5">
            <span className="font-mono text-headline-sm tabular leading-none text-on-surface">
              {formatTime(mine.at)}
            </span>
            <ServiceCountdown startsAt={mine.at} label="until your call" />
          </span>
        ) : (
          <span className="shrink-0 font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
            {rows.length} of {teams.length} set
          </span>
        )}
        <Chevron open={open} />
      </button>

      {open && (
        <div id="call-times-body" className="px-5 pb-6 sm:px-7">
          {services.length > 1 && (
            <div className="mb-4 flex items-center gap-2">
              <span className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
                For
              </span>
              <Select
                value={service.id}
                onChange={setChosen}
                options={serviceOptions}
                aria-label="Which service"
                className={selectPillClasses}
              />
            </div>
          )}

          {error && (
            <p className="mb-4 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
              {error}
            </p>
          )}

          <ul className="grid gap-3 sm:grid-cols-2">
            {ordered.map((team) => {
              const { at, isDefault } = effectiveCallTime(rows, team.id, service.date)
              const isMine = myTeamIds.has(team.id)
              return (
                <li
                  key={team.id}
                  // Yours runs the full width and carries the big clock —
                  // it is the one you came for.
                  className={`rounded-[var(--radius-row)] bg-raised p-4 ${
                    isMine ? 'sm:col-span-2' : ''
                  }`}
                  style={teamWash(team.color, teamStyle)}
                >
                  <div className="flex items-center gap-2.5">
                    <TeamMark color={team.color} />
                    <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-on-surface">
                      {team.name}
                    </span>
                    {isMine && (
                      <span className="shrink-0 rounded-full bg-surface-container px-2 py-0.5 font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
                        Yours
                      </span>
                    )}
                  </div>

                  <p
                    className={`mt-2 font-mono tabular leading-none ${
                      isMine
                        ? 'text-[clamp(40px,11vw,60px)] tracking-[-0.03em]'
                        : 'text-[clamp(28px,7vw,36px)] tracking-[-0.02em]'
                    } ${isDefault ? 'text-on-surface-variant' : 'text-on-surface'}`}
                  >
                    {formatTime(at)}
                  </p>

                  {isMine && (
                    <div className="mt-2">
                      <ServiceCountdown startsAt={at} label="until your call" />
                    </div>
                  )}
                  {isDefault && (
                    <p className="mt-1.5 text-label-sm text-on-surface-faint">
                      The usual {DEFAULT_CALL_TIME} — nobody has set one for this service.
                    </p>
                  )}

                  {canManage(team.id) && (
                    <CallTimeField
                      date={service.date}
                      current={isDefault ? null : at}
                      busy={save.isPending}
                      teamName={team.name}
                      onSave={(value) => save.mutate({ departmentId: team.id, at: value })}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </Tile>
  )
}

/**
 * The setter, for whoever runs this team.
 *
 * A bare time input that saved on every keystroke would write 03:00 on the
 * way to 03:30, and a call time is something a whole team reads — so it
 * takes a deliberate Save. Clearing it is its own button rather than an
 * empty field, because an empty field is also what a half-finished edit
 * looks like.
 */
function CallTimeField({
  date,
  current,
  busy,
  teamName,
  onSave,
}: {
  date: string
  current: string | null
  busy: boolean
  teamName: string
  onSave: (value: string | null) => void
}) {
  // Seeded with the default, so setting a call time is nudging seven
  // o'clock rather than typing a time into an empty box.
  const [draft, setDraft] = useState(() =>
    current ? timeInputValue(current) : DEFAULT_CALL_TIME,
  )
  const saved = current ? timeInputValue(current) : DEFAULT_CALL_TIME
  const dirty = draft !== saved

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
      <input
        type="time"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        aria-label={`Call time for ${teamName}`}
        className="rounded-[var(--radius-chip)] bg-surface-lowest px-3 py-1.5 font-mono text-body-sm text-on-surface hairline focus:outline-none focus-visible:shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]"
      />
      <button
        type="button"
        disabled={!dirty || draft === '' || busy}
        onClick={() => onSave(combineDateAndTime(date, draft))}
        className="tap rounded-full bg-primary px-3.5 py-1.5 text-label-sm font-medium text-on-primary transition-transform duration-300 ease-[var(--ease-glide)] active:scale-[0.98] disabled:opacity-40"
      >
        Save
      </button>
      {current && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setDraft(DEFAULT_CALL_TIME)
            onSave(null)
          }}
          className="tap rounded-full px-2.5 py-1.5 text-label-sm text-on-surface-variant transition-colors hover:text-error disabled:opacity-40"
        >
          Back to {DEFAULT_CALL_TIME}
        </button>
      )}
    </div>
  )
}
