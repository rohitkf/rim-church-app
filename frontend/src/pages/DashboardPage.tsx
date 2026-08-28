import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { SegmentedProgressBar } from '../components/ChecklistStatus'
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
  Pill,
  StackedBar,
  Statistic,
  Tile,
} from '../components/Surface'
import { CelebrationsPanel } from '../components/CelebrationsPanel'
import { ServiceCountdown } from '../components/ServiceCountdown'
import { ReadinessDonut, ReadinessLegend } from '../components/ReadinessDonut'
import { ActivityFeed } from '../components/ActivityFeed'
import { availabilitySummary } from '../lib/availabilitySummary'
import { AvailabilityBar } from '../components/AvailabilityBar'
import { combineTurnout, turnoutFrom } from '../lib/turnout'
import { focusSundayIso, formatServiceDay, shiftSundayIso } from '../lib/sunday'
import { nearestServiceDate } from '../lib/nearestService'
import { orderServices, serviceStanding, type ServiceStanding } from '../lib/serviceState'
import { turnoutRing } from '../lib/teamTurnout'
import { todayIso } from '../lib/monthGrid'
import { formatTime } from '../lib/time'
import type { RoleType } from '../auth/types'


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

/**
 * What the team rings mean.
 *
 * Four states, and the difference between two of them is the whole point:
 * grey is "the doors haven't opened", red is "nobody is coming". They look
 * identical as an empty ring, so only the key tells them apart.
 */
function TurnoutLegend({ className = '' }: { className?: string }) {
  const entries = [
    { label: 'All who said yes are in', color: 'var(--color-accent-green)' },
    { label: 'Some still missing', color: 'var(--color-accent-orange)' },
    { label: 'Nobody available', color: 'var(--color-accent-red)' },
    { label: 'Not checked in yet', color: 'var(--color-status-pending, var(--color-on-surface-faint))' },
  ]

  return (
    <ul className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 ${className}`}>
      {entries.map((entry) => (
        <li
          key={entry.label}
          className="flex items-center gap-1.5 text-label-md text-on-surface-variant"
        >
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: entry.color }}
          />
          {entry.label}
        </li>
      ))}
    </ul>
  )
}

const roleLabel: Record<RoleType, string> = {
  admin: 'Admin',
  department_head: 'Department Head',
  assisting_head: 'Assisting Head',
  service_flow_coordinator: 'Service Flow Coordinator',
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

  // Checklist readiness comes from the rota: whoever it puts on the service
  // owes the checklist of the role they were given, and every item passes
  // through member -> head -> coordinator. Same source as the Checklists page.
  const rotaQuery = useQuery({
    queryKey: ['dashboard-rota', dayServiceIds],
    queryFn: () => fetchRotaAssignments(dayServiceIds),
    enabled: dayServiceIds.length > 0,
  })
  const rota = useMemo(() => rotaQuery.data ?? [], [rotaQuery.data])

  // The first service after the viewed day, so that once everything here
  // has finished the page still has something to count down to rather
  // than just saying the day is over.
  const serviceAfterDay = useMemo(
    () =>
      (servicesQuery.data ?? [])
        .filter((s) => s.date > viewedDate)
        .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null,
    [servicesQuery.data, viewedDate],
  )

  // The running orders themselves, not just their starts: a session's
  // length is what says when a service ends, and therefore whether it is
  // still on, still to come, or over.
  const timedIds = useMemo(
    () => [...dayServiceIds, ...(serviceAfterDay ? [serviceAfterDay.id] : [])],
    [dayServiceIds, serviceAfterDay],
  )
  const startsQuery = useQuery({
    queryKey: ['dashboard-service-starts', timedIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_sessions')
        .select('id, service_id, start_time, duration_minutes')
        .in('service_id', timedIds)
        .order('start_time')
      if (error) throw error
      return z
        .array(
          z.object({
            id: z.string(),
            service_id: z.string(),
            start_time: z.string(),
            duration_minutes: z.number().nullable(),
          }),
        )
        .parse(data)
    },
    enabled: timedIds.length > 0,
  })
  const sessionsByService = useMemo(() => {
    const map = new Map<string, { id: string; start_time: string; duration_minutes: number | null }[]>()
    for (const row of startsQuery.data ?? []) {
      map.set(row.service_id, [...(map.get(row.service_id) ?? []), row])
    }
    return map
  }, [startsQuery.data])
  const startsAt = useMemo(() => {
    const first = new Map<string, string>()
    for (const row of startsQuery.data ?? []) {
      if (!first.has(row.service_id)) first.set(row.service_id, row.start_time)
    }
    return first
  }, [startsQuery.data])

  // Re-read the clock on a timer: a service crossing its own end time has
  // to move down the page on its own, without anyone reloading.
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const standingOf = useMemo(() => {
    const cache = new Map<string, ServiceStanding>()
    return (serviceId: string) => {
      const hit = cache.get(serviceId)
      if (hit) return hit
      const standing = serviceStanding(sessionsByService.get(serviceId) ?? [], clock)
      cache.set(serviceId, standing)
      return standing
    }
  }, [sessionsByService, clock])

  // On right now first, then what is still to come, then anything with no
  // running order, and finished services last.
  const orderedServices = useMemo(
    () => orderServices(dayServices, (s) => standingOf(s.id)),
    [dayServices, standingOf],
  )
  // "Over" means nothing here can still happen. A service with no running
  // order has no end time to have passed, so it only counts as over once
  // its whole day is behind us — otherwise one unplanned service would
  // keep a finished Sunday looking like it was still to come.
  const dayIsOver =
    dayServices.length > 0 &&
    dayServices.every((s) => {
      const state = standingOf(s.id).state
      return state === 'done' || (state === 'unplanned' && viewedDate < today)
    })
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
            {/* Everything today is over. Rather than leaving the page
                describing finished services as though they were pending,
                point at the next one and count towards it. */}
            {dayIsOver && (
              <Tile tone="accent" className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
                <div>
                  <Eyebrow>{serviceAfterDay ? 'Next service' : 'Nothing scheduled next'}</Eyebrow>
                  <h2 className="mt-2.5 text-headline-lg">
                    {serviceAfterDay ? serviceAfterDay.service_type : 'That’s the day done'}
                  </h2>
                  <p className="mt-1.5 text-body-md text-on-surface-variant">
                    {serviceAfterDay
                      ? `Every service on ${formatServiceDay(viewedDate)} has finished.`
                      : 'Every service has finished, and nothing else is on the calendar yet.'}
                  </p>
                </div>
                {serviceAfterDay && (
                  <ServiceCountdown
                    startsAt={startsAt.get(serviceAfterDay.id) ?? null}
                    variant="hero"
                    fallback={
                      <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
                        <span className="text-headline-xl">{untilLabel(serviceAfterDay.date)}</span>
                        <span className="pb-1.5 font-mono text-eyebrow uppercase text-on-surface-faint">
                          {formatServiceDay(serviceAfterDay.date)}
                        </span>
                      </div>
                    }
                  />
                )}
              </Tile>
            )}
            {orderedServices.map((service, serviceIndex) => {
              const standing = standingOf(service.id)
              // The next service after this one, on the same day.
              const laterToday = orderedServices
                .map((other) => ({ service: other, ...standingOf(other.id) }))
                .filter(
                  (other) =>
                    other.service.id !== service.id &&
                    other.state !== 'done' &&
                    other.from !== null &&
                    (standing.from === null || other.from > standing.from),
                )
                .sort((a, b) => (a.from ?? 0) - (b.from ?? 0))[0]
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
                  <Tile
                    tone={standing.state === 'done' ? 'plain' : 'accent'}
                    className="flex flex-col justify-between lg:col-span-7"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <Eyebrow>
                          {standing.state === 'running'
                            ? 'Current service'
                            : standing.state === 'done'
                              ? 'Finished'
                              : serviceIndex === 0
                                ? 'Next service'
                                : 'Also on'}
                        </Eyebrow>
                        <h2 className="mt-2.5 text-headline-lg">{service.service_type}</h2>
                        <p className="mt-1.5 text-body-md text-on-surface-variant">
                          {availabilityTeams.length}{' '}
                          {availabilityTeams.length === 1 ? 'team' : 'teams'} on duty
                        </p>
                        {/* One service being on doesn't mean the day is
                            done: when there is another later, say when,
                            small, so it informs without competing. */}
                        {standing.state === 'running' && laterToday && (
                          <p className="mt-2 font-mono text-label-sm text-on-surface-faint">
                            Next: {laterToday.service.service_type}
                            {laterToday.from !== null && ` · ${formatTime(new Date(laterToday.from).toISOString())}`}
                          </p>
                        )}
                      </div>
                      {readiness.total > 0 && standing.state !== 'done' && (
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
                      {/* A countdown is only the right answer while there
                          is something to count down to. Once the doors are
                          open the number that matters is when it ends, and
                          once it's over, that it is. */}
                      {standing.state === 'running' ? (
                        <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
                          <span className="text-headline-xl text-primary">On now</span>
                          {standing.to !== null && (
                            <span className="pb-1.5 font-mono text-eyebrow uppercase text-on-surface-faint">
                              until {formatTime(new Date(standing.to).toISOString())}
                            </span>
                          )}
                        </div>
                      ) : standing.state === 'done' ? (
                        <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
                          <span className="text-headline-xl text-on-surface-variant">Finished</span>
                          {standing.to !== null && (
                            <span className="pb-1.5 font-mono text-eyebrow uppercase text-on-surface-faint">
                              ended {formatTime(new Date(standing.to).toISOString())}
                            </span>
                          )}
                        </div>
                      ) : (
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
                      )}
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
                      <>
                        <div className="mt-4 flex flex-wrap items-center gap-6">
                          <ReadinessDonut readiness={readiness} variant="hero" size={156} />
                          <ul className="flex min-w-[9rem] flex-1 flex-col gap-3.5 text-body-sm">
                            {[
                              {
                                label: 'Signed off',
                                n: readiness.coordinatorVerified,
                                c: 'bg-status-coordinator',
                              },
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

                        {/* The ring says how ready; the bar says ready in what
                            way. The same 62% is a very different Sunday when
                            it is all member-checked and nothing signed off,
                            so the straight line stays alongside the circle. */}
                        <div className="mt-6">
                          <SegmentedProgressBar
                            showLegend={false}
                            total={readiness.total}
                            memberComplete={readiness.memberComplete}
                            headVerified={readiness.headVerified}
                            coordinatorVerified={readiness.coordinatorVerified}
                          />
                        </div>
                      </>
                    )}
                  </Tile>

                  {/* Per-team checklist rings, for the head who needs to know
                      which one to chase rather than the total. Directly
                      after the overall ring, because they are the same
                      question at two zoom levels: one says how ready the
                      service is, the other says which team is holding it
                      up, and reading either without the other means
                      scrolling to guess. */}
                  {readinessByDept.size > 0 && (
                    <Tile className="lg:col-span-7">
                      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                        <Eyebrow>Checklist readiness by team</Eyebrow>
                        {/* Two teams can both be 67% ready in different ways;
                            the ring says which, and this says how to read it. */}
                        <ReadinessLegend />
                      </div>
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
                      when you only have ten seconds before the doors.

                      Deliberately no team wash: this tile's colour belongs to
                      the readiness ring — red for unanswered, green for ready
                      — and two colour systems on one small row means neither
                      of them gets read. */}
                  <Tile className="lg:col-span-7">
                    <div className="flex items-baseline justify-between gap-4">
                      <Eyebrow>Teams on duty</Eyebrow>
                      <Link to="/departments" className="text-label-md text-primary">
                        All teams
                      </Link>
                    </div>
                    {/* The ring counts who turned up against who said they
                        would, so what the colours mean has to be said. */}
                    <TurnoutLegend className="mt-3" />
                    {availabilityTeams.length === 0 ? (
                      <p className="mt-5 text-body-sm text-on-surface-variant">
                        No teams to report on.
                      </p>
                    ) : (
                      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {availabilityTeams.map(({ dept, summary, turnout }) => {
                          const ring = turnoutRing(summary, turnout)
                          return (
                            <Link
                              key={dept.id}
                              to="/availability"
                              className="flex items-center gap-3.5 rounded-[var(--radius-row)] bg-raised px-4 py-3.5 hairline transition-colors duration-300 ease-[var(--ease-glide)] hover:bg-raised-strong"
                            >
                              <TeamRing pct={ring.pct} color={ring.color} />
                              <span className="min-w-0">
                                <span className="block truncate text-body-sm font-medium text-on-surface">
                                  {dept.name}
                                </span>
                                <span className="block font-mono text-label-sm text-on-surface-faint">
                                  {ring.caption}
                                </span>
                              </span>
                            </Link>
                          )
                        })}
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

                  <div className="lg:col-span-5">
                    <CelebrationsPanel />
                  </div>

                  <ActivityFeed serviceId={service.id} className="lg:col-span-12" />

                </div>
              )
            })}


          </div>
        )}
      </QueryState>
    </div>
  )
}
