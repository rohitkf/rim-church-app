import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { fetchDepartments, fetchOwnDepartmentIds, fetchServices } from '../lib/queries'
import { todayIso } from '../lib/monthGrid'
import { formatServiceDay } from '../lib/sunday'
import { DEFAULT_DEPT_COLOR } from '../lib/deptBadge'
import {
  availabilityRowSchema,
  departmentMemberRowSchema,
  type AvailabilityRow,
  type AvailabilityStatus,
  type DepartmentMemberRow,
} from '../lib/types'

/** How many upcoming services to ask about — enough to plan ahead without
 * making people answer for months of Sundays. */
const UPCOMING_LIMIT = 4

const STATUS_OPTIONS: { value: AvailabilityStatus; label: string; activeClass: string }[] = [
  { value: 'available', label: 'Available', activeClass: 'border-success bg-success/10 text-success' },
  { value: 'tentative', label: 'Tentative', activeClass: 'border-warning bg-warning/10 text-warning' },
  { value: 'unavailable', label: "Can't make it", activeClass: 'border-error bg-error/10 text-error' },
]

const statusLabel: Record<AvailabilityStatus, string> = {
  available: 'Available',
  tentative: 'Tentative',
  unavailable: "Can't make it",
}

const statusTextClass: Record<AvailabilityStatus, string> = {
  available: 'text-success',
  tentative: 'text-warning',
  unavailable: 'text-error',
}

async function fetchAvailability(serviceIds: string[]): Promise<AvailabilityRow[]> {
  if (serviceIds.length === 0) return []
  const { data, error } = await supabase.from('availability').select('*').in('service_id', serviceIds)
  if (error) throw error
  return z.array(availabilityRowSchema).parse(data)
}

async function fetchMembers(departmentIds: string[]): Promise<DepartmentMemberRow[]> {
  if (departmentIds.length === 0) return []
  const { data, error } = await supabase
    .from('department_members')
    .select('*, profiles(id, first_name, last_name, email, phone, avatar_url)')
    .in('department_id', departmentIds)
  if (error) throw error
  return z.array(departmentMemberRowSchema).parse(data)
}

export function AvailabilityPage() {
  const { session, isAdmin, hasRole } = useAuth()
  const myId = session?.user.id
  const queryClient = useQueryClient()
  const today = todayIso()

  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: fetchServices })
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  const ownDeptsQuery = useQuery({
    queryKey: ['own-departments', myId],
    queryFn: () => fetchOwnDepartmentIds(myId!),
    enabled: !!myId,
  })

  const upcoming = useMemo(
    () =>
      (servicesQuery.data ?? [])
        .filter((s) => s.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date) || a.service_type.localeCompare(b.service_type))
        .slice(0, UPCOMING_LIMIT),
    [servicesQuery.data, today],
  )
  const upcomingIds = useMemo(() => upcoming.map((s) => s.id), [upcoming])

  // Teams to answer for: the ones you belong to, plus any you lead.
  const myDepartments = useMemo(() => {
    const all = departmentsQuery.data ?? []
    const mine = new Set(ownDeptsQuery.data ?? [])
    return all.filter(
      (d) => mine.has(d.id) || hasRole('department_head', { departmentId: d.id }) || hasRole('assisting_head', { departmentId: d.id }),
    )
  }, [departmentsQuery.data, ownDeptsQuery.data, hasRole])

  const availabilityQuery = useQuery({
    queryKey: ['availability', upcomingIds],
    queryFn: () => fetchAvailability(upcomingIds),
    enabled: upcomingIds.length > 0,
  })

  // Heads and Admins also see who on their team has answered.
  const ledDepartmentIds = useMemo(
    () =>
      myDepartments
        .filter(
          (d) =>
            isAdmin || hasRole('department_head', { departmentId: d.id }) || hasRole('assisting_head', { departmentId: d.id }),
        )
        .map((d) => d.id),
    [myDepartments, isAdmin, hasRole],
  )
  const membersQuery = useQuery({
    queryKey: ['availability-members', ledDepartmentIds],
    queryFn: () => fetchMembers(ledDepartmentIds),
    enabled: ledDepartmentIds.length > 0,
  })

  const setAvailability = useMutation({
    mutationFn: async ({
      serviceId,
      departmentId,
      status,
    }: {
      serviceId: string
      departmentId: string
      status: AvailabilityStatus
    }) => {
      const { error } = await supabase.from('availability').upsert(
        { user_id: myId, service_id: serviceId, department_id: departmentId, status },
        { onConflict: 'user_id,service_id,department_id' },
      )
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['availability', upcomingIds] }),
  })

  const myAnswer = (serviceId: string, departmentId: string) =>
    (availabilityQuery.data ?? []).find(
      (a) => a.user_id === myId && a.service_id === serviceId && a.department_id === departmentId,
    )?.status ?? null

  const isLoading = servicesQuery.isLoading || departmentsQuery.isLoading || ownDeptsQuery.isLoading
  const error = servicesQuery.error || departmentsQuery.error || ownDeptsQuery.error

  return (
    <div>
      <h1 className="text-headline-xl">Availability Tracker</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">
        Let your team know whether you can serve at the services coming up.
      </p>

      <QueryState isLoading={isLoading} error={error}>
        {upcoming.length === 0 ? (
          <p className="mt-6 text-body-sm text-on-surface-variant">
            No upcoming services scheduled yet — check back soon.
          </p>
        ) : myDepartments.length === 0 ? (
          <p className="mt-6 text-body-sm text-on-surface-variant">
            You're not on a team yet — an Admin can add you to one.
          </p>
        ) : (
          <div className="mt-6 flex flex-col gap-6">
            {upcoming.map((service) => (
              <section key={service.id} className="rounded-lg border border-border-subtle bg-surface-lowest p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-headline-md">{service.service_type}</h2>
                  <span className="text-body-sm text-on-surface-variant">
                    {service.date === today ? 'Today' : formatServiceDay(service.date)}
                  </span>
                </div>

                <ul className="mt-5 flex flex-col gap-6">
                  {myDepartments.map((dept) => {
                    const mine = myAnswer(service.id, dept.id)
                    const leads = ledDepartmentIds.includes(dept.id)
                    const teamMembers = (membersQuery.data ?? []).filter((m) => m.department_id === dept.id)
                    const answers = (availabilityQuery.data ?? []).filter(
                      (a) => a.service_id === service.id && a.department_id === dept.id,
                    )

                    return (
                      <li key={dept.id}>
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: dept.color ?? DEFAULT_DEPT_COLOR }}
                          />
                          <span className="font-medium text-on-surface">{dept.name}</span>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2">
                          {STATUS_OPTIONS.map((opt) => {
                            const active = mine === opt.value
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() =>
                                  setAvailability.mutate({
                                    serviceId: service.id,
                                    departmentId: dept.id,
                                    status: opt.value,
                                  })
                                }
                                disabled={setAvailability.isPending}
                                className={`rounded-full border px-3 py-1.5 text-body-sm disabled:opacity-60 ${
                                  active
                                    ? `font-medium ${opt.activeClass}`
                                    : 'border-border-subtle bg-surface-lowest text-on-surface hover:border-secondary'
                                }`}
                              >
                                {opt.label}
                              </button>
                            )
                          })}
                        </div>
                        {!mine && (
                          <p className="mt-1.5 text-label-sm text-on-surface-variant">No answer yet</p>
                        )}

                        {leads && teamMembers.length > 0 && (
                          <details className="mt-3">
                            <summary className="cursor-pointer text-body-sm text-secondary">
                              Team responses ({answers.length}/{teamMembers.length})
                            </summary>
                            <ul className="mt-2 flex flex-col gap-1.5 border-l border-border-subtle pl-3">
                              {teamMembers.map((m) => {
                                const answer = answers.find((a) => a.user_id === m.user_id)
                                return (
                                  <li key={m.id} className="flex items-center justify-between text-body-sm">
                                    <span className="text-on-surface">
                                      {m.profiles ? `${m.profiles.first_name} ${m.profiles.last_name}` : 'Unknown'}
                                    </span>
                                    <span
                                      className={`font-mono text-label-sm ${
                                        answer ? statusTextClass[answer.status] : 'text-on-surface-variant'
                                      }`}
                                    >
                                      {answer ? statusLabel[answer.status] : 'No answer'}
                                    </span>
                                  </li>
                                )
                              })}
                            </ul>
                          </details>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </QueryState>
    </div>
  )
}
