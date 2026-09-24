import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { Chevron } from '../components/Collapsible'
import { SegmentedProgressBar } from '../components/ChecklistStatus'
import {
  fetchAvailabilityFor,
  fetchDepartments,
  fetchMembersForDepartments,
  fetchOwnMemberships,
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
import { ServiceCountdown } from '../components/ServiceCountdown'
import { ReadinessDonut, ReadinessLegend } from '../components/ReadinessDonut'
import { ActivityFeed } from '../components/ActivityFeed'
import { useMyTeams } from '../lib/useMyTeams'
import { availabilitySummary } from '../lib/availabilitySummary'
import { AvailabilityBar } from '../components/AvailabilityBar'
import { combineTurnout, turnoutFrom } from '../lib/turnout'
import { TeamTurnoutRow } from '../components/TeamTurnoutRow'
import { formatServiceDay, shiftSundayIso } from '../lib/sunday'
import { serviceStanding, type ServiceStanding } from '../lib/serviceState'
import { inStartOrder, opensOnItsOwn, upcomingServices } from '../lib/upcomingServices'
import { eventsOnDay, fetchEvents } from '../lib/churchEvents'
import { TodayEvents } from '../components/TodayEvents'
import { turnoutRing } from '../lib/teamTurnout'
import { todayIso } from '../lib/monthGrid'
import { formatTime } from '../lib/time'
import { greeting } from '../lib/greeting'
import { memberStanding, memberStandingLabel } from '../lib/memberStanding'
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
    // Grey is the figure that has not happened yet: what the team said it
    // would do, rather than what it did.
    { label: 'Expected, not yet counted', color: 'var(--color-status-pending, var(--color-on-surface-faint))' },
  ]

  return (
    <ul className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 ${className}`}>
      {/* The ring carries two arcs now, and which is which is not a thing
          a ring can say for itself. */}
      <li className="w-full text-label-md text-on-surface-faint">
        The faint arc is what the team expects; the solid one is who has turned up.
      </li>
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
  // Whether this page has teams to report on at all — see useMyTeams.
  const { onATeam, settled } = useMyTeams()

  // Today is what the page is anchored to: what is on, and what is still
  // coming. Admins alone can step off it to a particular day, which is how
  // a service that has already happened gets looked at again.
  const today = todayIso()
  const [adminDate, setAdminDate] = useState<string | null>(null)
  const focusDate = adminDate ?? today

  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: fetchServices })
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  // The diary, for the one part of it that is today. Same query key as the
  // Events page, so the two share a cache and a realtime invalidation.
  const eventsQuery = useQuery({ queryKey: ['church-events'], queryFn: fetchEvents })
  const eventsToday = useMemo(
    () => eventsOnDay(eventsQuery.data ?? [], today),
    [eventsQuery.data, today],
  )

  // Every distinct day that has services, so the steppers can land on
  // one that has something on it.
  const serviceDates = useMemo(
    () => [...new Set((servicesQuery.data ?? []).map((s) => s.date))].sort(),
    [servicesQuery.data],
  )

  // Step to the neighbouring service day rather than a fixed week, so
  // Previous/Next always lands on something worth looking at.
  function stepDay(delta: 1 | -1) {
    const ahead = delta === 1
    const candidates = ahead
      ? serviceDates.filter((d) => d > focusDate)
      : serviceDates.filter((d) => d < focusDate).reverse()
    setAdminDate(candidates[0] ?? shiftSundayIso(focusDate, delta))
  }

  // Two lists, one page: the day an Admin stepped to, or the next day with
  // services on it. The second is the normal one — just what is coming up,
  // not the fortnight after it; Previous/Next reach any other day.
  const dayServices = useMemo(
    () => (servicesQuery.data ?? []).filter((s) => s.date === focusDate),
    [servicesQuery.data, focusDate],
  )
  const listedServices = useMemo(
    () => (adminDate ? dayServices : upcomingServices(servicesQuery.data ?? [], today)),
    [adminDate, dayServices, servicesQuery.data, today],
  )
  const listedIds = useMemo(() => listedServices.map((s) => s.id), [listedServices])

  // The running orders themselves, not just their starts: a session's
  // length is what says when a service ends, and therefore whether it is
  // still on, still to come, or over. Fetched for every service in the
  // list, open or shut, because a shut row still carries a countdown.
  const startsQuery = useQuery({
    queryKey: ['dashboard-service-starts', listedIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_sessions')
        .select('id, service_id, start_time, duration_minutes')
        .in('service_id', listedIds)
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
    enabled: listedIds.length > 0,
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
  // to move on its own, without anyone reloading.
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

  // In the order they happen, which on a day with two services is a fact
  // about the running order rather than about the names.
  const services = useMemo(
    () => inStartOrder(listedServices, (s) => startsAt.get(s.id) ?? null),
    [listedServices, startsAt],
  )

  /*
   * What is unfolded, and what is merely listed.
   *
   * Every service is a line with a countdown on it; the rings, the bars and
   * the feed are behind that line. They open by themselves on the day —
   * the one morning the detail is worth the room — and by touch on any
   * other. A finished service stays shut whatever day it is: it is a
   * record, and a record that unfolds itself pushes the service still to
   * come off the screen.
   */
  const [openOverrides, setOpenOverrides] = useState<Record<string, boolean>>({})
  const isOpen = (service: { id: string; date: string }) =>
    openOverrides[service.id] ?? opensOnItsOwn(service.date, focusDate, standingOf(service.id).state)
  const toggleService = (service: { id: string; date: string }) =>
    setOpenOverrides((open) => ({ ...open, [service.id]: !isOpen(service) }))

  // Everything heavy hangs off this: a service nobody has opened costs one
  // row and no queries at all.
  const openIds = services.filter(isOpen).map((s) => s.id)

  // Checklist readiness comes from the rota: whoever it puts on the service
  // owes the checklist of the role they were given, and every item passes
  // through member -> head -> coordinator. Same source as the Checklists page.
  const rotaQuery = useQuery({
    queryKey: ['dashboard-rota', openIds],
    queryFn: () => fetchRotaAssignments(openIds),
    enabled: openIds.length > 0,
  })
  const rota = useMemo(() => rotaQuery.data ?? [], [rotaQuery.data])

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
  // Memberships, not just their ids: whether someone is core or a guest
  // is what the header calls them when they hold no role.
  const ownDeptsQuery = useQuery({
    queryKey: ['own-memberships', session?.user.id],
    queryFn: () => fetchOwnMemberships(session!.user.id),
    enabled: !!session && !isAdmin,
  })
  const ownMemberships = useMemo(() => ownDeptsQuery.data ?? [], [ownDeptsQuery.data])
  const personStanding = memberStanding(roles.length > 0, ownMemberships)

  // A head sees their own team's stats; a member sees the teams they're
  // on. Admins see everything.
  const visibleDepartments = useMemo(() => {
    const all = departmentsQuery.data ?? []
    if (isAdmin) return all
    const mine = new Set([...ownMemberships.map((m) => m.department_id), ...ledDepartmentIds])
    return all.filter((d) => mine.has(d.id))
  }, [departmentsQuery.data, ownMemberships, ledDepartmentIds, isAdmin])

  const allDeptIds = useMemo(() => visibleDepartments.map((d) => d.id), [visibleDepartments])
  const availabilityQuery = useQuery({
    queryKey: ['availability', 'dashboard', openIds],
    queryFn: () => fetchAvailabilityFor(openIds),
    enabled: openIds.length > 0,
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
        eyebrow={
          adminDate
            ? `${formatServiceDay(adminDate)} · ${
                dayServices.length === 1 ? '1 service' : `${dayServices.length} services`
              }`
            : `${formatServiceDay(today)} · ${
                services.length === 1 ? '1 service ahead' : `${services.length} services ahead`
              }`
        }
        title={`${greeting(new Date(clock))}${profile ? `, ${profile.first_name}` : ''}.`}
        description={
          roles.length > 0 ? (
            <span className="flex flex-wrap items-center gap-2">
              {roles.map((r) => (
                <Pill key={r.id} tone={roleChipTone[r.role_type]}>
                  {roleLabel[r.role_type]}
                </Pill>
              ))}
            </span>
          ) : personStanding ? (
            <span className="flex flex-wrap items-center gap-2">
              <Pill tone="neutral">{memberStandingLabel[personStanding]}</Pill>
            </span>
          ) : (
            'Everything for the day, in one place.'
          )
        }
        action={
          isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              {/* A date input is as wide as the locale's format makes it,
                  which on a phone leaves no room for a word on either
                  side — so the steppers keep their arrows and drop their
                  labels, and the input takes whatever is left. */}
              <ActionButton
                tone="quiet"
                size="sm"
                onClick={() => stepDay(-1)}
                aria-label="Previous day"
              >
                &lsaquo;<span className="hidden sm:inline">&nbsp;Previous</span>
              </ActionButton>
              <input
                type="date"
                value={focusDate}
                onChange={(e) => e.target.value && setAdminDate(e.target.value)}
                aria-label="Service day"
                className="min-w-0 flex-1 rounded-full bg-raised-strong px-3.5 py-1.5 font-mono text-label-md text-on-surface hairline-strong [color-scheme:dark] sm:flex-none"
              />
              <ActionButton tone="quiet" size="sm" onClick={() => stepDay(1)} aria-label="Next day">
                <span className="hidden sm:inline">Next&nbsp;</span>&rsaquo;
              </ActionButton>
              {adminDate && (
                <ActionButton tone="ghost" size="sm" onClick={() => setAdminDate(null)}>
                  What&rsquo;s coming
                </ActionButton>
              )}
            </div>
          )
        }
      />

      {/* What is on today, before anything about a service: an event
          happens once, and the morning of it is the last useful moment to
          be told. Nothing at all on the days there is nothing on. */}
      <TodayEvents events={eventsToday} className="mt-6" />

      <QueryState isLoading={isLoading} error={error}>
        {services.length === 0 ? (
          <p className="mt-8 text-body-sm text-on-surface-variant">
            {adminDate ? 'No services scheduled for this day.' : 'Nothing scheduled yet.'}{' '}
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
          <div className="mt-7 flex flex-col gap-5">
            <Eyebrow className="block">
              {adminDate ? 'Services that day' : 'Upcoming services'}
            </Eyebrow>
            {services.map((service) => {
              const standing = standingOf(service.id)
              const done = standing.state === 'done'
              const open = isOpen(service)
              const startTime = startsAt.get(service.id) ?? null
              // Of everything listed, the one actually coming next — which
              // is not always the first row, since a service that finished
              // this morning keeps its place in the day.
              const isNextUp =
                services.find((other) => standingOf(other.id).state !== 'done')?.id === service.id
              // The next service after this one, later the same day.
              const laterToday = services
                .filter((other) => other.date === service.date)
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
                  {/*
                   * The line, and everything a week can be planned around
                   * without opening it: which service, which day, what time
                   * and how long to go. On a Tuesday it is the whole of the
                   * dashboard; on the morning itself it opens by itself.
                   */}
                  <Tile
                    tone={standing.state === 'running' ? 'accent' : done ? 'success' : 'plain'}
                    padded={false}
                    className="lg:col-span-12"
                  >
                    <button
                      type="button"
                      onClick={() => toggleService(service)}
                      aria-expanded={open}
                      aria-controls={`dashboard-service-${service.id}`}
                      className="flex w-full items-start gap-4 p-5 text-left sm:p-6"
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className="text-headline-md">{service.service_type}</span>
                          {standing.state === 'running' ? (
                            <span className="font-mono text-label-sm uppercase tracking-wide text-primary">
                              On now
                            </span>
                          ) : done ? (
                            <span className="font-mono text-label-sm uppercase tracking-wide text-accent-green">
                              Finished
                            </span>
                          ) : null}
                        </span>
                        {/* Day, hour and how long to go, on one wrapping
                            run. The clock sat out on the right until a
                            phone wrapped the row and left the chevron
                            stranded on a line of its own, reading as a
                            stray character. Kept with the words it belongs
                            to, it wraps like words do. */}
                        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-label-sm text-on-surface-faint">
                          <span>{formatServiceDay(service.date)}</span>
                          {startTime && <span>{formatTime(startTime)}</span>}
                          {done && standing.to !== null && (
                            <span>ended {formatTime(new Date(standing.to).toISOString())}</span>
                          )}
                          {/* Opened, the hero below carries the clock, and
                              the same countdown twice on one card reads as
                              two different numbers until you check. */}
                          {!open && !done && standing.state !== 'running' && (
                            <ServiceCountdown
                              startsAt={startTime}
                              fallback={<span className="text-on-surface">{untilLabel(service.date, new Date(clock))}</span>}
                            />
                          )}
                        </span>
                      </span>
                      <span className="shrink-0 pt-1">
                        <Chevron open={open} />
                      </span>
                    </button>
                  </Tile>

                  {open && (
                  <div id={`dashboard-service-${service.id}`} className="contents">
                  {/* The one thing that is true right now. */}
                  <Tile
                    tone={standing.state === 'done' ? 'success' : 'accent'}
                    className="flex flex-col justify-between lg:col-span-7"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        {/* When it is, not just that it is next. The
                            countdown underneath says how long; a date and a
                            time say what to put in a diary. */}
                        {/* The row above already gave the name, the day and
                            the hour, so this says only which service of the
                            week it is — repeating the date here wrapped it
                            onto two lines of a phone to say nothing new. */}
                        <Eyebrow>
                          {standing.state === 'running'
                            ? 'Current service'
                            : standing.state === 'done'
                              ? 'Finished'
                              : isNextUp
                                ? 'Next service'
                                : 'Later service'}
                        </Eyebrow>
                        <p className="mt-2.5 text-body-md text-on-surface-variant">
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
                          {/* Green, not grey: done is an outcome, and it is
                              the colour a signed-off checklist and a
                              finished session already wear. */}
                          <span className="text-headline-xl text-accent-green">Finished</span>
                          {standing.to !== null && (
                            <span className="pb-1.5 font-mono text-eyebrow uppercase text-on-surface-faint">
                              ended {formatTime(new Date(standing.to).toISOString())}
                            </span>
                          )}
                        </div>
                      ) : (
                        <ServiceCountdown
                          startsAt={startTime}
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

                  {/*
                    Everything below the clock is somebody's team: how
                    ready they are, who is missing, what they have just
                    ticked. To a person who has signed up and not been put
                    on a team yet it is a wall of other people's
                    arrangements, so they get the countdown and the way in,
                    and the rest arrives with their first team.
                  */}
                  {onATeam && (
                    <>
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
                      <Link to="/departments" className="tap inline-flex items-center text-label-md text-primary">
                        All teams
                      </Link>
                    </div>
                    {/* Grey rings are predictions and coloured ones are
                        facts, which is not a thing a ring can say for
                        itself. */}
                    <TurnoutLegend className="mt-3" />
                    {availabilityTeams.length === 0 ? (
                      <p className="mt-5 text-body-sm text-on-surface-variant">
                        No teams to report on.
                      </p>
                    ) : (
                      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {availabilityTeams.map(({ dept, summary, turnout }) => (
                          <TeamTurnoutRow
                            key={dept.id}
                            name={dept.name}
                            ring={turnoutRing(summary, turnout)}
                          />
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

                  <ActivityFeed serviceId={service.id} className="lg:col-span-12" />
                    </>
                  )}

                  {!onATeam && settled && (
                    <Tile className="lg:col-span-12">
                      <Eyebrow>You are not on a team yet</Eyebrow>
                      <p className="mt-2 text-body-md text-on-surface-variant">
                        The countdown above is the whole church&rsquo;s. The rest of this page —
                        who is on duty, what each team still has to do — arrives once a team head
                        adds you to their team.
                      </p>
                      <Link
                        to="/departments"
                        className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-body-sm font-medium text-on-primary transition-transform duration-500 ease-[var(--ease-glide)] active:scale-[0.98]"
                      >
                        Find your team and ask to join
                        <span aria-hidden="true">&rarr;</span>
                      </Link>
                    </Tile>
                  )}
                  </div>
                  )}

                </div>
              )
            })}


          </div>
        )}
      </QueryState>
    </div>
  )
}
