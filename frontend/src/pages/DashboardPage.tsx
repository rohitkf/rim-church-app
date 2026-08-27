import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { SegmentedProgressBar } from '../components/ChecklistStatus'
import { formatRelativeTime } from '../lib/relativeTime'
import {
  fetchAvailabilityFor,
  fetchDepartments,
  fetchMembersForDepartments,
  fetchServices,
} from '../lib/queries'
import { availabilitySummary } from '../lib/availabilitySummary'
import { AvailabilityBar } from '../components/AvailabilityBar'
import { attendanceBarClass } from '../lib/attendance'
import { combineTurnout, turnoutFrom } from '../lib/turnout'
import { DEFAULT_DEPT_COLOR } from '../lib/deptBadge'
import { focusSundayIso, formatServiceDay, shiftSundayIso } from '../lib/sunday'
import { nearestServiceDate } from '../lib/nearestService'
import { todayIso } from '../lib/monthGrid'
import type { RoleType } from '../auth/types'
import {
  checklistItemRowSchema,
  type ChecklistItemRow,
  type ChecklistItemStatus,
} from '../lib/types'

const checklistRefSchema = z.object({ id: z.string(), department_id: z.string(), service_id: z.string() })
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

async function fetchChecklists(serviceIds: string[]) {
  if (serviceIds.length === 0) return []
  const { data, error } = await supabase
    .from('checklists')
    .select('id, department_id, service_id')
    .in('service_id', serviceIds)
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

  // Everyone opens on the Sunday in question (today if it is Sunday,
  // otherwise the one coming up). Admins alone can step back through
  // previous weeks to review past stats.
  const today = todayIso()
  const [adminDate, setAdminDate] = useState<string | null>(null)

  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: fetchServices })
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })

  // Every distinct day that has services, so the dashboard can land on
  // the one that matters and step between them.
  const serviceDates = useMemo(
    () => [...new Set((servicesQuery.data ?? []).map((s) => s.date))].sort(),
    [servicesQuery.data],
  )
  // Today when something is on today, otherwise the next day with
  // services — services aren't always on a Sunday, and pinning this to
  // the coming Sunday hid a midweek service entirely. Falls back to the
  // coming Sunday when nothing is scheduled at all.
  const defaultDate = useMemo(
    () => nearestServiceDate(serviceDates, today) ?? focusSundayIso(new Date()),
    [serviceDates, today],
  )
  const viewedDate = (isAdmin ? adminDate : null) ?? defaultDate

  // Step to the neighbouring service day rather than a fixed week, so
  // Previous/Next always lands on something worth looking at.
  function stepDay(delta: 1 | -1) {
    const ahead = delta === 1
    const candidates = ahead
      ? serviceDates.filter((d) => d > viewedDate)
      : serviceDates.filter((d) => d < viewedDate).reverse()
    setAdminDate(candidates[0] ?? shiftSundayIso(viewedDate, delta))
  }

  const dayServices = useMemo(
    () => (servicesQuery.data ?? []).filter((s) => s.date === viewedDate),
    [servicesQuery.data, viewedDate],
  )
  const dayServiceIds = useMemo(() => dayServices.map((s) => s.id), [dayServices])

  const checklistsQuery = useQuery({
    queryKey: ['dashboard-checklists', dayServiceIds],
    queryFn: () => fetchChecklists(dayServiceIds),
    enabled: dayServiceIds.length > 0,
  })
  const checklistIds = useMemo(() => checklistsQuery.data?.map((c) => c.id) ?? [], [checklistsQuery.data])
  const checklistById = useMemo(
    () => new Map(checklistsQuery.data?.map((c) => [c.id, c]) ?? []),
    [checklistsQuery.data],
  )

  const itemsQuery = useQuery({
    queryKey: ['dashboard-items', checklistIds],
    queryFn: () => fetchItems(checklistIds),
    enabled: checklistIds.length > 0,
  })
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data])


  // Availability: who has said they can serve. RLS narrows both the
  // answers and the rosters to teams the viewer may see, so a team member
  // sees their own teams here and an Admin sees all of them.
  const allDeptIds = useMemo(() => (departmentsQuery.data ?? []).map((d) => d.id), [departmentsQuery.data])
  const availabilityQuery = useQuery({
    queryKey: ['availability', 'dashboard', dayServiceIds],
    queryFn: () => fetchAvailabilityFor(dayServiceIds),
    enabled: dayServiceIds.length > 0,
  })
  const rostersQuery = useQuery({
    queryKey: ['dashboard-rosters', allDeptIds],
    queryFn: () => fetchMembersForDepartments(allDeptIds),
    enabled: allDeptIds.length > 0,
  })
  const coreByDept = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const m of rostersQuery.data ?? []) {
      if (m.member_type !== 'core') continue
      map.set(m.department_id, [...(map.get(m.department_id) ?? []), m.user_id])
    }
    return map
  }, [rostersQuery.data])

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

  const departmentName = (id: string) =>
    departmentsQuery.data?.find((d) => d.id === id)?.name ?? 'Unknown department'

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
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-headline-md">{formatServiceDay(viewedDate)}</div>
            <div className="text-body-sm text-on-surface-variant">
              {viewedDate === today
                ? 'Today’s services'
                : viewedDate > today
                  ? 'Upcoming services'
                  : 'Past service day'}
            </div>
          </div>

          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => stepDay(-1)}
                className="rounded-sm border border-border-subtle px-2.5 py-1.5 text-body-sm text-on-surface hover:border-secondary"
              >
                ‹ Previous
              </button>
              <input
                type="date"
                value={viewedDate}
                onChange={(e) => e.target.value && setAdminDate(e.target.value)}
                aria-label="Service day"
                className="rounded-sm border border-border-subtle px-3 py-1.5 text-body-sm text-on-surface"
              />
              <button
                type="button"
                onClick={() => stepDay(1)}
                className="rounded-sm border border-border-subtle px-2.5 py-1.5 text-body-sm text-on-surface hover:border-secondary"
              >
                Next ›
              </button>
              {viewedDate !== defaultDate && (
                <button
                  type="button"
                  onClick={() => setAdminDate(null)}
                  className="rounded-sm border border-border-subtle px-2.5 py-1.5 text-body-sm text-on-surface hover:border-secondary"
                >
                  Next service
                </button>
              )}
            </div>
          )}
        </div>

        {dayServices.length === 0 ? (
          <p className="mt-8 text-body-sm text-on-surface-variant">
            No services scheduled for this day.{' '}
            {isAdmin && (
              <>
                Add one from the{' '}
                <Link to="/service-planner" className="text-secondary">
                  Service Planner
                </Link>
                .
              </>
            )}
          </p>
        ) : (
          <div className="mt-6 flex flex-col gap-6">
            {dayServices.map((service) => {
              const serviceChecklistIds = new Set(
                (checklistsQuery.data ?? []).filter((c) => c.service_id === service.id).map((c) => c.id),
              )
              const serviceItems = items.filter((i) => serviceChecklistIds.has(i.checklist_id))

              const counts = {
                total: serviceItems.length,
                memberComplete: serviceItems.filter((i) => i.status === 'member_complete').length,
                headVerified: serviceItems.filter((i) => i.status === 'head_verified').length,
                coordinatorVerified: serviceItems.filter((i) => i.status === 'coordinator_verified').length,
              }

              // Availability for this service, per team, plus the whole-
              // roster total across every team the viewer can see.
              const serviceAvailability = (availabilityQuery.data ?? []).filter(
                (a) => a.service_id === service.id,
              )
              const availabilityTeams = (departmentsQuery.data ?? [])
                .filter((d) => (coreByDept.get(d.id) ?? []).length > 0)
                .map((d) => {
                  const deptAnswers = serviceAvailability.filter((a) => a.department_id === d.id)
                  return {
                    dept: d,
                    summary: availabilitySummary(coreByDept.get(d.id) ?? [], deptAnswers),
                    turnout: turnoutFrom(deptAnswers),
                  }
                })
              const serviceTurnout = combineTurnout(availabilityTeams.map((t) => t.turnout))
              const overallAvailability = availabilityTeams.reduce(
                (acc, t) => ({
                  total: acc.total + t.summary.total,
                  available: acc.available + t.summary.available,
                  tentative: acc.tentative + t.summary.tentative,
                  unavailable: acc.unavailable + t.summary.unavailable,
                  noAnswer: acc.noAnswer + t.summary.noAnswer,
                  pct: 0,
                }),
                { total: 0, available: 0, tentative: 0, unavailable: 0, noAnswer: 0, pct: 0 },
              )
              overallAvailability.pct =
                overallAvailability.total > 0
                  ? Math.round((overallAvailability.available / overallAvailability.total) * 100)
                  : 0

              const deptIds = [
                ...new Set([
                  ...(checklistsQuery.data ?? [])
                    .filter((c) => c.service_id === service.id)
                    .map((c) => c.department_id),
                ]),
              ]

              return (
                <section
                  key={service.id}
                  className="overflow-hidden rounded-lg border border-border-subtle bg-surface-lowest"
                >
                  <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border-subtle px-6 py-4">
                    <h2 className="text-headline-md">{service.service_type}</h2>
                    <Link
                      to={`/service-planner/${service.id}`}
                      className="text-body-sm font-medium text-secondary"
                    >
                      Running order ›
                    </Link>
                  </header>

                  {/* Estimate and outcome sit side by side so they can be
                      read against each other; the checklist is a separate
                      concern and gets its own full-width row below. The
                      gap-px over a tinted parent draws the hairlines. */}
                  <div className="grid grid-cols-1 gap-px bg-border-subtle sm:grid-cols-2">
                    <div className="bg-surface-lowest p-6">
                      <div className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
                        Availability · estimate
                      </div>
                      {availabilityTeams.length === 0 ? (
                        <p className="mt-3 text-body-sm text-on-surface-variant">No teams to report on.</p>
                      ) : (
                        <>
                          <div className="mt-3 flex items-baseline gap-2">
                            <span className="text-headline-lg">{overallAvailability.pct}%</span>
                            <span className="font-mono text-label-sm text-on-surface-variant">
                              {overallAvailability.available} of {overallAvailability.total} available
                            </span>
                          </div>
                          <div className="mt-2">
                            <AvailabilityBar summary={overallAvailability} label="All teams" />
                          </div>

                          <ul className="mt-4 divide-y divide-border-subtle">
                            {availabilityTeams.map(({ dept, summary }) => (
                              <li key={dept.id} className="py-3 first:pt-0 last:pb-0">
                                <div className="flex items-center justify-between gap-2 text-body-sm">
                                  <span className="flex min-w-0 items-center gap-2">
                                    <span
                                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                                      style={{ backgroundColor: dept.color ?? DEFAULT_DEPT_COLOR }}
                                    />
                                    <span className="truncate text-on-surface">{dept.name}</span>
                                  </span>
                                  <span className="shrink-0 font-mono text-label-sm text-on-surface-variant">
                                    {summary.pct}% · {summary.available}/{summary.total}
                                  </span>
                                </div>
                                <div className="mt-1.5">
                                  <AvailabilityBar summary={summary} label={dept.name} />
                                </div>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                    <div className="bg-surface-lowest p-6">
                      <div className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
                        Attendance · actual
                      </div>
                      <div className="mt-3 flex items-baseline gap-2">
                        <span className="text-headline-lg">
                          {serviceTurnout.pct !== null ? `${serviceTurnout.pct}%` : '—'}
                        </span>
                        <span className="font-mono text-label-sm text-on-surface-variant">
                          {serviceTurnout.expected > 0
                            ? `${serviceTurnout.actual} of ${serviceTurnout.expected} expected`
                            : 'nobody has said yes yet'}
                        </span>
                      </div>
                      {serviceTurnout.unconfirmed > 0 && (
                        <p className="mt-1 font-mono text-label-sm text-on-surface-variant">
                          {serviceTurnout.unconfirmed} still to check in
                        </p>
                      )}

                      {availabilityTeams.length === 0 ? (
                        <p className="mt-4 text-body-sm text-on-surface-variant">No teams to report on.</p>
                      ) : (
                        <ul className="mt-4 divide-y divide-border-subtle">
                          {availabilityTeams.map(({ dept, turnout }) => (
                            <li key={dept.id} className="py-3 first:pt-0 last:pb-0">
                              <div className="flex items-center justify-between gap-2 text-body-sm">
                                <span className="truncate text-on-surface">{dept.name}</span>
                                <span className="shrink-0 font-mono text-label-sm text-on-surface-variant">
                                  {turnout.pct !== null ? `${turnout.pct}%` : '—'} · {turnout.actual}/
                                  {turnout.expected}
                                </span>
                              </div>
                              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-container">
                                <div
                                  className={`h-full rounded-full ${attendanceBarClass(turnout.pct)}`}
                                  style={{ width: `${Math.min(turnout.pct ?? 0, 100)}%` }}
                                />
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-border-subtle bg-surface-lowest p-6">
                    <div className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
                      Checklist readiness
                    </div>
                    <div className="mt-3">
                      <SegmentedProgressBar
                        total={counts.total}
                        memberComplete={counts.memberComplete}
                        headVerified={counts.headVerified}
                        coordinatorVerified={counts.coordinatorVerified}
                      />
                    </div>

                    {deptIds.length === 0 ? (
                      <p className="mt-4 text-body-sm text-on-surface-variant">No checklists yet.</p>
                    ) : (
                      <ul className="mt-4 divide-y divide-border-subtle">
                        {deptIds.map((deptId) => {
                          const deptItems = serviceItems.filter(
                            (i) => checklistById.get(i.checklist_id)?.department_id === deptId,
                          )
                          const done = deptItems.filter((i) => i.status !== 'pending').length
                          return (
                            <li key={deptId} className="py-3 first:pt-0 last:pb-0">
                              <div className="flex items-center justify-between gap-2 text-body-sm">
                                <Link
                                  to={`/checklists/${deptId}/${service.id}`}
                                  className="truncate text-on-surface hover:text-secondary"
                                >
                                  {departmentName(deptId)}
                                </Link>
                                <span className="shrink-0 font-mono text-label-sm text-on-surface-variant">
                                  {done}/{deptItems.length} tasks
                                </span>
                              </div>
                              <div className="mt-1.5">
                                <SegmentedProgressBar
                                  showLegend={false}
                                  total={deptItems.length}
                                  memberComplete={deptItems.filter((i) => i.status === 'member_complete').length}
                                  headVerified={deptItems.filter((i) => i.status === 'head_verified').length}
                                  coordinatorVerified={
                                    deptItems.filter((i) => i.status === 'coordinator_verified').length
                                  }
                                />
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                    </div>
                </section>
              )
            })}

            <section className="rounded-lg border border-border-subtle bg-surface-lowest p-6">
              <div className="text-headline-md">Live Activity</div>
              <QueryState
                isLoading={itemsQuery.isLoading}
                error={itemsQuery.error}
                isEmpty={activityItems.length === 0}
                emptyMessage="No verification activity yet for this day."
              >
                <ul className="mt-4 flex flex-col gap-3">
                  {activityItems.map(({ item, actorId, at }) => (
                    <li key={`${item.id}-${item.status}`} className="text-body-sm">
                      <span className="font-medium text-on-surface">{actorsQuery.data?.[actorId] ?? '…'}</span>{' '}
                      <span className="text-on-surface-variant">
                        {actionLabel[item.status as Exclude<ChecklistItemStatus, 'pending'>]}
                      </span>{' '}
                      <span className="font-medium text-on-surface">{item.role_label}</span>
                      <div className="font-mono text-label-sm text-on-surface-variant">
                        {formatRelativeTime(at)}
                      </div>
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
