import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { SegmentedProgressBar } from '../components/ChecklistStatus'
import { formatRelativeTime } from '../lib/relativeTime'
import { fetchDepartments, fetchServices } from '../lib/queries'
import type { RoleType } from '../auth/types'
import {
  attendanceRowSchema,
  checklistItemRowSchema,
  type AttendanceRow,
  type ChecklistItemRow,
  type ChecklistItemStatus,
} from '../lib/types'

const checklistRefSchema = z.object({ id: z.string(), department_id: z.string() })
const actorSchema = z.object({ id: z.string(), first_name: z.string(), last_name: z.string() })

const roleChipColor: Record<RoleType, string> = {
  admin: 'bg-primary text-on-primary',
  department_head: 'bg-status-head/15 text-status-head',
  assisting_head: 'bg-status-head/10 text-status-head',
  service_flow_coordinator: 'bg-status-coordinator/15 text-status-coordinator',
}

const roleLabel: Record<RoleType, string> = {
  admin: 'Admin',
  department_head: 'Department Head',
  assisting_head: 'Assisting Head',
  service_flow_coordinator: 'Service Flow Coordinator',
}

const actionLabel: Record<Exclude<ChecklistItemStatus, 'pending'>, string> = {
  member_complete: 'completed',
  head_verified: 'head-verified',
  coordinator_verified: 'coordinator-verified',
}

async function fetchChecklists(serviceId: string): Promise<{ id: string; department_id: string }[]> {
  const { data, error } = await supabase.from('checklists').select('id, department_id').eq('service_id', serviceId)
  if (error) throw error
  return z.array(checklistRefSchema).parse(data)
}

async function fetchItems(checklistIds: string[]): Promise<ChecklistItemRow[]> {
  if (checklistIds.length === 0) return []
  const { data, error } = await supabase
    .from('checklist_items')
    .select('*, assignee:profiles!checklist_items_assigned_to_fkey(id, first_name, last_name)')
    .in('checklist_id', checklistIds)
  if (error) throw error
  return z.array(checklistItemRowSchema).parse(data)
}

async function fetchAttendance(serviceId: string): Promise<AttendanceRow[]> {
  const { data, error } = await supabase.from('attendance').select('*').eq('service_id', serviceId)
  if (error) throw error
  return z.array(attendanceRowSchema).parse(data)
}

async function fetchActorNames(userIds: string[]): Promise<Record<string, string>> {
  if (userIds.length === 0) return {}
  const { data, error } = await supabase.from('profiles').select('id, first_name, last_name').in('id', userIds)
  if (error) throw error
  const actors = z.array(actorSchema).parse(data)
  return Object.fromEntries(actors.map((p) => [p.id, `${p.first_name} ${p.last_name}`]))
}

function actorIdFor(item: ChecklistItemRow): string | null {
  if (item.status === 'member_complete') return item.completed_by
  if (item.status === 'head_verified') return item.verified_by_head
  if (item.status === 'coordinator_verified') return item.verified_by_coordinator
  return null
}

function actorTimestampFor(item: ChecklistItemRow): string | null {
  if (item.status === 'member_complete') return item.completed_at
  if (item.status === 'head_verified') return item.verified_by_head_at
  if (item.status === 'coordinator_verified') return item.verified_by_coordinator_at
  return null
}

export function DashboardPage() {
  const { profile, roles, isAdmin } = useAuth()
  const [selectedServiceId, setSelectedServiceId] = useState('')

  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: fetchServices })
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })

  const defaultServiceId = servicesQuery.data?.[0]?.id
  useEffect(() => {
    if (!selectedServiceId && defaultServiceId) setSelectedServiceId(defaultServiceId)
  }, [selectedServiceId, defaultServiceId])

  const checklistsQuery = useQuery({
    queryKey: ['dashboard-checklists', selectedServiceId],
    queryFn: () => fetchChecklists(selectedServiceId),
    enabled: !!selectedServiceId,
  })
  const checklistIds = useMemo(() => checklistsQuery.data?.map((c) => c.id) ?? [], [checklistsQuery.data])
  const checklistDeptById = useMemo(
    () => new Map(checklistsQuery.data?.map((c) => [c.id, c.department_id]) ?? []),
    [checklistsQuery.data],
  )

  const itemsQuery = useQuery({
    queryKey: ['dashboard-items', checklistIds],
    queryFn: () => fetchItems(checklistIds),
    enabled: checklistIds.length > 0,
  })
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data])

  const attendanceQuery = useQuery({
    queryKey: ['dashboard-attendance', selectedServiceId],
    queryFn: () => fetchAttendance(selectedServiceId),
    enabled: !!selectedServiceId,
  })
  const attendance = attendanceQuery.data ?? []

  const activityItems = useMemo(
    () =>
      items
        .filter((i) => i.status !== 'pending')
        .map((i) => ({ item: i, actorId: actorIdFor(i), at: actorTimestampFor(i) }))
        .filter((x): x is { item: ChecklistItemRow; actorId: string; at: string } => !!x.actorId && !!x.at)
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, 6),
    [items],
  )
  const actorIds = useMemo(() => [...new Set(activityItems.map((a) => a.actorId))], [activityItems])
  const actorsQuery = useQuery({
    queryKey: ['dashboard-actors', actorIds],
    queryFn: () => fetchActorNames(actorIds),
    enabled: actorIds.length > 0,
  })

  const globalCounts = {
    total: items.length,
    memberComplete: items.filter((i) => i.status === 'member_complete').length,
    headVerified: items.filter((i) => i.status === 'head_verified').length,
    coordinatorVerified: items.filter((i) => i.status === 'coordinator_verified').length,
  }
  const totalExpected = attendance.reduce((sum, a) => sum + a.expected_count, 0)
  const totalActual = attendance.reduce((sum, a) => sum + (a.actual_count ?? 0), 0)
  const attendancePct = totalExpected > 0 ? Math.round((totalActual / totalExpected) * 100) : null

  const departmentsWithData = (departmentsQuery.data ?? []).filter((d) =>
    checklistsQuery.data?.some((c) => c.department_id === d.id) || attendance.some((a) => a.department_id === d.id),
  )

  const isLoading = servicesQuery.isLoading || departmentsQuery.isLoading
  const error = servicesQuery.error || departmentsQuery.error

  return (
    <div>
      <h1 className="text-headline-xl">Welcome{profile ? `, ${profile.first_name}` : ''}</h1>

      {roles.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {roles.map((r) => (
            <li
              key={r.id}
              className={`rounded-full px-3 py-1 font-mono text-label-sm uppercase tracking-wide ${roleChipColor[r.role_type]}`}
            >
              {roleLabel[r.role_type]}
            </li>
          ))}
        </ul>
      )}

      <QueryState isLoading={isLoading} error={error}>
        <div className="mt-6 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-body-sm text-on-surface-variant">
            Service
            <select
              value={selectedServiceId}
              onChange={(e) => setSelectedServiceId(e.target.value)}
              className="min-w-[16rem] rounded-sm border border-border-subtle px-3 py-2 text-body-md text-on-surface"
            >
              {servicesQuery.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.service_type} — {s.date}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!servicesQuery.data?.length ? (
          <p className="mt-8 text-body-sm text-on-surface-variant">
            No services yet.{' '}
            {isAdmin && (
              <>
                Create one from the{' '}
                <Link to="/checklists" className="text-secondary">
                  Checklists
                </Link>{' '}
                page.
              </>
            )}
          </p>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-lg border border-border-subtle bg-surface-lowest p-6 lg:col-span-2">
              <div className="text-headline-md">Global Readiness</div>
              <div className="mt-4 grid grid-cols-1 gap-8 sm:grid-cols-2">
                <div>
                  <div className="text-body-sm text-on-surface-variant">Volunteer Attendance</div>
                  <div className="mt-1 text-headline-lg">{attendancePct !== null ? `${attendancePct}%` : '—'}</div>
                  <div className="mt-1 font-mono text-label-sm text-on-surface-variant">
                    Actual: {totalActual} &nbsp; Expected: {totalExpected}
                  </div>
                </div>
                <div>
                  <div className="text-body-sm text-on-surface-variant">Overall Checklist Progress</div>
                  <div className="mt-3">
                    <SegmentedProgressBar
                      total={globalCounts.total}
                      memberComplete={globalCounts.memberComplete}
                      headVerified={globalCounts.headVerified}
                      coordinatorVerified={globalCounts.coordinatorVerified}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-border-subtle bg-surface-lowest p-6">
              <div className="text-headline-md">Department Status</div>
              <QueryState isLoading={checklistsQuery.isLoading} error={checklistsQuery.error} isEmpty={departmentsWithData.length === 0} emptyMessage="No checklist or attendance data for this service yet.">
                <ul className="mt-4 flex flex-col gap-5">
                  {departmentsWithData.map((dept) => {
                    const deptItems = items.filter((i) => checklistDeptById.get(i.checklist_id) === dept.id)
                    const done = deptItems.filter((i) => i.status !== 'pending').length
                    return (
                      <li key={dept.id}>
                        <div className="flex items-center justify-between text-body-sm">
                          <Link to={`/checklists/${dept.id}/${selectedServiceId}`} className="font-medium text-on-surface hover:text-secondary">
                            {dept.name}
                          </Link>
                          <span className="font-mono text-label-sm text-on-surface-variant">
                            {done}/{deptItems.length} Tasks
                          </span>
                        </div>
                        <div className="mt-2">
                          <SegmentedProgressBar
                            total={deptItems.length}
                            memberComplete={deptItems.filter((i) => i.status === 'member_complete').length}
                            headVerified={deptItems.filter((i) => i.status === 'head_verified').length}
                            coordinatorVerified={deptItems.filter((i) => i.status === 'coordinator_verified').length}
                          />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </QueryState>
            </section>

            <section className="rounded-lg border border-border-subtle bg-surface-lowest p-6">
              <div className="text-headline-md">Live Activity</div>
              <QueryState isLoading={itemsQuery.isLoading} error={itemsQuery.error} isEmpty={activityItems.length === 0} emptyMessage="No verification activity yet for this service.">
                <ul className="mt-4 flex flex-col gap-3">
                  {activityItems.map(({ item, actorId, at }) => (
                    <li key={`${item.id}-${item.status}`} className="text-body-sm">
                      <span className="font-medium text-on-surface">{actorsQuery.data?.[actorId] ?? '…'}</span>{' '}
                      <span className="text-on-surface-variant">
                        {actionLabel[item.status as Exclude<ChecklistItemStatus, 'pending'>]}
                      </span>{' '}
                      <span className="font-medium text-on-surface">{item.role_label}</span>
                      <div className="font-mono text-label-sm text-on-surface-variant">{formatRelativeTime(at)}</div>
                    </li>
                  ))}
                </ul>
              </QueryState>
            </section>
          </div>
        )}
      </QueryState>
    </div>
  )
}
