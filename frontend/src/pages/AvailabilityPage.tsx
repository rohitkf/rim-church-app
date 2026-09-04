import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { PageHeader } from '../components/Surface'
import { fetchDepartments, fetchOwnDepartmentIds, fetchServices } from '../lib/queries'
import { todayIso } from '../lib/monthGrid'
import { formatServiceDay } from '../lib/sunday'
import { TeamMark } from '../components/TeamMark'
import { NudgeButton } from '../components/NudgeButton'
import { useFinishedServices } from '../lib/useFinishedServices'
import { useAppSettings } from '../lib/appSettings'
import { LOOKAHEAD_DAYS, servicesAhead, servicesToShow, shiftIsoDays } from '../lib/rotaWindow'
import {
  availabilityWindowDays,
  opensByDefault,
  splitAvailabilityGroups,
} from '../lib/availabilityWindow'
import { Chevron, useExpanded } from '../components/Collapsible'
import { teamWash } from '../lib/teamGradient'
import { useTeamStyle } from '../lib/useTeamStyle'
import { availabilitySummary } from '../lib/availabilitySummary'
import { useErrorText } from '../lib/useErrorText'
import {
  availabilityRowSchema,
  departmentMemberRowSchema,
  type AvailabilityRow,
  type AvailabilityStatus,
  type DepartmentMemberRow,
} from '../lib/types'
import { Select } from '../components/Select'

/**
 * Three answers, one tap.
 *
 * A volunteer answers this on a phone, standing up, in a hurry — so it is a
 * segmented control rather than three buttons: one object, thumb-sized
 * targets, and the answer you gave is the one that is filled in. The short
 * labels are deliberate; "Can't make it" doesn't fit a third of a phone.
 */
const STATUS_OPTIONS: {
  value: AvailabilityStatus
  label: string
  full: string
  activeClass: string
}[] = [
  { value: 'available', label: 'Yes', full: 'Available', activeClass: 'bg-accent-green text-accent-green-ink' },
  { value: 'tentative', label: 'Maybe', full: 'Tentative', activeClass: 'bg-accent-orange text-accent-green-ink' },
  { value: 'unavailable', label: 'No', full: "Can't make it", activeClass: 'bg-accent-red text-white' },
]

const statusLabel: Record<AvailabilityStatus, string> = {
  available: 'Available',
  tentative: 'Tentative',
  unavailable: "Can't make it",
}

const statusTextClass: Record<AvailabilityStatus, string> = {
  available: 'text-success',
  tentative: 'text-warning',
  unavailable: 'text-error',
}

async function fetchAvailability(serviceIds: string[]): Promise<AvailabilityRow[]> {
  if (serviceIds.length === 0) return []
  const { data, error } = await supabase.from('availability').select('*').in('service_id', serviceIds)
  if (error) throw error
  return z.array(availabilityRowSchema).parse(data)
}

async function fetchMembers(departmentIds: string[]): Promise<DepartmentMemberRow[]> {
  if (departmentIds.length === 0) return []
  const { data, error } = await supabase
    .from('department_members')
    .select('*, profiles(id, first_name, last_name, email, phone, avatar_url)')
    .in('department_id', departmentIds)
  if (error) throw error
  return z.array(departmentMemberRowSchema).parse(data)
}

export function AvailabilityPage() {
  const { session, isAdmin, isDepartmentHead } = useAuth()
  const { teamStyle } = useTeamStyle()
  const errorText = useErrorText()
  const myId = session?.user.id
  const queryClient = useQueryClient()
  const today = todayIso()
  const settings = useAppSettings()

  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: fetchServices })
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  const ownDeptsQuery = useQuery({
    queryKey: ['own-departments', myId],
    queryFn: () => fetchOwnDepartmentIds(myId!),
    enabled: !!myId,
  })

  // Everything still to come, out to the look-ahead. Which of these have
  // finished decides the window, so it is worked out on the wider list and
  // the window is drawn from the answer.
  const candidates = useMemo(() => {
    const horizon = shiftIsoDays(today, LOOKAHEAD_DAYS)
    return servicesAhead(servicesQuery.data ?? [], today).filter((s) => s.date <= horizon)
  }, [servicesQuery.data, today])

  // A service that has happened can no longer be answered for, so it drops
  // below the ones that still need an answer rather than sitting at the top
  // of the page asking for something nobody can give.
  const { isFinished } = useFinishedServices(candidates.map((s) => s.id))
  /*
   * `isExpanded` here means "toggled away from what this service does on
   * its own", not "open": what opens by default depends on which group a
   * service is in, and a single set of ids cannot carry both facts.
   */
  const { isExpanded: isToggled, toggle: toggleService } = useExpanded()

  // Three weeks, not the rota's week. Availability is asked in advance —
  // somebody knows in the second week of the month that they are away on
  // the fourth Sunday, and a page showing only this week gives them
  // nowhere to say so until it has stopped being useful.
  const listed = useMemo(
    () =>
      servicesToShow(candidates, today, {
        days: availabilityWindowDays(settings.rota_window_days),
        isFinished,
      }),
    [candidates, today, isFinished, settings],
  )

  // In date order, so the split below can draw its line at a day. The old
  // sort pushed finished services to the bottom of one flat list; they now
  // stay on their own day, above the line, where the eye expects them.
  const upcoming = useMemo(
    () => [...listed].sort((a, b) => a.date.localeCompare(b.date)),
    [listed],
  )
  const upcomingIds = useMemo(() => upcoming.map((s) => s.id), [upcoming])
  const groups = useMemo(() => splitAvailabilityGroups(upcoming, isFinished), [upcoming, isFinished])

  // Teams shown here: the ones you belong to or lead. Admins get every
  // team, so the check-ins they can record match the teams the dashboard
  // counts — otherwise a team they aren't a member of would sit forever
  // as "still to check in" with no way to resolve it.
  const myDepartments = useMemo(() => {
    const all = departmentsQuery.data ?? []
    if (isAdmin) return all
    const mine = new Set(ownDeptsQuery.data ?? [])
    return all.filter(
      (d) => mine.has(d.id) || isDepartmentHead(d.id),
    )
  }, [departmentsQuery.data, ownDeptsQuery.data, isAdmin, isDepartmentHead])

  const availabilityQuery = useQuery({
    queryKey: ['availability', 'tracker', upcomingIds],
    queryFn: () => fetchAvailability(upcomingIds),
    enabled: upcomingIds.length > 0,
  })

  // Rosters for every team shown: they're the denominator of each team's
  // availability bar, and the name-by-name list heads and Admins expand.
  const myDepartmentIds = useMemo(() => myDepartments.map((d) => d.id), [myDepartments])
  const membersQuery = useQuery({
    queryKey: ['availability-members', myDepartmentIds],
    queryFn: () => fetchMembers(myDepartmentIds),
    enabled: myDepartmentIds.length > 0,
  })

  // Only heads and Admins get the per-person breakdown.
  const ledDepartmentIds = useMemo(
    () =>
      myDepartments
        .filter(
          (d) =>
            isAdmin || isDepartmentHead(d.id),
        )
        .map((d) => d.id),
    [myDepartments, isAdmin, isDepartmentHead],
  )

  // Admins are here to watch the numbers, not to answer for themselves:
  // they see every team, and a row of buttons on each one is noise on a
  // page they use for oversight.
  const canAnswer = !isAdmin
  const [overrideError, setOverrideError] = useState<string | null>(null)

  const setAvailability = useMutation({
    mutationFn: async ({
      serviceId,
      departmentId,
      status,
    }: {
      serviceId: string
      departmentId: string
      status: AvailabilityStatus
    }) => {
      const { error } = await supabase.from('availability').upsert(
        { user_id: myId, service_id: serviceId, department_id: departmentId, status },
        { onConflict: 'user_id,service_id,department_id' },
      )
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['availability'] }),
  })

  // Admins don't answer for themselves here, but they do sometimes have to
  // record an answer someone gave them another way — a phone call on the
  // day — or correct one. RLS and the availability guard already allow an
  // Admin, and only an Admin, to write another person's row.
  const setForMember = useMutation({
    mutationFn: async ({
      answerId,
      userId,
      serviceId,
      departmentId,
      status,
    }: {
      answerId: string | null
      userId: string
      serviceId: string
      departmentId: string
      status: AvailabilityStatus | null
    }) => {
      if (status === null) {
        if (!answerId) return
        const { error } = await supabase.from('availability').delete().eq('id', answerId)
        if (error) throw error
        return
      }
      const { error } = await supabase.from('availability').upsert(
        { user_id: userId, service_id: serviceId, department_id: departmentId, status },
        { onConflict: 'user_id,service_id,department_id' },
      )
      if (error) throw error
    },
    onSuccess: () => {
      setOverrideError(null)
      queryClient.invalidateQueries({ queryKey: ['availability'] })
    },
    onError: (err: unknown) => setOverrideError(errorText(err, 'Could not change that answer.')),
  })

  // The head confirms, on the day, whether each person who said yes
  // actually turned up — that's what the dashboard's attendance figure
  // counts, so it's recorded against the same answer row.
  const setAttended = useMutation({
    mutationFn: async ({ id, attended }: { id: string; attended: boolean | null }) => {
      const { error } = await supabase.from('availability').update({ attended }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['availability'] }),
  })

  const myAnswer = (serviceId: string, departmentId: string) =>
    (availabilityQuery.data ?? []).find(
      (a) => a.user_id === myId && a.service_id === serviceId && a.department_id === departmentId,
    )?.status ?? null

  const isLoading = servicesQuery.isLoading || departmentsQuery.isLoading || ownDeptsQuery.isLoading
  const error = servicesQuery.error || departmentsQuery.error || ownDeptsQuery.error

  /**
   * One service's card.
   *
   * `inNowGroup` decides only whether it starts open — everything else
   * about the card is the same wherever it sits, which is the point: a
   * service three weeks out is answered exactly like this Sunday's.
   */
  const renderService = (service: (typeof upcoming)[number], inNowGroup: boolean) => {
    const finished = isFinished(service.id)
    // What opens itself, and what somebody has since touched. A service
    // is open when those two disagree: the ones needing an answer now
    // start open and close on a touch; a finished one, or one three
    // weeks out, starts closed and opens on a touch.
    const open = opensByDefault(inNowGroup, finished) !== isToggled(service.id)
    const heading = (
        <div className="flex w-full flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-headline-md">{service.service_type}</h2>
          <span className="flex items-baseline gap-2.5 text-body-sm text-on-surface-variant">
            {finished && (
              <span className="rounded-full bg-[color-mix(in_oklab,var(--color-accent-green)_16%,transparent)] px-2.5 py-1 font-mono text-label-sm uppercase tracking-wide text-accent-green">
                Finished · closed
              </span>
            )}
            {service.date === today ? 'Today' : formatServiceDay(service.date)}
            <Chevron open={open} />
          </span>
        </div>
    )
    return (
    <section
      key={service.id}
      className={`rounded-[var(--radius-card)] bg-surface-lowest hairline p-6 ${
        finished ? 'opacity-70' : ''
      }`}
    >
      {/* Every card folds now, not only the finished ones: a service
        three weeks out has to be openable, and one that opens itself
        has to be closable by whoever does not want it. */}
    <button
      type="button"
      onClick={() => toggleService(service.id)}
      aria-expanded={open}
      aria-controls={`availability-teams-${service.id}`}
      className="flex w-full text-left"
    >
      {heading}
    </button>

      {/* Each team is its own card, so the eye can jump to the one
          that is short rather than reading a column of bars. */}
      <ul
        id={`availability-teams-${service.id}`}
        hidden={!open}
        className="mt-5 flex flex-col gap-3">
        {myDepartments.map((dept) => {
          const mine = myAnswer(service.id, dept.id)
          const leads = ledDepartmentIds.includes(dept.id)
          // Core members are the people expected to serve, and
          // they are the denominator: a guest is not somebody the
          // team is short of.
          const onTeam = (membersQuery.data ?? []).filter(
            (m) => m.department_id === dept.id,
          )
          const coreMembers = onTeam.filter((m) => m.member_type === 'core')
          const answers = (availabilityQuery.data ?? []).filter(
            (a) => a.service_id === service.id && a.department_id === dept.id,
          )
          const summary = availabilitySummary(
            coreMembers.map((m) => m.user_id),
            answers,
          )
          /*
           * A guest who answered is still listed.
           *
           * The roster here was core-only, so a guest who took the
           * trouble to say they could serve simply vanished — no
           * row, no name, nothing to tell the head the answer had
           * been given. They are shown after the core team and
           * badged, so the count above still means what it says.
           */
          const answeredGuests = onTeam.filter(
            (m) =>
              m.member_type === 'guest' &&
              answers.some((a) => a.user_id === m.user_id),
          )
          const teamMembers = [...coreMembers, ...answeredGuests]

          // A team still owed answers keeps the amber row: what
          // needs a person outranks whose team it is.
          return (
            <li
              key={dept.id}
              className={`rounded-[var(--radius-row)] px-4 py-3.5 sm:px-5 ${
                summary.noAnswer > 0
                  ? 'bg-[color-mix(in_oklab,var(--color-accent-orange)_8%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent-orange)_20%,transparent)]'
                  : 'bg-raised hairline'
              }`}
              style={summary.noAnswer > 0 ? undefined : teamWash(dept.color, teamStyle)}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <div className="flex items-center gap-2.5">
                  <TeamMark color={dept.color} />
                  <span className="text-body-md font-medium text-on-surface">{dept.name}</span>
                </div>
                <span
                  className={`font-mono text-label-sm ${
                    summary.noAnswer > 0 ? 'text-accent-orange-soft' : 'text-on-surface-faint'
                  }`}
                >
                  {summary.noAnswer > 0
                    ? `${summary.noAnswer} unanswered · ${summary.available}/${summary.total}`
                    : `${summary.pct}% available · ${summary.available}/${summary.total}`}
                  {summary.tentative > 0 && ` · ${summary.tentative} tentative`}
                </span>
              </div>

              <div
                className="mt-2.5 flex h-2 w-full overflow-hidden rounded-full bg-raised-strong"
                role="img"
                aria-label={`${dept.name}: ${summary.pct}% available, ${summary.tentative} tentative, ${summary.noAnswer} yet to answer`}
              >
                <div
                  className="bg-success"
                  style={{ width: `${summary.total > 0 ? (summary.available / summary.total) * 100 : 0}%` }}
                />
                <div
                  className="bg-warning"
                  style={{ width: `${summary.total > 0 ? (summary.tentative / summary.total) * 100 : 0}%` }}
                />
                <div
                  className="bg-error"
                  style={{
                    width: `${summary.total > 0 ? (summary.unavailable / summary.total) * 100 : 0}%`,
                  }}
                />
              </div>

              {/* Chasing an answer belongs beside the count of
                  answers still missing, not in a settings page:
                  this is the moment a head notices. */}
              {!finished && summary.noAnswer > 0 && ledDepartmentIds.includes(dept.id) && (
                <div className="mt-3">
                  <NudgeButton
                    rpc="nudge_availability"
                    args={{ dept_id: dept.id, svc_id: service.id }}
                    nobodyLabel="Only you left to answer"
                  >
                    Remind the {summary.noAnswer} who haven&rsquo;t answered
                  </NudgeButton>
                </div>
              )}

              {canAnswer && !finished && (
                <div
                  role="group"
                  aria-label={`Can you serve at ${service.service_type} for ${dept.name}?`}
                  className={`mt-3 flex gap-2 rounded-full bg-inset p-1 ${
                    mine
                      ? 'hairline'
                      : /* Unanswered is the state that needs chasing,
                           so the control itself asks for the tap. */
                        'shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--color-accent-orange)_35%,transparent)]'
                  }`}
                >
                  {STATUS_OPTIONS.map((opt) => {
                    const active = mine === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        title={opt.full}
                        aria-pressed={active}
                        onClick={() =>
                          setAvailability.mutate({
                            serviceId: service.id,
                            departmentId: dept.id,
                            status: opt.value,
                          })
                        }
                        disabled={setAvailability.isPending}
                        className={`flex h-11 flex-1 items-center justify-center rounded-full text-body-sm transition-all duration-500 ease-[var(--ease-glide)] active:scale-[0.98] disabled:opacity-60 ${
                          active
                            ? `font-semibold ${opt.activeClass}`
                            : 'text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              )}

              {leads && teamMembers.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer font-mono text-label-sm uppercase text-on-surface-faint transition-colors duration-300 hover:text-on-surface">
                    Team responses ({answers.length}/{coreMembers.length})
                    {answeredGuests.length > 0 &&
                      ` + ${answeredGuests.length} guest${answeredGuests.length === 1 ? '' : 's'}`}
                  </summary>
                  <ul className="mt-2 flex flex-col gap-1.5 border-l border-border-subtle pl-3">
                    {teamMembers.map((m) => {
                      const answer = answers.find((a) => a.user_id === m.user_id)
                      return (
                        <li key={m.id} className="text-body-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                              <span className="break-words text-on-surface">
                                {m.profiles ? `${m.profiles.first_name} ${m.profiles.last_name}` : 'Unknown'}
                              </span>
                              {m.member_type === 'guest' && (
                                <span className="shrink-0 rounded-full bg-raised-strong px-1.5 py-0.5 font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
                                  Guest
                                </span>
                              )}
                            </span>
                            {isAdmin ? (
                              <Select
                                value={answer?.status ?? ''}
                                onChange={(status) =>
                                  setForMember.mutate({
                                    answerId: answer?.id ?? null,
                                    userId: m.user_id,
                                    serviceId: service.id,
                                    departmentId: dept.id,
                                    status: (status || null) as AvailabilityStatus | null,
                                  })
                                }
                                disabled={setForMember.isPending || finished}
                                aria-label={`Availability for ${
                                  m.profiles ? `${m.profiles.first_name} ${m.profiles.last_name}` : 'this member'
                                }`}
                                /* A fixed width, so a column of answers
                                   lines up instead of each pill sizing to
                                   its own word — "Yes" and "No answer"
                                   started their text in different places
                                   down the same column. Wide enough for
                                   the longest of them, so nothing
                                   truncates. */
                                className={`tap w-28 shrink-0 rounded-full hairline bg-surface-lowest px-2.5 py-1.5 font-mono text-label-sm ${
                                  answer ? statusTextClass[answer.status] : 'text-on-surface-variant'
                                }`}
                                options={[
                                  { value: '', label: 'No answer' },
                                  ...STATUS_OPTIONS.map((opt) => ({
                                    value: opt.value,
                                    label: opt.label,
                                  })),
                                ]}
                              />
                            ) : (
                              <span
                                className={`shrink-0 font-mono text-label-sm ${
                                  answer ? statusTextClass[answer.status] : 'text-on-surface-variant'
                                }`}
                              >
                                {answer ? statusLabel[answer.status] : 'No answer'}
                              </span>
                            )}
                          </div>

                          {answer?.status === 'available' && (
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <span className="font-mono text-label-sm text-on-surface-variant">
                                Turned up?
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setAttended.mutate({
                                    id: answer.id,
                                    attended: answer.attended === true ? null : true,
                                  })
                                }
                                className={`tap rounded-full border px-2.5 py-1 text-label-sm ${
                                  answer.attended === true
                                    ? 'border-success bg-success/10 font-medium text-success'
                                    : 'border-border-subtle text-on-surface hover:border-secondary'
                                }`}
                              >
                                Present
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setAttended.mutate({
                                    id: answer.id,
                                    attended: answer.attended === false ? null : false,
                                  })
                                }
                                className={`tap rounded-full border px-2.5 py-1 text-label-sm ${
                                  answer.attended === false
                                    ? 'border-error bg-error/10 font-medium text-error'
                                    : 'border-border-subtle text-on-surface hover:border-secondary'
                                }`}
                              >
                                No-show
                              </button>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </details>
              )}
            </li>
          )
        })}
      </ul>
    </section>
    )
  }


  return (
    <div>
      <PageHeader
        eyebrow={isAdmin ? 'All teams' : 'Your answers'}
        title={isAdmin ? 'Availability Tracker' : 'Can you serve?'}
        description={
          isAdmin
            ? 'Who can serve at the services coming up, team by team.'
            : 'One tap per service. Your team sees the answer straight away.'
        }
      />

      {overrideError && (
        <p className="mt-4 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {overrideError}
        </p>
      )}

      <QueryState isLoading={isLoading} error={error}>
        {upcoming.length === 0 ? (
          <p className="mt-6 text-body-sm text-on-surface-variant">
            No upcoming services scheduled yet — check back soon.
          </p>
        ) : myDepartments.length === 0 ? (
          <p className="mt-6 text-body-sm text-on-surface-variant">
            You're not on a team yet — an Admin can add you to one.
          </p>
        ) : (
          <div className="mt-6 flex flex-col gap-6">
            {groups.now.map((service) => renderService(service, true))}

            {groups.later.length > 0 && (
              /* Everything past the next occasion. Real services with real
                 questions on them — folded, because answering the one in
                 front of you should not mean scrolling past a month first. */
              <section aria-labelledby="upcoming-availability">
                <h2
                  id="upcoming-availability"
                  className="font-mono text-label-sm uppercase tracking-[0.14em] text-on-surface-variant"
                >
                  Upcoming services availability
                </h2>
                <p className="mt-1 text-label-sm text-on-surface-faint">
                  The next three weeks. Answer early if you already know.
                </p>
                <div className="mt-4 flex flex-col gap-6">
                  {groups.later.map((service) => renderService(service, false))}
                </div>
              </section>
            )}
          </div>
        )}
      </QueryState>
    </div>
  )
}
