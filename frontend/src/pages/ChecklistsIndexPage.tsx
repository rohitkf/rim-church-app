import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { StatusBadge } from '../components/ChecklistStatus'
import {
  fetchDepartments,
  fetchRoleChecklistItems,
  fetchRotaProgress,
  fetchServices,
} from '../lib/queries'
import { todayIso } from '../lib/monthGrid'
import { formatServiceDay } from '../lib/sunday'
import { nearestServiceDate } from '../lib/nearestService'
import { DEFAULT_DEPT_COLOR } from '../lib/deptBadge'
import { rotaAssignmentSchema, type ChecklistItemStatus, type RotaAssignment } from '../lib/types'

async function fetchAssignments(serviceIds: string[]): Promise<RotaAssignment[]> {
  if (serviceIds.length === 0) return []
  const { data, error } = await supabase
    .from('rota_assignments')
    .select(
      'id, service_id, department_id, user_id, role_label, role_id, profile:profiles!rota_assignments_user_id_fkey(id, first_name, last_name), department:departments(id, name, color)',
    )
    .in('service_id', serviceIds)
    .order('role_label')
  if (error) throw error
  return z.array(rotaAssignmentSchema).parse(data)
}

/** What this viewer can do to an item at its current stage. */
type Action = { next: ChecklistItemStatus; label: string; className: string } | null

export function ChecklistsIndexPage() {
  const { session, isAdmin, isDepartmentHead } = useAuth()
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
    queryFn: () => fetchAssignments(dayServiceIds),
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
  // Final sign-off belongs to whoever the rota puts in Service Flow for
  // this service — or that team's head, who deputises for them.
  const isServiceFlowSigner = (serviceId: string) =>
    isAdmin ||
    (!!serviceFlowDept && isDepartmentHead(serviceFlowDept.id)) ||
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
      const patch: Record<string, unknown> = { status: next }
      if (next === 'member_complete') Object.assign(patch, { completed_by: myId, completed_at: stamp })
      if (next === 'head_verified') Object.assign(patch, { verified_by_head: myId, verified_by_head_at: stamp })
      if (next === 'coordinator_verified') {
        Object.assign(patch, { verified_by_coordinator: myId, verified_by_coordinator_at: stamp })
      }

      const { error } = await supabase
        .from('rota_checklist_progress')
        .upsert({ assignment_id: assignmentId, item_id: itemId, ...patch }, { onConflict: 'assignment_id,item_id' })
      if (error) throw error
    },
    onSuccess: () => {
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['rota-progress'] })
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Could not update that item.'),
  })

  function actionFor(assignment: RotaAssignment, status: ChecklistItemStatus): Action {
    const mine = assignment.user_id === myId
    const leads = isAdmin || isDepartmentHead(assignment.department_id)

    if (status === 'pending' && (mine || isAdmin)) {
      return { next: 'member_complete', label: 'Mark complete', className: 'bg-status-member' }
    }
    if (status === 'member_complete' && leads) {
      return { next: 'head_verified', label: 'Verify', className: 'bg-status-head' }
    }
    if (status === 'head_verified' && isServiceFlowSigner(assignment.service_id)) {
      return { next: 'coordinator_verified', label: 'Sign off', className: 'bg-status-coordinator' }
    }
    return null
  }

  // Everything you're responsible for, then everything you oversee.
  const mineFirst = useMemo(() => {
    const scored = assignments.map((a) => ({
      assignment: a,
      rank: a.user_id === myId ? 0 : isAdmin || isDepartmentHead(a.department_id) ? 1 : 2,
    }))
    return scored
      .filter((s) => s.rank < 2)
      .sort((a, b) => a.rank - b.rank || a.assignment.role_label.localeCompare(b.assignment.role_label))
  }, [assignments, myId, isAdmin, isDepartmentHead])

  const isLoading = servicesQuery.isLoading || assignmentsQuery.isLoading || departmentsQuery.isLoading
  const loadError = servicesQuery.error || assignmentsQuery.error || departmentsQuery.error

  return (
    <div>
      <h1 className="text-headline-xl">Checklists</h1>

      {error && (
        <p className="mt-4 rounded-sm bg-error-container px-3 py-2 text-body-sm text-on-error-container">{error}</p>
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
                          const statusOf = (itemId: string): ChecklistItemStatus =>
                            progress.find((p) => p.assignment_id === assignment.id && p.item_id === itemId)
                              ?.status ?? 'pending'

                          return (
                            <li
                              key={assignment.id}
                              className="rounded-lg border border-border-subtle bg-surface-lowest p-5"
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
                                <span className="text-body-sm text-on-surface-variant">
                                  {rank === 0
                                    ? 'You'
                                    : assignment.profile
                                      ? `${assignment.profile.first_name} ${assignment.profile.last_name}`
                                      : 'Unassigned'}
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
                                    const action = actionFor(assignment, status)
                                    return (
                                      <li
                                        key={item.id}
                                        className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
                                      >
                                        <span className="min-w-0 flex-1 text-body-sm text-on-surface">
                                          {item.label}
                                        </span>
                                        <StatusBadge status={status} />
                                        {action && (
                                          <button
                                            onClick={() =>
                                              setStage.mutate({
                                                assignmentId: assignment.id,
                                                itemId: item.id,
                                                next: action.next,
                                              })
                                            }
                                            disabled={setStage.isPending}
                                            className={`shrink-0 rounded-sm px-3 py-1.5 text-label-sm font-medium text-white hover:opacity-90 disabled:opacity-50 ${action.className}`}
                                          >
                                            {action.label}
                                          </button>
                                        )}
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
