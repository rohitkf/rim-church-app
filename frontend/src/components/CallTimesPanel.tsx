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
import { formatServiceDay, shortServiceDay } from '../lib/sunday'
import {
  DEFAULT_CALL_TIME,
  effectiveCallTime,
  myNextCallTime,
  orderTeamsForCallTimes,
  type ServiceDay,
} from '../lib/callTimes'

/**
 * When each team is due at the building, at the top of the rota.
 *
 * The rota answers "who is on". This answers the question a volunteer
 * actually asks on a Saturday night, which is "what time do I need to be
 * there" — and it is a question about the morning, not about a service.
 * The volunteers come in once and set the building up; then the day runs,
 * English service and Malayalam service both. One call time per team per
 * day, which is why the services are named here rather than picked from.
 *
 * Every team is here, not only yours. Knowing that Worship is called at
 * eight is how whoever opens up knows who to expect at the door, and the
 * database has always said as much: any signed-in person may read a call
 * time. Setting one stays with the team — its Head, its Assisting Head,
 * or an Admin.
 *
 * Only your own teams get a countdown. A running clock is a claim on your
 * attention, and eight at once is a claim nobody can honour; the rest are
 * a time on a page, which is all they need to be.
 *
 * A team nobody has set is due at seven and says so, so the panel is
 * right on the day it ships rather than eight blanks waiting to be filled.
 *
 * Everything stacks. The first version put the day, the clock and the
 * countdown in one row, which on a phone wrapped the day into a four-line
 * column with the clock jammed against it — so this one goes down the
 * page and wraps, and nothing is ever pushed off the side.
 */

const CallTimeRows = z.array(
  z.object({
    department_id: z.string(),
    on_date: z.string(),
    call_time: z.string(),
  }),
)

export interface CallTimesTeam {
  id: string
  name: string
  color: string | null
}

export function CallTimesPanel({
  days,
  teams,
  myTeamIds,
  canManage,
}: {
  /** The days ahead that have something on, soonest first. */
  days: ServiceDay[]
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

  // The next day, unless somebody has picked another. Held as null rather
  // than seeded, so the panel follows the rota forward on its own once a
  // Sunday is over instead of pinning itself to a past date.
  const day = days.find((d) => d.date === chosen) ?? days[0] ?? null

  const callTimes = useQuery({
    queryKey: ['call-times', day?.date],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('department_call_times')
        .select('department_id, on_date, call_time')
        .eq('on_date', day!.date)
      if (err) throw err
      return CallTimeRows.parse(data)
    },
    enabled: !!day,
  })

  const rows = useMemo(() => callTimes.data ?? [], [callTimes.data])
  const ordered = useMemo(
    () => (day ? orderTeamsForCallTimes(teams, rows, myTeamIds, day.date) : teams),
    [teams, rows, myTeamIds, day],
  )
  const mine = day ? myNextCallTime(rows, myTeamIds, day.date) : null

  const save = useMutation({
    mutationFn: async ({ departmentId, clock }: { departmentId: string; clock: string | null }) => {
      if (!day) return
      if (clock === null) {
        const { error: err } = await supabase
          .from('department_call_times')
          .delete()
          .eq('on_date', day.date)
          .eq('department_id', departmentId)
        if (err) throw err
        return
      }
      const { error: err } = await supabase.from('department_call_times').upsert(
        { on_date: day.date, department_id: departmentId, call_time: clock },
        { onConflict: 'department_id,on_date' },
      )
      if (err) throw err
    },
    onSuccess: () => {
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['call-times', day?.date] })
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not save that call time.')),
  })

  if (!day) return null

  const dayOptions: SelectItem[] = days.map((d) => ({
    value: d.date,
    label: shortServiceDay(d.date),
  }))

  return (
    <Tile as="section" padded={false} className="mb-5 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="call-times-body"
        className="flex w-full items-start gap-3 px-5 py-5 text-left sm:px-7"
      >
        <div className="min-w-0 flex-1">
          <Eyebrow>Call times</Eyebrow>
          <p className="mt-1.5 break-words text-body-md text-on-surface">
            {formatServiceDay(day.date)}
          </p>

          {/* The services are context, not a thing to choose between: one
              call time covers all of them. */}
          <p className="mt-1 break-words text-label-sm text-on-surface-variant">
            <span className="text-on-surface-faint">Services this day: </span>
            {day.services.map((s) => s.service_type).join(' · ')}
          </p>

          {/* Your own, on its own lines underneath. This used to sit beside
              the date, which on a phone squeezed the date into a column
              four words wide and put the clock through it. */}
          {mine && (
            <div className="mt-3 border-t border-border-subtle pt-3">
              <p className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
                Your call time
              </p>
              <p className="mt-0.5 font-mono text-headline-md tabular leading-none text-on-surface">
                {mine.clock}
              </p>
              <div className="mt-1.5">
                <ServiceCountdown startsAt={mine.at} label="until your call" />
              </div>
            </div>
          )}
        </div>
        <span className="mt-1 shrink-0">
          <Chevron open={open} />
        </span>
      </button>

      {open && (
        <div id="call-times-body" className="px-5 pb-6 sm:px-7">
          {days.length > 1 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
                Day
              </span>
              <Select
                value={day.date}
                onChange={setChosen}
                options={dayOptions}
                aria-label="Which day"
                className={selectPillClasses}
              />
            </div>
          )}

          {error && (
            <p className="mb-4 break-words rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
              {error}
            </p>
          )}

          <ul className="grid gap-3 sm:grid-cols-2">
            {ordered.map((team) => {
              const { clock, at, isDefault } = effectiveCallTime(rows, team.id, day.date)
              const isMine = myTeamIds.has(team.id)
              return (
                <li
                  key={team.id}
                  // Yours runs the full width and carries the big clock —
                  // it is the one you came for. `overflow-hidden` so a wash
                  // and a long team name both stay inside the corners.
                  className={`min-w-0 overflow-hidden rounded-[var(--radius-row)] bg-raised p-4 ${
                    isMine ? 'sm:col-span-2' : ''
                  }`}
                  style={teamWash(team.color, teamStyle)}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 shrink-0">
                      <TeamMark color={team.color} />
                    </span>
                    <span className="min-w-0 flex-1 break-words text-body-sm font-medium text-on-surface">
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
                      isMine ? 'text-[clamp(36px,10vw,52px)]' : 'text-[clamp(26px,6vw,32px)]'
                    } tracking-[-0.02em] ${
                      isDefault ? 'text-on-surface-variant' : 'text-on-surface'
                    }`}
                  >
                    {clock}
                  </p>

                  {isMine && (
                    <div className="mt-2">
                      <ServiceCountdown startsAt={at} label="until your call" />
                    </div>
                  )}
                  {isDefault && (
                    <p className="mt-1.5 break-words text-label-sm text-on-surface-faint">
                      The usual {DEFAULT_CALL_TIME} — nobody has set one for this day.
                    </p>
                  )}

                  {canManage(team.id) && (
                    <CallTimeField
                      current={isDefault ? null : clock}
                      busy={save.isPending}
                      teamName={team.name}
                      onSave={(value) => save.mutate({ departmentId: team.id, clock: value })}
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
 * takes a deliberate Save.
 */
function CallTimeField({
  current,
  busy,
  teamName,
  onSave,
}: {
  current: string | null
  busy: boolean
  teamName: string
  onSave: (value: string | null) => void
}) {
  // Seeded with the default, so setting a call time is nudging seven
  // o'clock rather than typing a time into an empty box.
  const [draft, setDraft] = useState(() => current ?? DEFAULT_CALL_TIME)
  const saved = current ?? DEFAULT_CALL_TIME
  const dirty = draft !== saved

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
      <input
        type="time"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        aria-label={`Call time for ${teamName}`}
        className="min-w-0 rounded-[var(--radius-chip)] bg-surface-lowest px-3 py-1.5 font-mono text-body-sm text-on-surface hairline focus:outline-none focus-visible:shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]"
      />
      <button
        type="button"
        disabled={!dirty || draft === '' || busy}
        onClick={() => onSave(draft)}
        className="tap shrink-0 rounded-full bg-primary px-3.5 py-1.5 text-label-sm font-medium text-on-primary transition-transform duration-300 ease-[var(--ease-glide)] active:scale-[0.98] disabled:opacity-40"
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
          className="tap shrink-0 rounded-full px-2.5 py-1.5 text-label-sm text-on-surface-variant transition-colors hover:text-error disabled:opacity-40"
        >
          Back to {DEFAULT_CALL_TIME}
        </button>
      )}
    </div>
  )
}
