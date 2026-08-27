import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
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
import { formatServiceDay } from '../lib/sunday'
import { nearestServiceDate } from '../lib/nearestService'
import { DEFAULT_DEPT_COLOR } from '../lib/deptBadge'
import type { ChecklistItemStatus, RotaAssignment, RotaProgress } from '../lib/types'
import { useErrorText } from '../lib/useErrorText'

export function ChecklistsIndexPage() {
  const { session, isAdmin, isDepartmentHead } = useAuth()
  const errorText = useErrorText()
  const myId = session?.user.id
  const queryClient = useQueryClient()
  const today = todayIso()
  const [error, setError] = useState<string | null>(null)

  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: fetchServices })
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })

  // Only the next service day matters here — future weeks would just bury
  // the checklist people actually need today.
  const dayIso = useMemo(
    () => nearestServiceDate((servicesQuery.data ?? []).map((s) => s.date), today),
    [servicesQuery.data, today],
  )
  const dayServices = useMemo(
    () => (servicesQuery.data ?? []).filter((s) => s.date === dayIso),
    [servicesQuery.data, dayIso],
  )
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

  const isLoading = servicesQuery.isLoading || assignmentsQuery.isLoading || departmentsQuery.isLoading
  const loadError = servicesQuery.error || assignmentsQuery.error || departmentsQuery.error

  return (
    <div>
      <h1 className="text-headline-xl">Checklists</h1>

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
            <p className="mt-2 text-body-md text-on-surface-variant">
              {dayIso === today ? 'Today' : dayIso > today ? 'Next service day' : 'Most recent service day'} ·{' '}
              {formatServiceDay(dayIso)}
            </p>

            {mineFirst.length === 0 ? (
              <p className="mt-6 text-body-sm text-on-surface-variant">
                You have no role on the rota for this service. Your team head assigns roles under Team
                Rota.
              </p>
            ) : (
              <div className="mt-6 flex flex-col gap-10">
                {dayServices.map((service) => {
                  const forService = mineFirst.filter((m) => m.assignment.service_id === service.id)
                  if (forService.length === 0) return null

                  return (
                    <section key={service.id}>
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h2 className="text-headline-lg">{service.service_type}</h2>
                        <span className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
                          {service.date}
                        </span>
                      </div>

                      <ul className="mt-4 flex flex-col gap-4">
                        {forService.map(({ assignment, rank }) => {
                          const items = (itemsQuery.data ?? []).filter((i) => i.role_id === assignment.role_id)
                          const progress = progressQuery.data ?? []
                          const may = mayFor(assignment)
                          const statusOf = (itemId: string): ChecklistItemStatus =>
                            progress.find((p) => p.assignment_id === assignment.id && p.item_id === itemId)
                              ?.status ?? 'pending'

                          return (
                            <li
                              key={assignment.id}
                              className="rounded-[var(--radius-card)] bg-surface-lowest hairline p-5"
                            >
                              <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                                    style={{
                                      backgroundColor: assignment.department?.color ?? DEFAULT_DEPT_COLOR,
                                    }}
                                  />
                                  <span className="font-medium text-on-surface">{assignment.role_label}</span>
                                  <span className="text-body-sm text-on-surface-variant">
                                    · {assignment.department?.name}
                                  </span>
                                </div>
                                <span className="flex items-center gap-2">
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

                              {items.length === 0 ? (
                                <p className="mt-3 text-body-sm text-on-surface-variant">
                                  No checklist defined for this role yet — the team head adds it under Teams.
                                </p>
                              ) : (
                                <ul className="mt-3 divide-y divide-border-subtle">
                                  {items.map((item) => {
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
                                          may={may}
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
