import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Lifespan } from '../components/Lifespan'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { arrangeRoles, arrangeRotaRows } from '../lib/roleGroups'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { Chevron, useExpanded } from '../components/Collapsible'
import { ActionButton, Eyebrow, LiveDot, Overlay, PageHeader, Tile } from '../components/Surface'
import { Link } from 'react-router-dom'
import {
  fetchDepartmentRoles,
  fetchRoleGroupsFor,
  fetchDepartments,
  fetchAvailabilityFor,
  fetchMembersForDepartments,
  fetchOwnDepartmentIds,
  fetchServices,
} from '../lib/queries'
import { Select, selectPillClasses, type SelectItem } from '../components/Select'
import { todayIso } from '../lib/monthGrid'
import { LOOKAHEAD_DAYS, servicesAhead, servicesToShow, shiftIsoDays } from '../lib/rotaWindow'
import { formatServiceDay } from '../lib/sunday'
import { isLiveNow, serviceWindows } from '../lib/serviceWindow'
import { useFinishedServices } from '../lib/useFinishedServices'
import { useAppSettings } from '../lib/appSettings'
import { CallTimesPanel } from '../components/CallTimesPanel'
import { serviceDays } from '../lib/callTimes'
import { TeamMark } from '../components/TeamMark'
import { teamWash } from '../lib/teamGradient'
import { useTeamStyle } from '../lib/useTeamStyle'
import { useErrorText } from '../lib/useErrorText'
import { humanError, isRotaClash } from '../lib/humanError'
import { availableFirst, rotaConflict } from '../lib/rotaConflict'
import { isCoordinatorRole } from '../lib/useTeamCoordinator'
import { shownTags, tagStyle, useRotaTags } from '../lib/rotaTags'
import { skyStyle } from '../lib/coordinatorSky'
import { useMyTeams } from '../lib/useMyTeams'
import { usePermissions } from '../lib/usePermissions'
import { useConfirmAction } from '../components/ConfirmAction'
import { sectionServices } from '../lib/serviceSections'
import { ServiceSections } from '../components/ServiceSections'
import {
  rotaAssignmentSchema,
  rotaReleaseRequestSchema,
  type RotaAssignment,
  type RotaReleaseRequest,
} from '../lib/types'

/** " (Shadow)" — the tags someone's existing assignment carries, for a greyed name. */
function tagNote(tags: { name: string; shown: boolean; sort_order: number }[]): string {
  const names = shownTags(tags).map((t) => t.name)
  return names.length ? ` (${names.join(', ')})` : ''
}

async function fetchRota(serviceIds: string[]): Promise<RotaAssignment[]> {
  if (serviceIds.length === 0) return []
  const { data, error } = await supabase
    .from('rota_assignments')
    .select(
      'id, service_id, department_id, user_id, role_label, role_id, include_pre, include_post, assignment_tags:rota_assignment_tags(tag:rota_tags(id, name, color, sort_order, shown)), profile:profiles!rota_assignments_user_id_fkey(id, first_name, last_name), department:departments(id, name, color)',
    )
    .in('service_id', serviceIds)
    .order('role_label')
  if (error) throw error
  return z.array(rotaAssignmentSchema).parse(data)
}

async function fetchReleaseRequests(): Promise<RotaReleaseRequest[]> {
  const { data, error } = await supabase
    .from('rota_release_requests')
    .select(
      'id, assignment_id, requested_by, requesting_department_id, requested_role_label, status, created_at, requester:profiles!rota_release_requests_requested_by_fkey(id, first_name, last_name), requesting_department:departments!rota_release_requests_requesting_department_id_fkey(id, name), assignment:rota_assignments(id, role_label, department_id, user_id, service_id, profile:profiles!rota_assignments_user_id_fkey(id, first_name, last_name), department:departments(id, name))',
    )
    .order('created_at', { ascending: false })
  if (error) throw error
  return z.array(rotaReleaseRequestSchema).parse(data)
}

export function TeamRotaPage() {
  const { session, isAdmin, isDepartmentHead } = useAuth()
  // Who may change the rota is the church's to set (Settings › Access &
  // privileges, 0133); these only decide which buttons to draw.
  const { can } = usePermissions()
  const { teamStyle } = useTeamStyle()
  const errorText = useErrorText()
  const myId = session?.user.id
  const queryClient = useQueryClient()
  const today = todayIso()
  const settings = useAppSettings()

  const [draftRole, setDraftRole] = useState<Record<string, string>>({})
  const [draftPerson, setDraftPerson] = useState<Record<string, string>>({})
  const [draftTags, setDraftTags] = useState<Record<string, string[]>>({})
  // Which halves of the checklist a new assignment carries; both unless unticked.
  const [draftHalves, setDraftHalves] = useState<Record<string, { pre: boolean; post: boolean }>>({})
  const tagsQuery = useRotaTags()
  const offeredTags = shownTags(tagsQuery.data ?? [])
  const [error, setError] = useState<string | null>(null)
  // A second role at one service, said where it can't be missed: the
  // banner above sits at the top of a page the form is a long way down.
  const [clashNotice, setClashNotice] = useState<{ title: string; body: string } | null>(null)
  // Which team's assign form is open, keyed `${serviceId}:${departmentId}`.
  // Collapsed by default: a form under every team on every service was the
  // bulk of what made this page a wall of dropdowns.
  const [openForm, setOpenForm] = useState<Record<string, boolean>>({})
  // Finished services fold away: they are a record, not a question, and a
  // page that opens on last Sunday's rota buries next Sunday's.
  const { isExpanded, toggle: toggleService } = useExpanded()

  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: fetchServices })
  /*
   * Which upcoming services this person is actually on.
   *
   * Asked without a window around it, so a service further out than the
   * page's own list cannot fall out of the answer — which is exactly how an
   * assignment two Sundays away became invisible to the person holding it.
   */
  const myServicesQuery = useQuery({
    queryKey: ['my-rota-services', myId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rota_assignments')
        .select('service_id')
        .eq('user_id', myId!)
      if (error) throw error
      return z.array(z.object({ service_id: z.string() })).parse(data).map((r) => r.service_id)
    },
    enabled: !!myId,
  })
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  const ownDeptsQuery = useQuery({
    queryKey: ['own-departments', myId],
    queryFn: () => fetchOwnDepartmentIds(myId!),
    enabled: !!myId,
  })

  // Everything still to come, out to the look-ahead. Which of these have
  // finished decides the window, so it has to be known before the window is
  // drawn — hence the wider list first, narrowed a few lines down.
  const candidates = useMemo(() => {
    const horizon = shiftIsoDays(today, LOOKAHEAD_DAYS)
    return servicesAhead(servicesQuery.data ?? [], today).filter((s) => s.date <= horizon)
  }, [servicesQuery.data, today])
  const candidateIds = useMemo(() => candidates.map((s) => s.id), [candidates])

  // Finished comes from the same hook the checklists and the availability
  // tracker use, so a service cannot be closed on one page and open here.
  const { isFinished } = useFinishedServices(candidateIds)

  const upcoming = useMemo(
    () =>
      servicesToShow(candidates, today, {
        days: settings.rota_window_days,
        mine: settings.always_show_my_services
          ? new Set(myServicesQuery.data ?? [])
          : new Set<string>(),
        isFinished,
      }),
    [candidates, today, myServicesQuery.data, isFinished, settings],
  )
  const upcomingIds = useMemo(() => upcoming.map((s) => s.id), [upcoming])

  // Which of these is happening right now, from its running order. Re-read
  // on a minute's tick so a service starts and finishes on screen without a
  // refresh — this page is open on a stage for hours.
  const sessionsQuery = useQuery({
    queryKey: ['rota-service-sessions', upcomingIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_sessions')
        .select('service_id, start_time, duration_minutes')
        .in('service_id', upcomingIds)
      if (error) throw error
      return z
        .array(
          z.object({
            service_id: z.string(),
            start_time: z.string(),
            duration_minutes: z.number().nullable(),
          }),
        )
        .parse(data)
    },
    enabled: upcomingIds.length > 0,
  })
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(tick)
  }, [])
  const windows = useMemo(
    () =>
      serviceWindows(sessionsQuery.data ?? [], {
        leadInMinutes: settings.lead_in_minutes,
        runOutMinutes: settings.run_out_minutes,
      }),
    [sessionsQuery.data, settings],
  )

  // Ordered with what has happened last: the rota is read to find out who
  // is on next, and a service that is over answers nothing.
  const listed = useMemo(
    () => [...upcoming].sort((a, b) => Number(isFinished(a.id)) - Number(isFinished(b.id))),
    [upcoming, isFinished],
  )

  // And then taken off the page proper altogether. Sorting a record last
  // still leaves it in the list; a Sunday evening's rota is three cards
  // of "who served", above the Sunday that has not been planned yet.
  // The four sections every page with services uses (lib/serviceSections).
  const sections = useMemo(
    () => sectionServices(upcoming, today, (s) => isFinished(s.id)),
    [upcoming, today, isFinished],
  )

  // Somebody the grid lets change any team's rota sees every team, the
  // way an Admin always has.
  const everyTeam = isAdmin || can('rota.assign')
  const myDepartments = useMemo(() => {
    const all = departmentsQuery.data ?? []
    if (everyTeam) return all
    const mine = new Set(ownDeptsQuery.data ?? [])
    return all.filter(
      (d) =>
        mine.has(d.id) || isDepartmentHead(d.id),
    )
  }, [departmentsQuery.data, ownDeptsQuery.data, everyTeam, isDepartmentHead])
  const myDepartmentIds = useMemo(() => myDepartments.map((d) => d.id), [myDepartments])

  /*
   * The teams you actually serve on.
   *
   * Deliberately not `myDepartments`, which counts a team you are head of
   * as yours — an Admin's copy of that list is every team in the church,
   * and a countdown against all eight says nothing about when *you* are
   * due. A head who does not serve on their own team gets the times
   * without a clock, which is the honest answer.
   */
  const myTeamIds = useMemo(() => new Set(ownDeptsQuery.data ?? []), [ownDeptsQuery.data])
  const { onATeam } = useMyTeams()

  /*
   * The days ahead that have something on, each with everything on it.
   *
   * Days rather than services: a team is called once for the morning and
   * then the day runs, so a Sunday with an English service and a Malayalam
   * service is one call time, not two. A finished service is a record and
   * nothing is worth setting on it.
   */
  const callTimeDays = useMemo(
    () => serviceDays(upcoming.filter((s) => !isFinished(s.id))),
    [upcoming, isFinished],
  )

  const rotaQuery = useQuery({
    queryKey: ['rota', upcomingIds],
    queryFn: () => fetchRota(upcomingIds),
    enabled: upcomingIds.length > 0,
  })
  const requestsQuery = useQuery({ queryKey: ['rota-requests'], queryFn: fetchReleaseRequests })
  // The rota can only draw on people who said they can serve, so the
  // Person list is built from availability rather than the whole roster.
  const availabilityQuery = useQuery({
    queryKey: ['availability', 'rota', upcomingIds],
    queryFn: () => fetchAvailabilityFor(upcomingIds),
    enabled: upcomingIds.length > 0,
  })

  const membersQuery = useQuery({
    queryKey: ['rota-members', myDepartmentIds],
    queryFn: () => fetchMembersForDepartments(myDepartmentIds),
    enabled: myDepartmentIds.length > 0,
  })
  const groupsQuery = useQuery({
    queryKey: ['role-groups', myDepartmentIds],
    queryFn: () => fetchRoleGroupsFor(myDepartmentIds),
  })

  const rolesQuery = useQuery({
    queryKey: ['department-roles', myDepartmentIds],
    queryFn: () => fetchDepartmentRoles(myDepartmentIds),
    enabled: myDepartmentIds.length > 0,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['rota', upcomingIds] })
    queryClient.invalidateQueries({ queryKey: ['rota-requests'] })
  }

  // Call times belong to Services & planning, which the grid does not set
  // yet: Admins and the team's Heads (Assisting Heads deputise), as before.
  const canSetCallTimes = (departmentId: string) => isAdmin || isDepartmentHead(departmentId)

  /*
   * The rota's four questions, each the grid's. "Their team" for a
   * Coordinator means the team they coordinate at that service, so each
   * asks the rota whether that is this person.
   */
  const coordinates = (serviceId: string, departmentId: string) =>
    (rotaQuery.data ?? []).some(
      (a) =>
        a.service_id === serviceId &&
        a.department_id === departmentId &&
        a.user_id === myId &&
        isCoordinatorRole(a.role_label),
    )
  const where = (serviceId: string, departmentId: string) => ({
    departmentId,
    coordinating: coordinates(serviceId, departmentId),
  })
  const canAssign = (serviceId: string, departmentId: string) =>
    can('rota.assign', where(serviceId, departmentId))
  const canTag = (serviceId: string, departmentId: string) => can('rota.tag', where(serviceId, departmentId))
  const canAskRelease = (serviceId: string, departmentId: string) =>
    can('rota.release_ask', where(serviceId, departmentId))
  const canAnswer = (r: RotaReleaseRequest) =>
    !!r.assignment && can('rota.release_decide', where(r.assignment.service_id, r.assignment.department_id))

  const addAssignment = useMutation({
    mutationFn: async ({
      serviceId,
      departmentId,
      userId,
      roleLabel,
      roleId,
      tagIds,
      halves,
    }: {
      serviceId: string
      departmentId: string
      userId: string
      roleLabel: string
      roleId: string | null
      tagIds: string[]
      halves: { pre: boolean; post: boolean }
    }) => {
      // One call, so a role is never left assigned without its tags.
      const { error } = await supabase.rpc('assign_to_rota', {
        service: serviceId,
        department: departmentId,
        person: userId,
        role_label: roleLabel,
        role: roleId,
        tags: tagIds,
        before_service: halves.pre,
        after_service: halves.post,
      })
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      setDraftRole((s) => ({ ...s, [`${vars.serviceId}:${vars.departmentId}`]: '' }))
      setDraftPerson((s) => ({ ...s, [`${vars.serviceId}:${vars.departmentId}`]: '' }))
      setDraftTags((s) => ({ ...s, [`${vars.serviceId}:${vars.departmentId}`]: [] }))
      setDraftHalves((s) => ({ ...s, [`${vars.serviceId}:${vars.departmentId}`]: { pre: true, post: true } }))
      // The role is filled, so the form has done its job — fold it away
      // rather than leaving an empty pair of dropdowns behind.
      setOpenForm((s) => ({ ...s, [`${vars.serviceId}:${vars.departmentId}`]: false }))
      setError(null)
      refresh()
    },
    onError: (err: unknown) => {
      // The check before sending catches this from what the page already
      // knows; this is the same answer when the page was out of date.
      if (isRotaClash(err)) {
        setClashNotice({
          title: 'Can’t assign that role',
          body: humanError(err, 'Could not assign that role.', false),
        })
        return
      }
      setError(errorText(err, 'Could not assign that role.'))
    },
  })

  // Which halves of the checklist an assignment carries, changed after the
  // fact. Never both off: the database refuses that too (0112).
  const setHalves = useMutation({
    mutationFn: async (v: { id: string; include_pre: boolean; include_post: boolean }) => {
      const { error } = await supabase
        .from('rota_assignments')
        .update({ include_pre: v.include_pre, include_post: v.include_post })
        .eq('id', v.id)
      if (error) throw error
    },
    onSuccess: refresh,
    onError: (err: unknown) => setError(errorText(err, 'Could not change which checklists that role carries.')),
  })

  const removeAssignment = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase.from('rota_assignments').delete().eq('id', assignmentId)
      if (error) throw error
    },
    onSuccess: refresh,
    onError: (err: unknown) => setError(errorText(err, 'Could not remove that assignment.')),
  })

  const requestRelease = useMutation({
    mutationFn: async ({
      assignmentId,
      requestingDepartmentId,
      roleLabel,
    }: {
      assignmentId: string
      requestingDepartmentId: string
      roleLabel: string
    }) => {
      const { error } = await supabase.from('rota_release_requests').insert({
        assignment_id: assignmentId,
        requested_by: myId,
        requesting_department_id: requestingDepartmentId,
        requested_role_label: roleLabel,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setError(null)
      refresh()
    },
    onError: (err: unknown) =>
      setError(errorText(err, 'Could not send the request.')),
  })

  const decideRequest = useMutation({
    mutationFn: async ({ request, approve }: { request: RotaReleaseRequest; approve: boolean }) => {
      // One step (0133): approving frees the person — the holding
      // assignment goes, which is what lets the asking team book them —
      // and the right to answer is all it needs.
      const { error } = await supabase.rpc('answer_release_request', {
        p_request: request.id,
        p_approve: approve,
      })
      if (error) throw error
    },
    onSuccess: refresh,
    onError: (err: unknown) => setError(errorText(err, 'Could not answer the request.')),
  })

  const assignments = rotaQuery.data ?? []
  const requests = requestsQuery.data ?? []

  // Requests waiting on me: I answer for the team that currently holds the person.
  const incoming = requests.filter((r) => r.status === 'pending' && canAnswer(r))

  const pendingFor = (assignmentId: string) =>
    requests.find((r) => r.assignment_id === assignmentId && r.status === 'pending')

  const { ask, dialog } = useConfirmAction()

  /* One service, and every team of mine on it. */
  const renderService = (service: (typeof listed)[number]) => {
              const finished = isFinished(service.id)
              // The live window pads fifteen minutes past the last session
              // so the badge doesn't blink out mid-handshake — but once the
              // service is finished it is finished, and a card cannot say
              // "on now" while refusing every button on it.
              const live = !finished && isLiveNow(service.id, windows, now)
              const serviceAssignments = assignments.filter((a) => a.service_id === service.id)
              const teamsWithPeople = myDepartments.filter((d) =>
                serviceAssignments.some((a) => a.department_id === d.id),
              ).length
              // Teams that have someone on them read first: they are what
              // the rota is actually saying, and the empty ones are a
              // reminder rather than the headline.
              const orderedTeams = [...myDepartments].sort((a, b) => {
                const filled = (id: string) => (serviceAssignments.some((x) => x.department_id === id) ? 0 : 1)
                return filled(a.id) - filled(b.id) || a.name.localeCompare(b.name)
              })

              // The service on the platform is the only one anyone cares
              // about while it is on, so it wears the accent tile and says
              // "on now" — and the rest stay quiet rather than competing.
              // Over means folded: the header still says what happened,
              // and touching it opens the teams underneath.
              const open = !finished || isExpanded(service.id)
              const heading = (
                /*
                  Name on its own line, everything about it on the next.
                  
                  These five things used to share one wrapping row, so the
                  date could end up beside the name, under it, or halfway
                  through the badge depending on the length of the service's
                  name — and the count landed wherever was left. A service
                  now reads the same way every time: what it is, then when,
                  then how it stands.
                */
                <div className="w-full">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {live && (
                      <span className="flex shrink-0 items-center gap-2">
                        <LiveDot />
                        <span className="font-mono text-label-sm uppercase tracking-[0.14em] text-accent-green-soft">
                          On now
                        </span>
                      </span>
                    )}
                    <h2 className="min-w-0 break-words text-headline-md leading-tight">
                      {service.service_type}
                    </h2>
                    {finished && (
                      <span className="shrink-0 whitespace-nowrap rounded-full bg-[color-mix(in_oklab,var(--color-accent-green)_16%,transparent)] px-2.5 py-1 font-mono text-label-sm uppercase tracking-wide text-accent-green">
                        Finished
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-label-sm text-on-surface-variant">
                    <span>{service.date === today ? 'Today' : formatServiceDay(service.date)}</span>
                    <span aria-hidden="true" className="text-on-surface-faint">·</span>
                    <span>{serviceAssignments.length} assigned</span>
                    <span aria-hidden="true" className="text-on-surface-faint">·</span>
                    <span>
                      {teamsWithPeople}/{myDepartments.length} teams
                    </span>
                    {finished && <Chevron open={open} />}
                  </div>
                </div>
              )

              return (
                <Tile
                  key={service.id}
                  as="section"
                  padded={false}
                  tone={live ? 'accent' : 'plain'}
                  className={`${
                    live
                      ? 'ring-1 ring-inset ring-[color-mix(in_oklab,var(--color-primary)_45%,transparent)]'
                      : ''
                  } ${finished ? 'opacity-70' : ''}`}
                >
                  <header className="px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
                    {finished ? (
                      <button
                        type="button"
                        onClick={() => toggleService(service.id)}
                        aria-expanded={open}
                        aria-controls={`rota-teams-${service.id}`}
                        className="flex w-full text-left"
                      >
                        {heading}
                      </button>
                    ) : (
                      heading
                    )}
                  </header>

                  {/* One card per team, so a head can find theirs without
                      reading past five others. */}
                  <ul
                    id={`rota-teams-${service.id}`}
                    hidden={!open}
                    className="grid grid-cols-1 gap-3 px-5 pb-5 sm:px-7 sm:pb-7 lg:grid-cols-2 xl:grid-cols-3">
                    {orderedTeams.map((dept) => {
                      const key = `${service.id}:${dept.id}`
                      const deptAssignments = serviceAssignments.filter((a) => a.department_id === dept.id)
                      // Who served is a matter of record once the service is over.
                      const manage = canAssign(service.id, dept.id) && !finished
                      const tagging = canTag(service.id, dept.id)
                      // Only people who marked themselves available for this
                      // service, on this team, can be put on the rota for it.
                      const availableHere = new Set(
                        (availabilityQuery.data ?? [])
                          .filter(
                            (a) =>
                              a.service_id === service.id &&
                              a.department_id === dept.id &&
                              a.status === 'available',
                          )
                          .map((a) => a.user_id),
                      )
                      // What each of them said with their yes — "only there by
                      // 8.30" — so it is read while choosing, not after.
                      const noteOf = (userId: string) =>
                        (availabilityQuery.data ?? []).find(
                          (a) =>
                            a.service_id === service.id &&
                            a.department_id === dept.id &&
                            a.user_id === userId,
                        )?.note ?? null
                      const roster = (membersQuery.data ?? []).filter(
                        (m) =>
                          m.department_id === dept.id &&
                          m.member_type === 'core' &&
                          availableHere.has(m.user_id),
                      )
                      const deptRoles = (rolesQuery.data ?? []).filter((r) => r.department_id === dept.id)
                      const deptGroups = (groupsQuery.data ?? []).filter(
                        (g) => g.department_id === dept.id,
                      )
                      // The same headings, in the same order, as the Teams
                      // page shows for this team.
                      const rolePicker = arrangeRoles({ roles: deptRoles, groups: deptGroups })
                      const formOpen = !!openForm[key]

                      const chosenPerson = draftPerson[key] ?? ''
                      // A conflict is the same person already holding a role
                      // anywhere else in this service.
                      const clash = chosenPerson
                        ? serviceAssignments.find((a) => a.user_id === chosenPerson && a.department_id !== dept.id)
                        : undefined
                      const clashRequest = clash ? pendingFor(clash.id) : undefined
                      // What each of this team's own people already holds
                      // here, for the role being picked. Greyed out in the
                      // list with the reason beside the name, rather than
                      // left out: a name that has vanished reads as a bug.
                      // Other teams' people stay pickable — choosing one is
                      // how a release gets asked for, below.
                      const heldInTeam = (userId: string, roleLabel: string) =>
                        rotaConflict(
                          serviceAssignments.filter((a) => a.department_id === dept.id),
                          { serviceId: service.id, departmentId: dept.id, userId, roleLabel },
                        )

                      return (
                        <li
                          key={dept.id}
                          className={`flex flex-col rounded-[var(--radius-panel)] px-4 py-4 sm:px-5 ${
                            deptAssignments.length === 0
                              ? 'border border-dashed border-outline-variant'
                              : 'bg-raised hairline'
                          }`}
                          style={
                            deptAssignments.length === 0 ? undefined : teamWash(dept.color, teamStyle)
                          }
                        >
                          {/*
                            A grid, not a wrapping row.
                            
                            With `flex-wrap` the button sat beside a short team
                            name and dropped under a long one, so a column of
                            six teams had its buttons at four different
                            heights and read as broken rather than as a list.
                            The name takes the space it needs, the count sits
                            under it, and the button is always in the same
                            place.
                          */}
                          <div className="grid grid-cols-[auto_1fr_auto] items-start gap-x-3 gap-y-1">
                            <TeamMark color={dept.color} />
                            <div className="min-w-0">
                              <div className="break-words text-headline-sm leading-tight">
                                {dept.name}
                              </div>
                              <div className="mt-1 font-mono text-label-sm uppercase text-on-surface-faint">
                                {deptAssignments.length === 0
                                  ? 'nobody yet'
                                  : `${deptAssignments.length} assigned`}
                              </div>
                            </div>

                            {manage ? (
                              <button
                                type="button"
                                onClick={() => setOpenForm((s) => ({ ...s, [key]: !formOpen }))}
                                aria-expanded={formOpen}
                                className="tap shrink-0 self-center rounded-full bg-raised-strong px-3.5 py-1.5 text-label-md text-on-surface transition-transform duration-500 ease-[var(--ease-glide)] active:scale-[0.98]"
                              >
                                {formOpen ? 'Cancel' : 'Assign role'}
                              </button>
                            ) : (
                              <span />
                            )}
                          </div>

                          {deptAssignments.length > 0 && (
                            /* Grouped under the same headings the Teams
                               page files these roles under, so somebody who
                               has just arranged Worship into Leaders,
                               Vocals and Band meets those three again here
                               rather than one flat list to re-read.

                               A team with no groups gets no headings and
                               the plain list it always had. */
                            <div className="mt-3.5 flex flex-col gap-3">
                              {(() => {
                                const arranged = arrangeRotaRows({
                                  rows: deptAssignments,
                                  roles: deptRoles,
                                  groups: deptGroups,
                                })
                                const bare =
                                  arranged.sections.length <= 1 && !arranged.sections[0]?.group
                                const renderRow = (a: (typeof deptAssignments)[number]) => {
                                  const pending = pendingFor(a.id)
                                  const mine = a.user_id === myId
                                  // The Coordinator's row is the night sky
                                  // the dashboard uses for today's events,
                                  // with the install button's glisten across
                                  // it: the one person the team looks to.
                                  // Dark in both themes, so its words carry
                                  // their own light colour.
                                  const sky = isCoordinatorRole(a.role_label)
                                  return (
                                      <li
                                        key={a.id}
                                        /* Role above, person below on a phone —
                                           "Camera Operator 1" and a full name
                                           were sharing one line and running into
                                           each other. One line again from `sm`. */
                                        style={sky ? skyStyle(settings.coordinator_color) : undefined}
                                        className={`group/assignment flex flex-col items-start gap-0.5 rounded-[var(--radius-chip)] px-3.5 py-2.5 text-body-sm sm:flex-row sm:items-center sm:gap-3 ${
                                          sky
                                            ? `galaxy glisten ${
                                                pending
                                                  ? 'shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent-orange)_45%,transparent)]'
                                                  : mine
                                                    ? 'shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent-blue)_55%,transparent)]'
                                                    : ''
                                              }`
                                            : pending
                                            ? 'bg-[color-mix(in_oklab,var(--color-accent-orange)_12%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent-orange)_24%,transparent)]'
                                            : mine
                                              ? 'bg-[color-mix(in_oklab,var(--color-accent-blue)_14%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent-blue)_28%,transparent)]'
                                              : 'bg-inset'
                                        }`}
                                      >
                                        {sky && (
                                          <>
                                            <span aria-hidden="true" className="galaxy-glow" />
                                            <span aria-hidden="true" className="galaxy-stars" />
                                            <span aria-hidden="true" className="galaxy-stars galaxy-stars-far" />
                                          </>
                                        )}
                                        <span
                                          className={`relative min-w-0 break-words sm:shrink-0 ${
                                            sky ? 'text-white/70' : 'text-on-surface-variant'
                                          }`}
                                        >
                                          {a.role_label}
                                          {/* Each in the colour the church
                                              gave it in App settings, so a
                                              trainee is spotted at a glance
                                              rather than read for. */}
                                          {shownTags(a.tags).map((tag) => (
                                            <span
                                              key={tag.id}
                                              className="ml-2 inline-block rounded-full px-2 py-0.5 align-middle font-mono text-label-sm font-medium uppercase"
                                              style={tagStyle(tag.color)}
                                            >
                                              {tag.name}
                                            </span>
                                          ))}
                                        </span>
                                        {/* The checklist halves this person carries. Shown
                                            to everyone when only one is, so the
                                            row says "Before only"; a manager can
                                            switch either, never both off. */}
                                        {(manage || !a.include_pre || !a.include_post) && (
                                          <span className="relative flex items-center gap-1.5" role="group" aria-label={`Checklists for ${a.role_label}`}>
                                            {(['pre', 'post'] as const).map((half) => {
                                              const on = half === 'pre' ? a.include_pre : a.include_post
                                              const other = half === 'pre' ? a.include_post : a.include_pre
                                              const label = half === 'pre' ? 'Before' : 'After'
                                              if (!manage && !on) return null
                                              return manage ? (
                                                <button
                                                  key={half}
                                                  type="button"
                                                  aria-pressed={on}
                                                  aria-label={`${label} the service checklist for ${a.role_label}`}
                                                  disabled={setHalves.isPending || (on && !other)}
                                                  onClick={() =>
                                                    setHalves.mutate({
                                                      id: a.id,
                                                      include_pre: half === 'pre' ? !on : a.include_pre,
                                                      include_post: half === 'post' ? !on : a.include_post,
                                                    })
                                                  }
                                                  className={`tap rounded-full px-2 py-0.5 font-mono text-label-sm uppercase transition-opacity disabled:cursor-not-allowed ${
                                                    on
                                                      ? half === 'pre'
                                                        ? 'bg-[color-mix(in_oklab,var(--color-accent-blue)_22%,transparent)] text-accent-blue-soft'
                                                        : 'bg-[color-mix(in_oklab,var(--color-accent-indigo)_24%,transparent)] text-accent-indigo-soft'
                                                      : `${sky ? 'text-white/50' : 'text-on-surface-faint'} opacity-70 line-through`
                                                  }`}
                                                >
                                                  {label}
                                                </button>
                                              ) : (
                                                <span
                                                  key={half}
                                                  className={`rounded-full px-2 py-0.5 font-mono text-label-sm uppercase ${
                                                    sky ? 'text-white/80' : 'text-on-surface-variant'
                                                  }`}
                                                >
                                                  {label} only
                                                </span>
                                              )
                                            })}
                                          </span>
                                        )}
                                        <span className="relative flex w-full min-w-0 items-center gap-2 sm:ml-auto sm:w-auto">
                                          {pending ? (
                                            <span className="shrink-0 font-mono text-label-sm uppercase text-accent-orange-soft">
                                              Release requested
                                            </span>
                                          ) : (
                                            <span className={`break-words ${sky ? 'text-white' : 'text-on-surface'}`}>
                                              {mine
                                                ? 'You'
                                                : a.profile
                                                  ? `${a.profile.first_name} ${a.profile.last_name}`
                                                  : 'Unknown'}
                                              {noteOf(a.user_id) && (
                                                <span
                                                  className={`block text-label-sm ${sky ? 'text-white/75' : 'text-on-surface-variant'}`}
                                                >
                                                  “{noteOf(a.user_id)}”
                                                </span>
                                              )}
                                            </span>
                                          )}
                                          {manage && (
                                            <button
                                              onClick={() =>
                                                ask({
                                                  title: `Take ${
                                                    a.profile
                                                      ? `${a.profile.first_name} ${a.profile.last_name}`
                                                      : 'this person'
                                                  } off ${a.role_label}?`,
                                                  body: 'The role goes back to unassigned for this service.',
                                                  confirmLabel: 'Remove',
                                                  onConfirm: () => removeAssignment.mutate(a.id),
                                                })
                                              }
                                              aria-label={`Remove ${a.role_label}`}
                                              /* Visible on a phone, where there
                                                 is no hover to reveal it with. */
                                              className={`ml-auto shrink-0 font-mono text-label-sm ${sky ? 'text-white/60' : 'text-on-surface-faint'} transition-opacity duration-300 hover:text-error focus:opacity-100 group-hover/assignment:opacity-100 sm:ml-0 sm:opacity-0`}
                                            >
                                              ✕
                                            </button>
                                          )}
                                        </span>
                                      </li>
                                  )
                                }
                                return (
                                  <>
                                    {arranged.coordinator.length > 0 && (
                                      <ul className="flex flex-col gap-2">
                                        {arranged.coordinator.map(renderRow)}
                                      </ul>
                                    )}
                                    {arranged.sections.map((section) => (
                                      <div key={section.group?.id ?? 'ungrouped'}>
                                        {!bare && section.group && (
                                          <h4 className="mb-1.5 font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
                                            {section.group.name}
                                          </h4>
                                        )}
                                        <ul className="flex flex-col gap-2">
                                          {section.rows.map(renderRow)}
                                        </ul>
                                      </div>
                                    ))}
                                  </>
                                )
                              })()}
                            </div>
                          )}

                          {formOpen && deptRoles.length === 0 && (
                            <p className="mt-3 rounded-[var(--radius-chip)] bg-surface-low px-3 py-2 text-body-sm text-on-surface-variant">
                              No roles defined for this team yet — add them under{' '}
                              <Link to={`/departments/${dept.id}`} className="text-secondary">
                                Teams → {dept.name} → Roles
                              </Link>
                              .
                            </p>
                          )}

                          {formOpen && deptRoles.length > 0 && roster.length === 0 && (
                            <p className="mt-3 rounded-[var(--radius-chip)] bg-surface-low px-3 py-2 text-body-sm text-on-surface-variant">
                              Nobody on this team has marked themselves available for this service
                              yet, so there is nobody to assign. They answer in the{' '}
                              <Link to="/availability" className="text-secondary">
                                Availability Tracker
                              </Link>
                              .
                            </p>
                          )}

                          {formOpen && deptRoles.length > 0 && roster.length > 0 && (
                            <form
                              onSubmit={(e: FormEvent) => {
                                e.preventDefault()
                                const role = (draftRole[key] ?? '').trim()
                                if (!role || !chosenPerson || clash) return
                                const held = rotaConflict(serviceAssignments, {
                                  serviceId: service.id,
                                  departmentId: dept.id,
                                  userId: chosenPerson,
                                  roleLabel: role,
                                })
                                if (held) {
                                  const who = held.profile
                                    ? `${held.profile.first_name} ${held.profile.last_name}`.trim()
                                    : 'They'
                                  const as = `${held.role_label}${tagNote(held.tags)}`
                                  setClashNotice(
                                    isCoordinatorRole(role)
                                      ? {
                                          title: `${who} is already ${held.department?.name ?? 'this team'}’s ${held.role_label}`,
                                          body: 'Someone can coordinate a team only once per service.',
                                        }
                                      : {
                                          title: `${who} already has a role in this service`,
                                          body: `They are ${as} for ${held.department?.name ?? 'this team'}. Apart from Team Coordinator, someone can hold only one role per service. Take them off that one first, or pick someone else.`,
                                        },
                                  )
                                  return
                                }
                                addAssignment.mutate({
                                  serviceId: service.id,
                                  departmentId: dept.id,
                                  userId: chosenPerson,
                                  roleLabel: role,
                                  roleId: deptRoles.find((r) => r.name === role)?.id ?? null,
                                  tagIds: draftTags[key] ?? [],
                                  halves: draftHalves[key] ?? { pre: true, post: true },
                                })
                              }}
                              className="mt-3 flex flex-wrap items-end gap-2 rounded-[var(--radius-chip)] bg-surface-low p-3"
                            >
                              <label className="flex min-w-40 flex-1 flex-col gap-1 text-label-sm text-on-surface-variant">
                                Role
                                <Select
                                  value={draftRole[key] ?? ''}
                                  onChange={(role) => {
                                    setDraftRole((s) => ({ ...s, [key]: role }))
                                    // A person picked first can't be left
                                    // holding a role they're not allowed.
                                    if (chosenPerson && heldInTeam(chosenPerson, role)) {
                                      setDraftPerson((s) => ({ ...s, [key]: '' }))
                                    }
                                  }}
                                  className={selectPillClasses}
                                  aria-label="Role"
                                  placeholder="Select…"
                                  /* The same headings the Teams page files
                                     these roles under: a group in the menu
                                     is a group on that page. */
                                  options={[
                                    ...(rolePicker.coordinator
                                      ? [
                                          {
                                            value: rolePicker.coordinator.name,
                                            label: rolePicker.coordinator.name,
                                          },
                                        ]
                                      : []),
                                    ...rolePicker.sections.flatMap<SelectItem>((section) =>
                                      section.roles.length === 0
                                        ? []
                                        : section.group
                                          ? [
                                              {
                                                label: section.group.name,
                                                options: section.roles.map((r) => ({
                                                  value: r.name,
                                                  label: r.name,
                                                })),
                                              },
                                            ]
                                          : // Ungrouped roles sit loose rather
                                            // than under a heading, so a team
                                            // with no groups sees the plain
                                            // list it saw before.
                                            section.roles.map((r) => ({
                                              value: r.name,
                                              label: r.name,
                                            })),
                                    ),
                                  ]}
                                />
                              </label>
                              <label className="flex min-w-40 flex-1 flex-col gap-1 text-label-sm text-on-surface-variant">
                                Person · available only
                                <Select
                                  value={chosenPerson}
                                  onChange={(person) =>
                                    setDraftPerson((s) => ({ ...s, [key]: person }))
                                  }
                                  className={selectPillClasses}
                                  aria-label="Person"
                                  placeholder="Select…"
                                  options={availableFirst(roster.map((m) => {
                                    const name = m.profiles
                                      ? `${m.profiles.first_name} ${m.profiles.last_name}`
                                      : m.user_id
                                    const held = heldInTeam(m.user_id, draftRole[key] ?? '')
                                    return held
                                      ? {
                                          value: m.user_id,
                                          label: `${name} — ${held.role_label}${tagNote(held.tags)}`,
                                          disabled: true,
                                        }
                                      : {
                                          value: m.user_id,
                                          label: noteOf(m.user_id)
                                            ? `${name} · “${noteOf(m.user_id)}”`
                                            : name,
                                        }
                                  }))}
                                />
                              </label>
                              {/* Which halves of the role's checklist this person
                                  carries at this service. Both unless one is
                                  unticked — and never neither. */}
                              <fieldset className="flex w-full flex-wrap items-center gap-x-4 gap-y-1.5">
                                <legend className="sr-only">Checklists for this role</legend>
                                <span className="text-label-sm text-on-surface-variant">Checklists:</span>
                                {(['pre', 'post'] as const).map((half) => {
                                  const now = draftHalves[key] ?? { pre: true, post: true }
                                  const other = half === 'pre' ? now.post : now.pre
                                  return (
                                    <label key={half} className="flex items-center gap-2 text-body-sm text-on-surface">
                                      <input
                                        type="checkbox"
                                        checked={now[half]}
                                        // The last one ticked cannot be unticked.
                                        disabled={now[half] && !other}
                                        onChange={(e) =>
                                          setDraftHalves((s) => ({ ...s, [key]: { ...now, [half]: e.target.checked } }))
                                        }
                                        className="h-4 w-4 accent-[var(--color-primary)]"
                                      />
                                      {half === 'pre' ? 'Before the service' : 'After the service'}
                                    </label>
                                  )
                                })}
                              </fieldset>
                              {/* The church's own tags, from App
                                  settings — as many as apply. */}
                              {tagging && offeredTags.length > 0 && (
                                <div className="flex w-full flex-wrap items-center gap-1.5" role="group" aria-label="Tags">
                                  {offeredTags.map((tag) => {
                                    const on = (draftTags[key] ?? []).includes(tag.id)
                                    return (
                                      <button
                                        key={tag.id}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() =>
                                          setDraftTags((s) => {
                                            const now = s[key] ?? []
                                            return {
                                              ...s,
                                              [key]: on ? now.filter((t) => t !== tag.id) : [...now, tag.id],
                                            }
                                          })
                                        }
                                        className={`tap rounded-full px-3 py-1.5 font-mono text-label-sm font-medium uppercase transition-opacity ${
                                          on ? '' : 'opacity-55 hover:opacity-80'
                                        }`}
                                        style={on ? tagStyle(tag.color) : { boxShadow: 'inset 0 0 0 1px var(--color-outline-variant)' }}
                                      >
                                        {on ? '✓ ' : '+ '}
                                        {tag.name}
                                      </button>
                                    )
                                  })}
                                </div>
                              )}
                              <button
                                type="submit"
                                disabled={addAssignment.isPending || !!clash}
                                className="rounded-full bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
                              >
                                Assign
                              </button>
                            </form>
                          )}

                          {formOpen && clash && (
                            <div className="mt-3 rounded-sm border border-warning/50 bg-warning/10 p-3">
                              <p className="text-body-sm text-on-surface">
                                <span className="font-medium">
                                  {clash.profile
                                    ? `${clash.profile.first_name} ${clash.profile.last_name}`
                                    : 'That volunteer'}
                                </span>{' '}
                                is already <span className="font-medium">{clash.role_label}</span> for{' '}
                                <span className="font-medium">{clash.department?.name}</span> at this service.
                                They need to be released from that role first.
                              </p>
                              {clashRequest ? (
                                <p className="mt-2 font-mono text-label-sm text-warning">
                                  Waiting on {clash.department?.name}'s head to respond…
                                </p>
                              ) : !canAskRelease(service.id, dept.id) ? (
                                <p className="mt-2 text-body-sm text-on-surface-variant">
                                  Asking for them is for whoever the church lets ask on this team’s behalf.
                                </p>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    requestRelease.mutate({
                                      assignmentId: clash.id,
                                      requestingDepartmentId: dept.id,
                                      roleLabel: (draftRole[key] ?? '').trim() || 'a role',
                                    })
                                  }
                                  disabled={requestRelease.isPending}
                                  className="mt-2 rounded-full bg-primary px-4 py-2 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
                                >
                                  {requestRelease.isPending ? 'Sending…' : 'Inform department head'}
                                </button>
                              )}
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </Tile>
              )
  }


  const isLoading = servicesQuery.isLoading || departmentsQuery.isLoading || ownDeptsQuery.isLoading
  const loadError = servicesQuery.error || departmentsQuery.error || ownDeptsQuery.error

  return (
    <div>
      <PageHeader
        eyebrow="Who is on what"
        title="Team Rota"
        description="One role per person per service — except Team Coordinator, which sits alongside a job rather than replacing it. Borrowing someone needs their head's approval."
      />
      <Lifespan page="rota" className="mb-4" />

      {error && (
        <p className="mt-4 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">{error}</p>
      )}

      {/*
        Above the rota, because it is the question asked first. The rota
        says who is on; this says what time to be there, which is what a
        volunteer wants on a Saturday night — and every team is in it, not
        just yours, so the person opening up knows who to expect at the
        door.

        Not scoped to `myDepartments`: that list is "teams you serve on or
        run", which is the right audience for the assign forms below and
        the wrong one here.
      */}
      {/* When each team is due in is the teams' own business: somebody who
          has signed up and not been put on a team yet has no call time of
          their own and no reason to read everyone else's. The database
          says the same (0080), so the panel would come back empty anyway. */}
      {onATeam && (
      <div className="mt-6">
        <CallTimesPanel
          days={callTimeDays}
          teams={departmentsQuery.data ?? []}
          myTeamIds={myTeamIds}
          canManage={canSetCallTimes}
        />
      </div>
      )}

      {incoming.length > 0 && (
        /* Surfaced at the top rather than buried in the team it concerns:
           someone is waiting on this answer to finish their own rota. */
        <Tile tone="warning" as="section" className="mb-5">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-accent-orange)_20%,transparent)] text-accent-orange-soft"
            >
              !
            </span>
            <Eyebrow>Release requests for your team</Eyebrow>
          </div>
          <ul className="mt-4 flex flex-col gap-3">
            {incoming.map((r) => (
              <li key={r.id} className="rounded-[var(--radius-row)] bg-raised px-4 py-4">
                <p className="text-body-sm text-on-surface">
                  <span className="font-medium">
                    {r.requesting_department?.name ?? 'Another team'}
                  </span>{' '}
                  would like{' '}
                  <span className="font-medium">
                    {r.assignment?.profile
                      ? `${r.assignment.profile.first_name} ${r.assignment.profile.last_name}`
                      : 'a volunteer'}
                  </span>{' '}
                  as <span className="font-medium">{r.requested_role_label}</span>. They're currently{' '}
                  <span className="font-medium">{r.assignment?.role_label}</span> for{' '}
                  {r.assignment?.department?.name}.
                </p>
                <div className="mt-3.5 flex flex-wrap gap-2.5">
                  <ActionButton
                    tone="success"
                    size="sm"
                    disabled={decideRequest.isPending}
                    onClick={() => decideRequest.mutate({ request: r, approve: true })}
                  >
                    Approve &amp; release
                  </ActionButton>
                  <ActionButton
                    tone="quiet"
                    size="sm"
                    disabled={decideRequest.isPending}
                    onClick={() => decideRequest.mutate({ request: r, approve: false })}
                  >
                    Deny
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
        </Tile>
      )}

      <QueryState isLoading={isLoading} error={loadError}>
        {upcoming.length === 0 ? (
          <p className="mt-6 text-body-sm text-on-surface-variant">No upcoming services scheduled yet.</p>
        ) : myDepartments.length === 0 ? (
          <p className="mt-6 text-body-sm text-on-surface-variant">
            You're not on a team yet — an Admin can add you to one.
          </p>
        ) : (
          <ServiceSections
            sections={sections}
            finishedId="finished-rota"
            empty="Every service in the window is over. What was rostered is under Finished services."
            render={(list) => <div className="flex flex-col gap-8">{list.map(renderService)}</div>}
          />
        )}
      </QueryState>

      {dialog}
      {clashNotice && (
        <Overlay onDismiss={() => setClashNotice(null)} label={clashNotice.title} closable={false}>
          <div
            role="alertdialog"
            aria-label={clashNotice.title}
            className="w-full max-w-sm rounded-[var(--radius-shell)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12"
          >
            <h2 className="text-headline-sm text-on-surface">{clashNotice.title}</h2>
            <p className="mt-2 text-body-sm text-on-surface-variant">{clashNotice.body}</p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setClashNotice(null)}
                autoFocus
                className="tap rounded-full bg-primary px-4 py-2 text-label-md font-medium text-on-primary"
              >
                OK
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  )
}
