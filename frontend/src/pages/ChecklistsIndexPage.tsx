import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { PageHeader } from '../components/Surface'
import { StatusBadge } from '../components/ChecklistStatus'
import { ChecklistStageBoxes } from '../components/ChecklistStageBoxes'
import {
  fetchDepartments,
  fetchRoleChecklistItems,
  fetchOwnDepartmentIds,
  fetchRotaAssignments,
  fetchRotaProgress,
  fetchServices,
} from '../lib/queries'
import { todayIso } from '../lib/monthGrid'
import { servicesToShow } from '../lib/rotaWindow'
import { useAppSettings } from '../lib/appSettings'
import { formatServiceDay } from '../lib/sunday'
import { nearestServiceDate } from '../lib/nearestService'
import { TeamMark } from '../components/TeamMark'
import { NudgeButton } from '../components/NudgeButton'
import { useFinishedServices } from '../lib/useFinishedServices'
import { Chevron, useExpanded } from '../components/Collapsible'
import { PHASES, byPhase } from '../lib/checklistPhase'
import { teamWashSoft } from '../lib/teamGradient'
import { useTeamStyle } from '../lib/useTeamStyle'
import type { ChecklistItemStatus, RotaAssignment, RotaProgress } from '../lib/types'
import { useErrorText } from '../lib/useErrorText'
import { useNow } from '../lib/useNow'
import { checklistWindow, whenItOpens } from '../lib/checklistWindow'
import { ServiceCountdown } from '../components/ServiceCountdown'
import type { CallTimeRow } from '../lib/callTimes'

const CallTimeRows = z.array(
  z.object({ department_id: z.string(), on_date: z.string(), call_time: z.string() }),
)

export function ChecklistsIndexPage() {
  const { session, isAdmin, isDepartmentHead } = useAuth()
  const { teamStyle } = useTeamStyle()
  const errorText = useErrorText()
  const myId = session?.user.id
  const queryClient = useQueryClient()
  const today = todayIso()
  const settings = useAppSettings()
  const [error, setError] = useState<string | null>(null)

  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: fetchServices })
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })

  // The same window the rota and the availability tracker work to, and set
  // in the same place. This used to be the next service day and nothing
  // else, which buries a checklist somebody wants to prepare early and is
  // not the church's call to make from the source code.
  const dayIso = useMemo(
    () => nearestServiceDate((servicesQuery.data ?? []).map((s) => s.date), today),
    [servicesQuery.data, today],
  )
  const dayServices = useMemo(() => {
    const all = servicesQuery.data ?? []
    const ahead = servicesToShow(all, today, { days: settings.rota_window_days })
    // Nothing ahead: the page still has a day to show, and it is the most
    // recent one — a checklist is worked on the day and signed off after.
    return ahead.length > 0 ? ahead : all.filter((s) => s.date === dayIso)
  }, [servicesQuery.data, today, settings.rota_window_days, dayIso])
  const dayServiceIds = useMemo(() => dayServices.map((s) => s.id), [dayServices])

  const assignmentsQuery = useQuery({
    queryKey: ['checklist-assignments', dayServiceIds],
    queryFn: () => fetchRotaAssignments(dayServiceIds),
    enabled: dayServiceIds.length > 0,
  })
  const assignments = useMemo(() => assignmentsQuery.data ?? [], [assignmentsQuery.data])

  const deptIds = useMemo(
    () => [...new Set(assignments.map((a) => a.department_id))],
    [assignments],
  )
  const itemsQuery = useQuery({
    queryKey: ['role-checklist-items', deptIds],
    queryFn: () => fetchRoleChecklistItems(deptIds),
    enabled: deptIds.length > 0,
  })
  const assignmentIds = useMemo(() => assignments.map((a) => a.id), [assignments])
  const progressQuery = useQuery({
    queryKey: ['rota-progress', assignmentIds],
    queryFn: () => fetchRotaProgress(assignmentIds),
    enabled: assignmentIds.length > 0,
  })

  /*
   * When each team is due in on each of the days shown.
   *
   * A checklist opens at its team's call time on the day of the service —
   * the database refuses anything earlier (0079), and this is how the page
   * knows to say so rather than letting somebody tap a box that will bounce.
   */
  const dayDates = useMemo(() => [...new Set(dayServices.map((s) => s.date))].sort(), [dayServices])
  const callTimesQuery = useQuery({
    queryKey: ['call-times', dayDates],
    queryFn: async (): Promise<CallTimeRow[]> => {
      const { data, error: err } = await supabase
        .from('department_call_times')
        .select('department_id, on_date, call_time')
        .in('on_date', dayDates)
      if (err) throw err
      return CallTimeRows.parse(data)
    },
    enabled: dayDates.length > 0,
  })
  const callTimes = useMemo(() => callTimesQuery.data ?? [], [callTimesQuery.data])

  // Recomputed on a timer, so a checklist opens while somebody is looking
  // at the page rather than on the next reload.
  const now = useNow()

  /** Whether this team may tick anything yet, on this service's day. */
  const windowFor = (departmentId: string, serviceDate: string) =>
    checklistWindow({ serviceDate, departmentId, callTimes, now, alwaysOpen: isAdmin })

  const serviceFlowDept = (departmentsQuery.data ?? []).find((d) => d.is_service_flow)

  // Anyone on the sign-off team sees the whole service's checklists, not
  // only the person rostered on it — the team needs to know how the service
  // is coming along. Giving the signature is still the signer's alone.
  const ownDeptsQuery = useQuery({
    queryKey: ['own-departments', myId],
    queryFn: () => fetchOwnDepartmentIds(myId!),
    enabled: !!myId,
  })
  const onSignOffTeam =
    !!serviceFlowDept &&
    ((ownDeptsQuery.data ?? []).includes(serviceFlowDept.id) || isDepartmentHead(serviceFlowDept.id))
  // The final signature belongs to the team that signs checklists off —
  // any of its members, not only whoever the rota happened to put on this
  // service, so a finished list is never left waiting on one person.
  const isServiceFlowSigner = (serviceId: string) =>
    isAdmin ||
    onSignOffTeam ||
    assignments.some(
      (a) => a.service_id === serviceId && a.department_id === serviceFlowDept?.id && a.user_id === myId,
    )

  const setStage = useMutation({
    mutationFn: async ({
      assignmentId,
      itemId,
      next,
    }: {
      assignmentId: string
      itemId: string
      next: ChecklistItemStatus
    }) => {
      const stamp = new Date().toISOString()
      // Each stage carries who signed it and when; taking a stage back
      // clears its signature rather than leaving a stale name on the row.
      const patch: Record<string, unknown> = {
        status: next,
        completed_by: null,
        completed_at: null,
        verified_by_head: null,
        verified_by_head_at: null,
        verified_by_coordinator: null,
        verified_by_coordinator_at: null,
      }
      if (next !== 'pending') Object.assign(patch, { completed_by: myId, completed_at: stamp })
      if (next === 'head_verified' || next === 'coordinator_verified') {
        Object.assign(patch, { verified_by_head: myId, verified_by_head_at: stamp })
      }
      if (next === 'coordinator_verified') {
        Object.assign(patch, { verified_by_coordinator: myId, verified_by_coordinator_at: stamp })
      }

      const { error } = await supabase
        .from('rota_checklist_progress')
        .upsert({ assignment_id: assignmentId, item_id: itemId, ...patch }, { onConflict: 'assignment_id,item_id' })
      if (error) throw error
    },
    // Tick the box straight away and reconcile afterwards: a checkbox that
    // waits for a round trip before moving feels broken.
    onMutate: async ({ assignmentId, itemId, next }) => {
      await queryClient.cancelQueries({ queryKey: ['rota-progress'] })
      const snapshot = queryClient.getQueriesData<RotaProgress[]>({ queryKey: ['rota-progress'] })
      queryClient.setQueriesData<RotaProgress[]>({ queryKey: ['rota-progress'] }, (rows) => {
        const current = rows ?? []
        const existing = current.find((p) => p.assignment_id === assignmentId && p.item_id === itemId)
        if (existing) {
          return current.map((p) => (p === existing ? { ...p, status: next } : p))
        }
        return [...current, { id: `optimistic:${assignmentId}:${itemId}`, assignment_id: assignmentId, item_id: itemId, status: next }]
      })
      setError(null)
      return { snapshot }
    },
    onError: (err: unknown, _vars, context) => {
      for (const [key, rows] of context?.snapshot ?? []) queryClient.setQueryData(key, rows)
      setError(errorText(err, 'Could not update that item.'))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['rota-progress'] }),
  })

  /** Which of the three signatures this viewer may give on this assignment. */
  function mayFor(assignment: RotaAssignment) {
    return {
      member: isAdmin || assignment.user_id === myId,
      head: isAdmin || isDepartmentHead(assignment.department_id),
      sign: isServiceFlowSigner(assignment.service_id),
    }
  }

  // Everything you're responsible for, then everything you oversee, then —
  // for whoever Service Flow puts on the service — everything else, since
  // the final signature is theirs to give on every team's list.
  const mineFirst = useMemo(() => {
    const scored = assignments.map((a) => ({
      assignment: a,
      rank:
        a.user_id === myId
          ? 0
          : isAdmin || isDepartmentHead(a.department_id)
            ? 1
            : onSignOffTeam || isServiceFlowSigner(a.service_id)
              ? 2
              : 3,
    }))
    return scored
      .filter((s) => s.rank < 3)
      .sort((a, b) => a.rank - b.rank || a.assignment.role_label.localeCompare(b.assignment.role_label))
    // isServiceFlowSigner reads the same assignments and departments this
    // memo already depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments, myId, isAdmin, isDepartmentHead, serviceFlowDept, onSignOffTeam])

  const { isFinished } = useFinishedServices(dayServices.map((s) => s.id))
  // Nothing in a finished service can be ticked or chased, so it folds
  // away and opens on a touch when somebody wants the record.
  const { isExpanded, toggle: toggleService } = useExpanded()
  const orderedServices = useMemo(
    () =>
      [...dayServices].sort(
        (a, b) => Number(isFinished(a.id)) - Number(isFinished(b.id)),
      ),
    [dayServices, isFinished],
  )

  const daysShown = new Set(dayServices.map((s) => s.date)).size
  const firstDayShown = dayServices.map((s) => s.date).sort()[0]

  const isLoading = servicesQuery.isLoading || assignmentsQuery.isLoading || departmentsQuery.isLoading
  const loadError = servicesQuery.error || assignmentsQuery.error || departmentsQuery.error

  return (
    <div>
      <PageHeader
        eyebrow={
          /* One day reads as a day; a window reads as a window. Saying
             "next service day" over a fortnight of them would be a lie the
             page then spends five sections contradicting. */
          daysShown > 1
            ? `The next ${settings.rota_window_days} days · from ${formatServiceDay(firstDayShown!)}`
            : dayIso
              ? `${dayIso === today ? 'Today' : dayIso > today ? 'Next service day' : 'Most recent service day'} · ${formatServiceDay(dayIso)}`
              : 'No service day yet'
        }
        title="Checklists"
        description="Yours first, then the teams you oversee. Every item passes member → head → sign-off."
      />

      {error && (
        <p className="mt-4 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">{error}</p>
      )}

      <QueryState isLoading={isLoading} error={loadError}>
        {!dayIso ? (
          <p className="mt-4 text-body-sm text-on-surface-variant">
            No services scheduled yet
            {isAdmin ? ' — add one from the Service Planner.' : ' — check back soon.'}
          </p>
        ) : (
          <>

            {mineFirst.length === 0 ? (
              <p className="mt-6 text-body-sm text-on-surface-variant">
                You have no role on the rota for this service. Your team head assigns roles under Team
                Rota.
              </p>
            ) : (
              <div className="mt-6 flex flex-col gap-10">
                {orderedServices.map((service) => {
                  // A service that has been and gone is a record now: it
                  // sinks below the ones still to prepare for, and nothing
                  // in it can be ticked, un-ticked or chased.
                  const finished = isFinished(service.id)
                  const forService = mineFirst.filter((m) => m.assignment.service_id === service.id)
                  if (forService.length === 0) return null

                  // The teams on this service that the viewer runs — an
                  // Admin can chase the lot in one press, a head only their
                  // own, and everyone else sees no button at all.
                  const myTeamsHere = [
                    ...new Set(
                      forService
                        .map((m) => m.assignment.department_id)
                        .filter((id) => isDepartmentHead(id)),
                    ),
                  ]

                  const open = !finished || isExpanded(service.id)
                  const heading = (
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h2 className="text-headline-lg">{service.service_type}</h2>
                      <span className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
                        {service.date}
                      </span>
                      {finished && (
                        <>
                          <span className="rounded-full bg-[color-mix(in_oklab,var(--color-accent-green)_16%,transparent)] px-2.5 py-1 font-mono text-label-sm uppercase tracking-wide text-accent-green">
                            Finished · closed
                          </span>
                          <span className="font-mono text-label-sm text-on-surface-faint">
                            {forService.length} {forService.length === 1 ? 'role' : 'roles'}
                          </span>
                          <Chevron open={open} />
                        </>
                      )}
                    </div>
                  )

                  return (
                    <section key={service.id}>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                        {finished ? (
                          <button
                            type="button"
                            onClick={() => toggleService(service.id)}
                            aria-expanded={open}
                            aria-controls={`checklist-roles-${service.id}`}
                            className="flex text-left"
                          >
                            {heading}
                          </button>
                        ) : (
                          heading
                        )}

                        {finished ? null : isAdmin ? (
                          <NudgeButton
                            rpc="nudge_checklist"
                            args={{ svc_id: service.id, dept_id: null }}
                            nobodyLabel="Everyone is done"
                          >
                            Remind whoever hasn&rsquo;t finished
                          </NudgeButton>
                        ) : (
                          myTeamsHere.length === 1 && (
                            <NudgeButton
                              rpc="nudge_checklist"
                              args={{ svc_id: service.id, dept_id: myTeamsHere[0] }}
                              nobodyLabel="Everyone is done"
                            >
                              Remind whoever hasn&rsquo;t finished
                            </NudgeButton>
                          )
                        )}
                      </div>

                      <ul
                        id={`checklist-roles-${service.id}`}
                        hidden={!open}
                        className="mt-4 flex flex-col gap-4">
                        {forService.map(({ assignment, rank }) => {
                          const items = (itemsQuery.data ?? []).filter((i) => i.role_id === assignment.role_id)
                          const progress = progressQuery.data ?? []
                          // Shut until the team is called in. Nobody's
                          // signature is exempt: a Head cannot verify what
                          // nobody could have ticked yet.
                          const gate = windowFor(assignment.department_id, service.date)
                          const may = gate.open
                            ? mayFor(assignment)
                            : { member: false, head: false, sign: false }
                          const statusOf = (itemId: string): ChecklistItemStatus =>
                            progress.find((p) => p.assignment_id === assignment.id && p.item_id === itemId)
                              ?.status ?? 'pending'

                          return (
                            <li
                              key={assignment.id}
                              className="rounded-[var(--radius-card)] bg-surface-lowest hairline p-5"
                              style={teamWashSoft(assignment.department?.color, teamStyle)}
                            >
                              {/* On a phone the role and the person get a
                                  line each: side by side, "Camera Operator 1
                                  · Media" and a full name were reaching for
                                  the same 40 characters and meeting in the
                                  middle. They sit on one line again as soon
                                  as there is room for both. */}
                              <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-2">
                                <div className="flex min-w-0 items-center gap-2">
                                  <TeamMark color={assignment.department?.color ?? null} />
                                  <span className="min-w-0 break-words font-medium text-on-surface">
                                    {assignment.role_label}
                                  </span>
                                  <span className="shrink-0 text-body-sm text-on-surface-variant">
                                    · {assignment.department?.name}
                                  </span>
                                </div>
                                <span className="flex flex-wrap items-center gap-2">
                                  {rank === 2 && (
                                    <span className="rounded-full bg-status-coordinator/15 px-2 py-0.5 font-mono text-label-sm text-status-coordinator">
                                      {may.sign ? 'For your sign-off' : 'Sign-off team view'}
                                    </span>
                                  )}
                                  <span className="text-body-sm text-on-surface-variant">
                                    {rank === 0
                                      ? 'You'
                                      : assignment.profile
                                        ? `${assignment.profile.first_name} ${assignment.profile.last_name}`
                                        : 'Unassigned'}
                                  </span>
                                </span>
                              </div>

                              {/*
                                Why the boxes are dead, and when they will
                                not be. A locked control with no explanation
                                reads as a broken one, and "your call time"
                                is a thing everybody on the team already
                                knows the meaning of — so it is said in
                                those words, with the same clock the rota
                                counts down to.
                              */}
                              {!finished && !gate.open && (
                                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-chip)] bg-surface-container px-3 py-2">
                                  <span className="text-body-sm text-on-surface-variant">
                                    {whenItOpens(gate, formatServiceDay(service.date))}
                                  </span>
                                  <ServiceCountdown
                                    startsAt={gate.opensAt}
                                    label="until it opens"
                                    fallback={
                                      <span className="font-mono text-label-sm text-on-surface-faint">
                                        opens at {gate.clock}
                                      </span>
                                    }
                                  />
                                </div>
                              )}

                              {items.length === 0 ? (
                                <p className="mt-3 text-body-sm text-on-surface-variant">
                                  No checklist defined for this role yet — the team head adds it under Teams.
                                </p>
                              ) : (
                                /* Before and after, kept apart. A single
                                   column meant scrolling past the packing-up
                                   jobs to find the setting-up ones, twice a
                                   service. A phase with nothing in it is not
                                   drawn at all — an empty heading is worse
                                   than no heading. */
                                PHASES.filter((phase) => byPhase(items, phase.value).length > 0).map((phase) => (
                                <div key={phase.value} className="mt-3">
                                  <div className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
                                    {phase.label}
                                  </div>
                                  <ul className="mt-1 divide-y divide-border-subtle">
                                  {byPhase(items, phase.value).map((item) => {
                                    const status = statusOf(item.id)
                                    return (
                                      <li
                                        key={item.id}
                                        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5 first:pt-0 last:pb-0"
                                      >
                                        <span className="min-w-0 flex-1 text-body-md text-on-surface">
                                          {item.label}
                                        </span>
                                        <StatusBadge status={status} />
                                        <ChecklistStageBoxes
                                          status={status}
                                          // A finished service signs nothing more.
                                          may={
                                            finished
                                              ? { member: false, head: false, sign: false }
                                              : may
                                          }
                                          busy={setStage.isPending}
                                          onChange={(next) =>
                                            setStage.mutate({
                                              assignmentId: assignment.id,
                                              itemId: item.id,
                                              next,
                                            })
                                          }
                                        />
                                      </li>
                                    )
                                  })}
                                  </ul>
                                </div>
                                ))
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  )
                })}
              </div>
            )}
          </>
        )}
      </QueryState>
    </div>
  )
}
