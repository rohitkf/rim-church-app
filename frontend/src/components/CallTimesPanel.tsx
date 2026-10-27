import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { Chevron } from './Collapsible'
import { IconBadge, Tile } from './Surface'
import { TimerIcon } from './icons'
import { Select, selectPillClasses, type SelectItem } from './Select'
import { ServiceCountdown } from './ServiceCountdown'
import { TeamMark } from './TeamMark'
import { TimeField } from './DateTimeFields'
import { teamWash } from '../lib/teamGradient'
import { useTeamStyle } from '../lib/useTeamStyle'
import { useErrorText } from '../lib/useErrorText'
import { formatServiceDay, shortServiceDay } from '../lib/sunday'
import {
  DEFAULT_CALL_TIME,
  callTimeRowSchema,
  effectiveCallTime,
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
      return callTimeRowSchema.array().parse(data)
    },
    enabled: !!day,
  })

  const rows = useMemo(() => callTimes.data ?? [], [callTimes.data])
  const ordered = useMemo(
    () => (day ? orderTeamsForCallTimes(teams, rows, myTeamIds, day.date) : teams),
    [teams, rows, myTeamIds, day],
  )

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
  const myTeams = ordered.filter((t) => myTeamIds.has(t.id))
  const others = ordered.filter((t) => !myTeamIds.has(t.id))

  /** Yours: the clock you came for, large, with its countdown. */
  const mineRow = (team: CallTimesTeam) => {
    const { clock, at, isDefault } = effectiveCallTime(rows, team.id, day.date)
    return (
      <li
        key={team.id}
        // `overflow-hidden` so a wash and a long team name both stay inside
        // the corners.
        className="min-w-0 overflow-hidden rounded-[var(--radius-row)] bg-surface-lowest p-4 hairline"
        style={teamWash(team.color, teamStyle)}
      >
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 shrink-0">
            <TeamMark color={team.color} />
          </span>
          <span className="min-w-0 flex-1 break-words text-body-sm font-medium text-on-surface">{team.name}</span>
        </div>
        <p
          className={`mt-2 font-mono text-[clamp(36px,10vw,52px)] tabular leading-none tracking-[-0.02em] ${
            isDefault ? 'text-on-surface-variant' : 'text-on-surface'
          }`}
        >
          {clock}
        </p>
        <div className="mt-2">
          <ServiceCountdown startsAt={at} label="until your call" />
        </div>
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
  }

  /** Everybody else's: a name and a time, a row in a list. */
  const otherRow = (team: CallTimesTeam) => {
    const { clock, isDefault } = effectiveCallTime(rows, team.id, day.date)
    return (
      <li key={team.id} className="min-w-0 py-3">
        <div className="flex items-center gap-2.5">
          <TeamMark color={team.color} />
          <span className="min-w-0 flex-1 break-words text-body-sm text-on-surface">{team.name}</span>
          <span className={`font-mono text-body-lg tabular ${isDefault ? 'text-on-surface-variant' : 'text-on-surface'}`}>
            {clock}
          </span>
        </div>
        {isDefault && (
          <p className="mt-1 break-words pl-[22px] text-label-sm text-on-surface-faint">
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
  }

  return (
    /*
     * Its own kind of card: tinted blue with a clock on it, so it reads as
     * "when to be there" before a word of it is read, and never as one more
     * service in the rota below. Your own teams are open on it; the rest of
     * the church's are a tap away, because they are for whoever opens up,
     * not for everybody.
     */
    <section aria-label="Call times">
      <Tile as="div" tone="accent" padded={false} className="mb-5 overflow-hidden">
        <div className="px-5 pt-5 sm:px-7 sm:pt-6">
          <div className="flex items-start gap-3">
            <IconBadge icon={TimerIcon} tone="blue" />
            <div className="min-w-0 flex-1">
              <h2 className="text-headline-sm text-on-surface">Call times</h2>
              <p className="mt-0.5 break-words text-body-sm text-on-surface-variant">{formatServiceDay(day.date)}</p>
              {/* The services are context, not a thing to choose between:
                  one call time covers all of them. */}
              <p className="mt-0.5 break-words text-label-sm text-on-surface-variant">
                <span className="text-on-surface-faint">Services this day: </span>
                {day.services.map((s) => s.service_type).join(' · ')}
              </p>
            </div>
          </div>

          {days.length > 1 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">Day</span>
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
            <p className="mt-3 break-words rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
              {error}
            </p>
          )}
        </div>

        {myTeams.length > 0 && (
          <ul aria-label="Your teams" className="mt-4 grid gap-3 px-5 sm:grid-cols-2 sm:px-7">
            {myTeams.map(mineRow)}
          </ul>
        )}

        {others.length > 0 ? (
          <div className="mt-4 border-t border-border-subtle">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="call-times-others"
              className="tap flex w-full items-center gap-3 px-5 py-4 text-left sm:px-7"
            >
              <span className="min-w-0 flex-1 text-body-md font-medium text-on-surface">
                {myTeams.length > 0 ? 'Other teams' : 'Every team'}
              </span>
              <span className="rounded-full bg-raised-strong px-2 py-0.5 font-mono text-label-sm tabular text-on-surface-variant">
                {others.length}
              </span>
              <span className="text-body-lg">
                <Chevron open={open} />
              </span>
            </button>
            {open && (
              <ul id="call-times-others" className="divide-y divide-border-subtle px-5 pb-3 sm:px-7">
                {others.map(otherRow)}
              </ul>
            )}
          </div>
        ) : (
          <div className="pb-5" />
        )}
      </Tile>
    </section>
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
      <TimeField
        value={draft}
        onChange={setDraft}
        label={`Call time for ${teamName}`}
        aria-label={`Call time for ${teamName}`}
        className="inline-flex min-w-0 items-center gap-2 rounded-[var(--radius-chip)] bg-surface-lowest px-3 py-1.5 font-mono text-body-sm text-on-surface hairline focus:outline-none focus-visible:shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]"
      />
      <button
        type="button"
        disabled={!dirty || draft === '' || busy}
        onClick={() => onSave(draft)}
        className="tap shrink-0 rounded-full bg-primary px-3.5 py-1.5 text-label-sm font-semibold text-on-primary transition-transform duration-300 ease-[var(--ease-glide)] active:scale-[0.97] active:duration-[80ms] disabled:opacity-40"
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
