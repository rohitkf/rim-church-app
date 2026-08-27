import { type FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { Link } from 'react-router-dom'
import {
  fetchDepartmentRoles,
  fetchDepartments,
  fetchMembersForDepartments,
  fetchOwnDepartmentIds,
  fetchServices,
} from '../lib/queries'
import { todayIso } from '../lib/monthGrid'
import { formatServiceDay } from '../lib/sunday'
import { DEFAULT_DEPT_COLOR } from '../lib/deptBadge'
import { errorMessage } from '../lib/errorMessage'
import {
  rotaAssignmentSchema,
  rotaReleaseRequestSchema,
  type RotaAssignment,
  type RotaReleaseRequest,
} from '../lib/types'

const UPCOMING_LIMIT = 3

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
  const { session, isAdmin, hasRole, isDepartmentHead } = useAuth()
  const myId = session?.user.id
  const queryClient = useQueryClient()
  const today = todayIso()

  const [draftRole, setDraftRole] = useState<Record<string, string>>({})
  const [draftPerson, setDraftPerson] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: fetchServices })
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  const ownDeptsQuery = useQuery({
    queryKey: ['own-departments', myId],
    queryFn: () => fetchOwnDepartmentIds(myId!),
    enabled: !!myId,
  })

  const upcoming = useMemo(() => {
    const ahead = (servicesQuery.data ?? [])
      .filter((s) => s.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date) || a.service_type.localeCompare(b.service_type))
    // Outside Admin the rota is about the service in front of you: show
    // only the nearest day (both services if two run that day).
    if (!isAdmin) {
      const nearest = ahead[0]?.date
      return nearest ? ahead.filter((s) => s.date === nearest) : []
    }
    return ahead.slice(0, UPCOMING_LIMIT)
  }, [servicesQuery.data, today, isAdmin])
  const upcomingIds = useMemo(() => upcoming.map((s) => s.id), [upcoming])

  const myDepartments = useMemo(() => {
    const all = departmentsQuery.data ?? []
    if (isAdmin) return all
    const mine = new Set(ownDeptsQuery.data ?? [])
    return all.filter(
      (d) =>
        mine.has(d.id) ||
        hasRole('department_head', { departmentId: d.id }) ||
        hasRole('assisting_head', { departmentId: d.id }),
    )
  }, [departmentsQuery.data, ownDeptsQuery.data, isAdmin, hasRole])
  const myDepartmentIds = useMemo(() => myDepartments.map((d) => d.id), [myDepartments])

  const rotaQuery = useQuery({
    queryKey: ['rota', upcomingIds],
    queryFn: () => fetchRota(upcomingIds),
    enabled: upcomingIds.length > 0,
  })
  const requestsQuery = useQuery({ queryKey: ['rota-requests'], queryFn: fetchReleaseRequests })
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
      setError(null)
      refresh()
    },
    onError: (err: unknown) => setError(errorMessage(err, 'Could not assign that role.')),
  })

  const removeAssignment = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase.from('rota_assignments').delete().eq('id', assignmentId)
      if (error) throw error
    },
    onSuccess: refresh,
    onError: (err: unknown) => setError(errorMessage(err, 'Could not remove that assignment.')),
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
      setError(errorMessage(err, 'Could not send the request.')),
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
    onError: (err: unknown) => setError(errorMessage(err, 'Could not answer the request.')),
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
      <h1 className="text-headline-xl">Team Rota</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">
        Who's doing what for the services coming up. Someone can hold one role per service, so
        taking them from another team needs that team head's approval.
      </p>

      {error && (
        <p className="mt-4 rounded-sm bg-error-container px-3 py-2 text-body-sm text-on-error-container">{error}</p>
      )}

      {incoming.length > 0 && (
        <section className="mt-6 rounded-lg border border-warning/40 bg-warning/5 p-5">
          <h2 className="text-headline-md">Release requests for your team</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {incoming.map((r) => (
              <li key={r.id} className="rounded-lg border border-border-subtle bg-surface-lowest p-4">
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
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => decideRequest.mutate({ request: r, approve: true })}
                    disabled={decideRequest.isPending}
                    className="rounded-sm bg-primary px-4 py-2 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
                  >
                    Approve &amp; release
                  </button>
                  <button
                    onClick={() => decideRequest.mutate({ request: r, approve: false })}
                    disabled={decideRequest.isPending}
                    className="rounded-sm border border-border-subtle px-4 py-2 text-body-sm font-medium text-on-surface hover:border-error"
                  >
                    Deny
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <QueryState isLoading={isLoading} error={loadError}>
        {upcoming.length === 0 ? (
          <p className="mt-6 text-body-sm text-on-surface-variant">No upcoming services scheduled yet.</p>
        ) : myDepartments.length === 0 ? (
          <p className="mt-6 text-body-sm text-on-surface-variant">
            You're not on a team yet — an Admin can add you to one.
          </p>
        ) : (
          <div className="mt-6 flex flex-col gap-6">
            {upcoming.map((service) => {
              const serviceAssignments = assignments.filter((a) => a.service_id === service.id)

              return (
                <section key={service.id} className="rounded-lg border border-border-subtle bg-surface-lowest p-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-headline-md">{service.service_type}</h2>
                    <span className="text-body-sm text-on-surface-variant">
                      {service.date === today ? 'Today' : formatServiceDay(service.date)}
                    </span>
                  </div>

                  <ul className="mt-5 flex flex-col gap-6">
                    {myDepartments.map((dept) => {
                      const key = `${service.id}:${dept.id}`
                      const deptAssignments = serviceAssignments.filter((a) => a.department_id === dept.id)
                      const manage = canManage(dept.id)
                      const roster = (membersQuery.data ?? []).filter(
                        (m) => m.department_id === dept.id && m.member_type === 'core',
                      )
                      const deptRoles = (rolesQuery.data ?? []).filter((r) => r.department_id === dept.id)

                      const chosenPerson = draftPerson[key] ?? ''
                      // A conflict is the same person already holding a role
                      // anywhere else in this service.
                      const clash = chosenPerson
                        ? serviceAssignments.find((a) => a.user_id === chosenPerson && a.department_id !== dept.id)
                        : undefined
                      const clashRequest = clash ? pendingFor(clash.id) : undefined

                      return (
                        <li key={dept.id}>
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: dept.color ?? DEFAULT_DEPT_COLOR }}
                            />
                            <span className="font-medium text-on-surface">{dept.name}</span>
                          </div>

                          {deptAssignments.length === 0 ? (
                            <p className="mt-2 text-body-sm text-on-surface-variant">No roles assigned yet.</p>
                          ) : (
                            <ul className="mt-2 flex flex-col gap-2">
                              {deptAssignments.map((a) => {
                                const pending = pendingFor(a.id)
                                return (
                                  <li
                                    key={a.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-border-subtle px-3 py-2"
                                  >
                                    <span className="text-body-sm">
                                      <span className="font-medium text-on-surface">{a.role_label}</span>
                                      <span className="text-on-surface-variant">
                                        {' '}
                                        —{' '}
                                        {a.profile
                                          ? `${a.profile.first_name} ${a.profile.last_name}`
                                          : 'Unknown'}
                                      </span>
                                      {a.user_id === myId && (
                                        <span className="ml-2 font-mono text-label-sm text-secondary">You</span>
                                      )}
                                    </span>
                                    <span className="flex items-center gap-3">
                                      {pending && (
                                        <span className="font-mono text-label-sm text-warning">
                                          Release requested
                                        </span>
                                      )}
                                      {manage && (
                                        <button
                                          onClick={() => removeAssignment.mutate(a.id)}
                                          className="text-body-sm text-error hover:underline"
                                        >
                                          Remove
                                        </button>
                                      )}
                                    </span>
                                  </li>
                                )
                              })}
                            </ul>
                          )}

                          {manage && deptRoles.length === 0 && (
                            <p className="mt-3 text-body-sm text-on-surface-variant">
                              No roles defined for this team yet — add them under{' '}
                              <Link to={`/departments/${dept.id}`} className="text-secondary">
                                Teams → {dept.name} → Roles
                              </Link>
                              .
                            </p>
                          )}

                          {manage && deptRoles.length > 0 && (
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
                              className="mt-3 flex flex-wrap items-end gap-2"
                            >
                              <label className="flex flex-1 flex-col gap-1 text-body-sm text-on-surface-variant">
                                Role
                                <select
                                  value={draftRole[key] ?? ''}
                                  onChange={(e) => setDraftRole((s) => ({ ...s, [key]: e.target.value }))}
                                  className="rounded-sm border border-border-subtle px-3 py-2 text-body-md text-on-surface"
                                >
                                  <option value="">Select…</option>
                                  {deptRoles.map((r) => (
                                    <option key={r.id} value={r.name}>
                                      {r.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="flex flex-col gap-1 text-body-sm text-on-surface-variant">
                                Person
                                <select
                                  value={chosenPerson}
                                  onChange={(e) => setDraftPerson((s) => ({ ...s, [key]: e.target.value }))}
                                  className="rounded-sm border border-border-subtle px-3 py-2 text-body-md text-on-surface"
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
                                className="rounded-sm bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
                              >
                                Assign
                              </button>
                            </form>
                          )}

                          {manage && clash && (
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
                                  className="mt-2 rounded-sm bg-primary px-4 py-2 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
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
                </section>
              )
            })}
          </div>
        )}
      </QueryState>
    </div>
  )
}
