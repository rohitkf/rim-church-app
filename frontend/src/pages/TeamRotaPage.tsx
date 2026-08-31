import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { Chevron, useExpanded } from '../components/Collapsible'
import { ActionButton, Eyebrow, LiveDot, PageHeader, Tile } from '../components/Surface'
import { Link } from 'react-router-dom'
import {
  fetchDepartmentRoles,
  fetchDepartments,
  fetchAvailabilityFor,
  fetchMembersForDepartments,
  fetchOwnDepartmentIds,
  fetchServices,
} from '../lib/queries'
import { todayIso } from '../lib/monthGrid'
import { LOOKAHEAD_DAYS, servicesAhead, servicesToShow, shiftIsoDays } from '../lib/rotaWindow'
import { formatServiceDay } from '../lib/sunday'
import { isLiveNow, serviceWindows } from '../lib/serviceWindow'
import { useFinishedServices } from '../lib/useFinishedServices'
import { useAppSettings } from '../lib/appSettings'
import { TeamMark } from '../components/TeamMark'
import { teamWash } from '../lib/teamGradient'
import { useTeamStyle } from '../lib/useTeamStyle'
import { useErrorText } from '../lib/useErrorText'
import {
  rotaAssignmentSchema,
  rotaReleaseRequestSchema,
  type RotaAssignment,
  type RotaReleaseRequest,
} from '../lib/types'

async function fetchRota(serviceIds: string[]): Promise<RotaAssignment[]> {
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
  const { teamStyle } = useTeamStyle()
  const errorText = useErrorText()
  const myId = session?.user.id
  const queryClient = useQueryClient()
  const today = todayIso()
  const settings = useAppSettings()

  const [draftRole, setDraftRole] = useState<Record<string, string>>({})
  const [draftPerson, setDraftPerson] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
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

  const myDepartments = useMemo(() => {
    const all = departmentsQuery.data ?? []
    if (isAdmin) return all
    const mine = new Set(ownDeptsQuery.data ?? [])
    return all.filter(
      (d) =>
        mine.has(d.id) || isDepartmentHead(d.id),
    )
  }, [departmentsQuery.data, ownDeptsQuery.data, isAdmin, isDepartmentHead])
  const myDepartmentIds = useMemo(() => myDepartments.map((d) => d.id), [myDepartments])

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
  const rolesQuery = useQuery({
    queryKey: ['department-roles', myDepartmentIds],
    queryFn: () => fetchDepartmentRoles(myDepartmentIds),
    enabled: myDepartmentIds.length > 0,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['rota', upcomingIds] })
    queryClient.invalidateQueries({ queryKey: ['rota-requests'] })
  }

  // Assisting Heads deputise for the Head, so they manage the rota too.
  const canManage = (departmentId: string) => isAdmin || isDepartmentHead(departmentId)

  const addAssignment = useMutation({
    mutationFn: async ({
      serviceId,
      departmentId,
      userId,
      roleLabel,
      roleId,
    }: {
      serviceId: string
      departmentId: string
      userId: string
      roleLabel: string
      roleId: string | null
    }) => {
      const { error } = await supabase.from('rota_assignments').insert({
        service_id: serviceId,
        department_id: departmentId,
        user_id: userId,
        role_label: roleLabel,
        role_id: roleId,
      })
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      setDraftRole((s) => ({ ...s, [`${vars.serviceId}:${vars.departmentId}`]: '' }))
      setDraftPerson((s) => ({ ...s, [`${vars.serviceId}:${vars.departmentId}`]: '' }))
      // The role is filled, so the form has done its job — fold it away
      // rather than leaving an empty pair of dropdowns behind.
      setOpenForm((s) => ({ ...s, [`${vars.serviceId}:${vars.departmentId}`]: false }))
      setError(null)
      refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not assign that role.')),
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
      const { error } = await supabase
        .from('rota_release_requests')
        .update({
          status: approve ? 'approved' : 'denied',
          decided_by: myId,
          decided_at: new Date().toISOString(),
        })
        .eq('id', request.id)
      if (error) throw error

      // Approving frees the person up: the holding assignment goes, which
      // is what lets the asking team book them.
      if (approve) {
        const { error: delError } = await supabase
          .from('rota_assignments')
          .delete()
          .eq('id', request.assignment_id)
        if (delError) throw delError
      }
    },
    onSuccess: refresh,
    onError: (err: unknown) => setError(errorText(err, 'Could not answer the request.')),
  })

  const assignments = rotaQuery.data ?? []
  const requests = requestsQuery.data ?? []

  // Requests waiting on me: I head the team that currently holds the person.
  const incoming = requests.filter(
    (r) => r.status === 'pending' && r.assignment && canManage(r.assignment.department_id),
  )

  const pendingFor = (assignmentId: string) =>
    requests.find((r) => r.assignment_id === assignmentId && r.status === 'pending')

  const isLoading = servicesQuery.isLoading || departmentsQuery.isLoading || ownDeptsQuery.isLoading
  const loadError = servicesQuery.error || departmentsQuery.error || ownDeptsQuery.error

  return (
    <div>
      <PageHeader
        eyebrow="Who is on what"
        title="Team Rota"
        description="One role per person per service — except Coordinator, which sits alongside a job rather than replacing it. Borrowing someone needs their head's approval."
      />

      {error && (
        <p className="mt-4 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">{error}</p>
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
          <div className="mt-6 flex flex-col gap-8">
            {listed.map((service) => {
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
                <div className="flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    {live && (
                      <span className="flex items-center gap-2 self-center">
                        <LiveDot />
                        <span className="font-mono text-label-sm uppercase tracking-[0.14em] text-accent-green-soft">
                          On now
                        </span>
                      </span>
                    )}
                    <h2 className="text-headline-md">{service.service_type}</h2>
                    <span className="font-mono text-label-sm text-on-surface-variant">
                      {service.date === today ? 'Today' : formatServiceDay(service.date)}
                    </span>
                    {finished && (
                      <span className="self-center rounded-full bg-[color-mix(in_oklab,var(--color-accent-green)_16%,transparent)] px-2.5 py-1 font-mono text-label-sm uppercase tracking-wide text-accent-green">
                        Finished · closed
                      </span>
                    )}
                  </div>
                  <span className="flex items-baseline gap-2 font-mono text-label-sm text-on-surface-variant">
                    {serviceAssignments.length} assigned · {teamsWithPeople}/{myDepartments.length} teams
                    {finished && <Chevron open={open} />}
                  </span>
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
                      const manage = canManage(dept.id) && !finished
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
                      const roster = (membersQuery.data ?? []).filter(
                        (m) =>
                          m.department_id === dept.id &&
                          m.member_type === 'core' &&
                          availableHere.has(m.user_id),
                      )
                      const deptRoles = (rolesQuery.data ?? []).filter((r) => r.department_id === dept.id)
                      const formOpen = !!openForm[key]

                      const chosenPerson = draftPerson[key] ?? ''
                      // A conflict is the same person already holding a role
                      // anywhere else in this service.
                      const clash = chosenPerson
                        ? serviceAssignments.find((a) => a.user_id === chosenPerson && a.department_id !== dept.id)
                        : undefined
                      const clashRequest = clash ? pendingFor(clash.id) : undefined

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
                          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <TeamMark color={dept.color} />
                              <span className="break-words text-headline-sm">{dept.name}</span>
                              <span className="shrink-0 font-mono text-label-sm uppercase text-on-surface-faint">
                                {deptAssignments.length === 0
                                  ? 'nobody yet'
                                  : `${deptAssignments.length} assigned`}
                              </span>
                            </div>

                            {manage && (
                              <button
                                type="button"
                                onClick={() => setOpenForm((s) => ({ ...s, [key]: !formOpen }))}
                                aria-expanded={formOpen}
                                className="tap shrink-0 rounded-full bg-raised-strong px-3.5 py-1.5 text-label-md text-on-surface transition-transform duration-500 ease-[var(--ease-glide)] active:scale-[0.98]"
                              >
                                {formOpen ? 'Cancel' : 'Assign role'}
                              </button>
                            )}
                          </div>

                          {deptAssignments.length > 0 && (
                            /* A role and the person holding it belong on one
                               line: the pairing is the whole content, and a
                               table made you join two columns yourself. */
                            <ul className="mt-3.5 flex flex-col gap-2">
                              {deptAssignments.map((a) => {
                                const pending = pendingFor(a.id)
                                const mine = a.user_id === myId
                                return (
                                  <li
                                    key={a.id}
                                    className={`group/assignment flex items-center gap-3 rounded-[var(--radius-chip)] px-3.5 py-2.5 text-body-sm ${
                                      pending
                                        ? 'bg-[color-mix(in_oklab,var(--color-accent-orange)_12%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent-orange)_24%,transparent)]'
                                        : mine
                                          ? 'bg-[color-mix(in_oklab,var(--color-accent-blue)_14%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent-blue)_28%,transparent)]'
                                          : 'bg-inset'
                                    }`}
                                  >
                                    <span className="shrink-0 text-on-surface-variant">{a.role_label}</span>
                                    <span className="ml-auto flex min-w-0 items-center gap-2">
                                      {pending ? (
                                        <span className="shrink-0 font-mono text-label-sm uppercase text-accent-orange-soft">
                                          Release requested
                                        </span>
                                      ) : (
                                        <span className="break-words text-on-surface">
                                          {mine
                                            ? 'You'
                                            : a.profile
                                              ? `${a.profile.first_name} ${a.profile.last_name}`
                                              : 'Unknown'}
                                        </span>
                                      )}
                                      {manage && (
                                        <button
                                          onClick={() => removeAssignment.mutate(a.id)}
                                          aria-label={`Remove ${a.role_label}`}
                                          className="shrink-0 font-mono text-label-sm text-on-surface-faint opacity-0 transition-opacity duration-300 hover:text-error focus:opacity-100 group-hover/assignment:opacity-100"
                                        >
                                          ✕
                                        </button>
                                      )}
                                    </span>
                                  </li>
                                )
                              })}
                            </ul>
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
                                addAssignment.mutate({
                                  serviceId: service.id,
                                  departmentId: dept.id,
                                  userId: chosenPerson,
                                  roleLabel: role,
                                  roleId: deptRoles.find((r) => r.name === role)?.id ?? null,
                                })
                              }}
                              className="mt-3 flex flex-wrap items-end gap-2 rounded-[var(--radius-chip)] bg-surface-low p-3"
                            >
                              <label className="flex min-w-40 flex-1 flex-col gap-1 text-label-sm text-on-surface-variant">
                                Role
                                <select
                                  value={draftRole[key] ?? ''}
                                  onChange={(e) => setDraftRole((s) => ({ ...s, [key]: e.target.value }))}
                                  className="rounded-full hairline bg-surface-lowest px-3 py-2 text-body-md text-on-surface"
                                >
                                  <option value="">Select…</option>
                                  {deptRoles.map((r) => (
                                    <option key={r.id} value={r.name}>
                                      {r.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="flex min-w-40 flex-1 flex-col gap-1 text-label-sm text-on-surface-variant">
                                Person · available only
                                <select
                                  value={chosenPerson}
                                  onChange={(e) => setDraftPerson((s) => ({ ...s, [key]: e.target.value }))}
                                  className="rounded-full hairline bg-surface-lowest px-3 py-2 text-body-md text-on-surface"
                                >
                                  <option value="">Select…</option>
                                  {roster.map((m) => (
                                    <option key={m.user_id} value={m.user_id}>
                                      {m.profiles
                                        ? `${m.profiles.first_name} ${m.profiles.last_name}`
                                        : m.user_id}
                                    </option>
                                  ))}
                                </select>
                              </label>
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
            })}
          </div>
        )}
      </QueryState>
    </div>
  )
}
