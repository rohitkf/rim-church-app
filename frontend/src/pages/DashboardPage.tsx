import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { formatRelativeTime } from '../lib/relativeTime'
import {
  fetchAvailabilityFor,
  fetchDepartments,
  fetchMembersForDepartments,
  fetchOwnDepartmentIds,
  fetchRoleChecklistItems,
  fetchRotaAssignments,
  fetchRotaProgress,
  fetchServices,
} from '../lib/queries'
import { serviceReadiness } from '../lib/readiness'
import { StatusChip } from '../components/SectionPanel'
import {
  ActionButton,
  Eyebrow,
  PageHeader,
  Panel,
  Pill,
  StackedBar,
  Statistic,
  Tile,
} from '../components/Surface'
import { CelebrationsPanel } from '../components/CelebrationsPanel'
import { ServiceCountdown } from '../components/ServiceCountdown'
import { ReadinessDonut } from '../components/ReadinessDonut'
import { availabilitySummary } from '../lib/availabilitySummary'
import { AvailabilityBar } from '../components/AvailabilityBar'
import { combineTurnout, turnoutFrom } from '../lib/turnout'
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

const roleChipTone: Record<RoleType, 'solid' | 'blue' | 'green'> = {
  admin: 'solid',
  department_head: 'blue',
  assisting_head: 'blue',
  service_flow_coordinator: 'green',
}

/** How far off a service is, in the words a person would use. */
function untilLabel(date: string, from = new Date()): string {
  const start = new Date(`${date}T00:00:00`)
  const midnight = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const days = Math.round((start.getTime() - midnight.getTime()) / 86_400_000)
  if (days < 0) return days === -1 ? 'Yesterday' : `${Math.abs(days)} days ago`
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days < 7) return `In ${days} days`
  const weeks = Math.round(days / 7)
  return weeks === 1 ? 'In a week' : `In ${weeks} weeks`
}

/** The time of day, said the way a person would say it. */
function greeting(now = new Date()): string {
  const hour = now.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/**
 * A team's availability as a small ring — the same shape as the readiness
 * ring so the two read as one family, at the size a row can carry.
 */
function TeamRing({ pct, color }: { pct: number; color: string }) {
  const size = 44
  const stroke = 6
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const filled = (Math.min(Math.max(pct, 0), 100) / 100) * circumference

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shrink-0">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-raised-strong"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
        />
      </g>
    </svg>
  )
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
  const { profile, roles, isAdmin, ledDepartmentIds, session } = useAuth()

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

  const itemsQuery = useQuery({
    queryKey: ['dashboard-items', checklistIds],
    queryFn: () => fetchItems(checklistIds),
    enabled: checklistIds.length > 0,
  })
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data])

  // Checklist readiness comes from the rota: whoever it puts on the service
  // owes the checklist of the role they were given, and every item passes
  // through member -> head -> coordinator. Same source as the Checklists page.
  const rotaQuery = useQuery({
    queryKey: ['dashboard-rota', dayServiceIds],
    queryFn: () => fetchRotaAssignments(dayServiceIds),
    enabled: dayServiceIds.length > 0,
  })
  const rota = useMemo(() => rotaQuery.data ?? [], [rotaQuery.data])

  // When each service actually starts, for the countdown — the running
  // order's first session, if one has been planned.
  const startsQuery = useQuery({
    queryKey: ['dashboard-service-starts', dayServiceIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_sessions')
        .select('service_id, start_time')
        .in('service_id', dayServiceIds)
        .order('start_time')
      if (error) throw error
      return z.array(z.object({ service_id: z.string(), start_time: z.string() })).parse(data)
    },
    enabled: dayServiceIds.length > 0,
  })
  const startsAt = useMemo(() => {
    const first = new Map<string, string>()
    for (const row of startsQuery.data ?? []) {
      if (!first.has(row.service_id)) first.set(row.service_id, row.start_time)
    }
    return first
  }, [startsQuery.data])
  const rotaDeptIds = useMemo(() => [...new Set(rota.map((a) => a.department_id))], [rota])
  const roleItemsQuery = useQuery({
    queryKey: ['role-checklist-items', rotaDeptIds],
    queryFn: () => fetchRoleChecklistItems(rotaDeptIds),
    enabled: rotaDeptIds.length > 0,
  })
  const assignmentIds = useMemo(() => rota.map((a) => a.id), [rota])
  const progressQuery = useQuery({
    queryKey: ['rota-progress', assignmentIds],
    queryFn: () => fetchRotaProgress(assignmentIds),
    enabled: assignmentIds.length > 0,
  })


  // Availability: who has said they can serve. RLS narrows both the
  // answers and the rosters to teams the viewer may see, so a team member
  // sees their own teams here and an Admin sees all of them.
  const ownDeptsQuery = useQuery({
    queryKey: ['own-departments', session?.user.id],
    queryFn: () => fetchOwnDepartmentIds(session!.user.id),
    enabled: !!session && !isAdmin,
  })

  // A head sees their own team's stats; a member sees the teams they're
  // on. Admins see everything.
  const visibleDepartments = useMemo(() => {
    const all = departmentsQuery.data ?? []
    if (isAdmin) return all
    const mine = new Set([...(ownDeptsQuery.data ?? []), ...ledDepartmentIds])
    return all.filter((d) => mine.has(d.id))
  }, [departmentsQuery.data, ownDeptsQuery.data, ledDepartmentIds, isAdmin])

  const allDeptIds = useMemo(() => visibleDepartments.map((d) => d.id), [visibleDepartments])
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
      <PageHeader
        live
        eyebrow={`${formatServiceDay(viewedDate)} · ${
          dayServices.length === 1 ? '1 service' : `${dayServices.length} services`
        }`}
        title={`${greeting()}${profile ? `, ${profile.first_name}` : ''}.`}
        description={
          roles.length > 0 ? (
            <span className="flex flex-wrap items-center gap-2">
              {roles.map((r) => (
                <Pill key={r.id} tone={roleChipTone[r.role_type]}>
                  {roleLabel[r.role_type]}
                </Pill>
              ))}
            </span>
          ) : (
            'Everything for the day, in one place.'
          )
        }
        action={
          isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton tone="quiet" size="sm" onClick={() => stepDay(-1)}>
                &lsaquo; Previous
              </ActionButton>
              <input
                type="date"
                value={viewedDate}
                onChange={(e) => e.target.value && setAdminDate(e.target.value)}
                aria-label="Service day"
                className="rounded-full bg-raised-strong px-3.5 py-1.5 font-mono text-label-md text-on-surface hairline-strong [color-scheme:dark]"
              />
              <ActionButton tone="quiet" size="sm" onClick={() => stepDay(1)}>
                Next &rsaquo;
              </ActionButton>
              {viewedDate !== defaultDate && (
                <ActionButton tone="ghost" size="sm" onClick={() => setAdminDate(null)}>
                  Next service
                </ActionButton>
              )}
            </div>
          )
        }
      />

      <QueryState isLoading={isLoading} error={error}>
        {dayServices.length === 0 ? (
          <p className="mt-8 text-body-sm text-on-surface-variant">
            No services scheduled for this day.{' '}
            {isAdmin && (
              <>
                Add one from the{' '}
                <Link to="/service-planner?new=1" className="text-primary">
                  Service Planner
                </Link>
                .
              </>
            )}
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {dayServices.map((service, serviceIndex) => {
              const { overall: readiness, byDepartment: readinessByDept } = serviceReadiness({
                assignments: rota.filter((a) => a.service_id === service.id),
                roleItems: roleItemsQuery.data ?? [],
                progress: progressQuery.data ?? [],
              })

              // Availability for this service, per team, plus the whole-
              // roster total across every team the viewer can see.
              const serviceAvailability = (availabilityQuery.data ?? []).filter(
                (a) => a.service_id === service.id,
              )
              const availabilityTeams = visibleDepartments
                .filter((d) => (coreByDept.get(d.id) ?? []).length > 0)
                .map((d) => {
                  const deptAnswers = serviceAvailability.filter((a) => a.department_id === d.id)
                  return {
                    dept: d,
                    summary: availabilitySummary(coreByDept.get(d.id) ?? [], deptAnswers),
                    turnout: turnoutFrom(coreByDept.get(d.id) ?? [], deptAnswers),
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

              const teamsNeedingAnswers = availabilityTeams.filter((t) => t.summary.noAnswer > 0)

              return (
                /*
                 * The design's rhythm: 7/5, then 5/7. Alternating the wide
                 * tile keeps a long day from reading as two stacked columns,
                 * and every tile is the same object — only its span changes.
                 */
                <div key={service.id} className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                  {/* The one thing that is true right now. */}
                  <Tile tone="accent" className="flex flex-col justify-between lg:col-span-7">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <Eyebrow>{serviceIndex === 0 ? 'Next service' : 'Also on'}</Eyebrow>
                        <h2 className="mt-2.5 text-headline-lg">{service.service_type}</h2>
                        <p className="mt-1.5 text-body-md text-on-surface-variant">
                          {availabilityTeams.length}{' '}
                          {availabilityTeams.length === 1 ? 'team' : 'teams'} on duty
                        </p>
                      </div>
                      {readiness.total > 0 && (
                        <StatusChip
                          tone={
                            readiness.pct === 100 ? 'good' : (readiness.pct ?? 0) >= 50 ? 'warn' : 'bad'
                          }
                        >
                          {readiness.pct === 100
                            ? 'Ready'
                            : (readiness.pct ?? 0) >= 50
                              ? 'On track'
                              : 'Behind'}
                        </StatusChip>
                      )}
                    </div>

                    <div className="mt-8">
                      {/* A clock only earns its size inside the last day.
                          Before that the useful answer is which day. */}
                      <ServiceCountdown
                        startsAt={startsAt.get(service.id) ?? null}
                        variant="hero"
                        fallback={
                          <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
                            <span className="text-headline-xl">{untilLabel(service.date)}</span>
                            <span className="pb-1.5 font-mono text-eyebrow uppercase text-on-surface-faint">
                              {formatServiceDay(service.date)}
                            </span>
                          </div>
                        }
                      />
                      <div className="mt-5 flex flex-wrap gap-2.5">
                        <Link
                          to={`/service-planner/${service.id}`}
                          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-body-sm font-medium text-on-primary transition-transform duration-500 ease-[var(--ease-glide)] active:scale-[0.98]"
                        >
                          Open running order
                          <span aria-hidden="true">&rarr;</span>
                        </Link>
                        {overallAvailability.noAnswer > 0 && (
                          <Link
                            to="/availability"
                            className="inline-flex items-center rounded-full bg-raised-strong px-5 py-3 text-body-sm font-medium text-on-surface hairline-strong transition-transform duration-500 ease-[var(--ease-glide)] active:scale-[0.98]"
                          >
                            {overallAvailability.noAnswer} still to answer
                          </Link>
                        )}
                      </div>
                    </div>
                  </Tile>

                  {/* Readiness, as the one big ring the screen is allowed. */}
                  <Tile className="lg:col-span-5">
                    <div className="flex items-baseline justify-between gap-4">
                      <Eyebrow>Service readiness</Eyebrow>
                      <span className="font-mono text-label-sm text-on-surface-faint">
                        {readiness.coordinatorVerified}/{readiness.total} signed off
                      </span>
                    </div>
                    {readiness.total === 0 ? (
                      <p className="mt-5 text-body-sm text-on-surface-variant">
                        Nothing to check yet — readiness appears once the Team Rota puts people on
                        roles that have a checklist.
                      </p>
                    ) : (
                      <div className="mt-4 flex flex-wrap items-center gap-6">
                        <ReadinessDonut readiness={readiness} variant="hero" size={156} />
                        <ul className="flex min-w-[9rem] flex-1 flex-col gap-3.5 text-body-sm">
                          {[
                            { label: 'Signed off', n: readiness.coordinatorVerified, c: 'bg-status-coordinator' },
                            { label: 'Head verified', n: readiness.headVerified, c: 'bg-status-head' },
                            { label: 'Checked', n: readiness.memberComplete, c: 'bg-status-member' },
                            {
                              label: 'Not started',
                              n:
                                readiness.total -
                                readiness.coordinatorVerified -
                                readiness.headVerified -
                                readiness.memberComplete,
                              c: 'bg-status-pending',
                            },
                          ].map((row) => (
                            <li key={row.label} className="flex items-center gap-2.5">
                              <span
                                aria-hidden="true"
                                className={`h-2.5 w-2.5 shrink-0 rounded-full ${row.c}`}
                              />
                              {row.label}
                              <span className="ml-auto font-mono text-label-sm text-on-surface-faint">
                                {row.n}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </Tile>

                  {/* Estimate and outcome, side by side, same denominator. */}
                  <Tile className="lg:col-span-5">
                    <Eyebrow>People</Eyebrow>
                    {availabilityTeams.length === 0 ? (
                      <p className="mt-5 text-body-sm text-on-surface-variant">
                        No teams to report on.
                      </p>
                    ) : (
                      <>
                        <div className="mt-5 flex flex-wrap gap-6 sm:flex-nowrap">
                          <div className="min-w-[9rem] flex-1">
                            <div className="text-body-sm text-on-surface-variant">
                              Said they can serve
                            </div>
                            <Statistic
                              className="mt-1"
                              value={`${overallAvailability.pct}%`}
                              unit={`${overallAvailability.available}/${overallAvailability.total}`}
                            />
                            <div className="mt-3">
                              <AvailabilityBar summary={overallAvailability} label="All teams" />
                            </div>
                          </div>
                          <div aria-hidden="true" className="hidden w-px bg-border-subtle sm:block" />
                          <div className="min-w-[9rem] flex-1">
                            <div className="text-body-sm text-on-surface-variant">Turned up</div>
                            <Statistic
                              className="mt-1"
                              value={serviceTurnout.pct !== null ? `${serviceTurnout.pct}%` : '—'}
                              unit={
                                serviceTurnout.expected > 0
                                  ? `${serviceTurnout.present}/${serviceTurnout.expected}`
                                  : undefined
                              }
                            />
                            <div className="mt-3">
                              <StackedBar
                                segments={[
                                  {
                                    key: 'present',
                                    value: serviceTurnout.present,
                                    className: 'bg-primary',
                                  },
                                  {
                                    key: 'rest',
                                    value: Math.max(
                                      serviceTurnout.expected - serviceTurnout.present,
                                      0,
                                    ),
                                    className: 'bg-transparent',
                                  },
                                ]}
                              />
                            </div>
                          </div>
                        </div>
                        <p className="mt-5 text-label-md text-on-surface-faint">
                          {serviceTurnout.keptPct !== null
                            ? `${serviceTurnout.keptPct}% of the ${serviceTurnout.committed} who said yes turned up`
                            : 'Nobody has been checked in yet'}
                          {serviceTurnout.unconfirmed > 0 &&
                            ` · ${serviceTurnout.unconfirmed} still to check in`}
                        </p>
                      </>
                    )}
                  </Tile>

                  {/* Every team at a glance, worst first — the tile you scan
                      when you only have ten seconds before the doors. */}
                  <Tile className="lg:col-span-7">
                    <div className="flex items-baseline justify-between gap-4">
                      <Eyebrow>Teams on duty</Eyebrow>
                      <Link to="/departments" className="text-label-md text-primary">
                        All teams
                      </Link>
                    </div>
                    {availabilityTeams.length === 0 ? (
                      <p className="mt-5 text-body-sm text-on-surface-variant">
                        No teams to report on.
                      </p>
                    ) : (
                      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {availabilityTeams.map(({ dept, summary, turnout }) => (
                          <Link
                            key={dept.id}
                            to="/availability"
                            className="flex items-center gap-3.5 rounded-[var(--radius-row)] bg-raised px-4 py-3.5 hairline transition-colors duration-300 ease-[var(--ease-glide)] hover:bg-raised-strong"
                          >
                            <TeamRing
                              pct={summary.pct}
                              color={
                                summary.noAnswer > 0
                                  ? 'var(--color-accent-red)'
                                  : summary.pct >= 75
                                    ? 'var(--color-accent-green)'
                                    : 'var(--color-accent-orange)'
                              }
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-body-sm font-medium text-on-surface">
                                {dept.name}
                              </span>
                              <span className="block font-mono text-label-sm text-on-surface-faint">
                                {summary.noAnswer > 0
                                  ? `${summary.noAnswer} unanswered`
                                  : `${summary.pct}% · ${turnout.present}/${summary.total} in`}
                              </span>
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                    {teamsNeedingAnswers.length > 0 && (
                      <p className="mt-4 text-label-md text-on-surface-faint">
                        {teamsNeedingAnswers.length}{' '}
                        {teamsNeedingAnswers.length === 1 ? 'team is' : 'teams are'} still waiting on
                        answers.
                      </p>
                    )}
                  </Tile>

                  {/* Per-team checklist rings, for the head who needs to know
                      which one to chase rather than the total. */}
                  {readinessByDept.size > 0 && (
                    <Tile className="lg:col-span-12">
                      <Eyebrow>Checklist readiness by team</Eyebrow>
                      <ul className="mt-5 flex flex-wrap gap-x-8 gap-y-5">
                        {[...readinessByDept.entries()].map(([deptId, deptReadiness]) => (
                          <li key={deptId}>
                            <Link
                              to="/checklists"
                              className="block rounded-[var(--radius-chip)] transition-opacity hover:opacity-80"
                              title={`${departmentName(deptId)} checklist`}
                            >
                              <ReadinessDonut
                                readiness={deptReadiness}
                                label={departmentName(deptId)}
                                size={96}
                              />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </Tile>
                  )}
                </div>
              )
            })}

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              <Panel title="Live activity" live className="lg:col-span-7">
                <QueryState
                  isLoading={itemsQuery.isLoading}
                  error={itemsQuery.error}
                  isEmpty={activityItems.length === 0}
                  emptyMessage="No verification activity yet for this day."
                >
                  <ul className="flex flex-col gap-3">
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
              </Panel>

              <div className="lg:col-span-5">
                <CelebrationsPanel />
              </div>
            </div>
          </div>
        )}
      </QueryState>
    </div>
  )
}
