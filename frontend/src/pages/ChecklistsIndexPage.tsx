import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { DepartmentChecklistPanel } from '../components/DepartmentChecklistPanel'
import { fetchDepartments, fetchOwnDepartmentIds, fetchServices } from '../lib/queries'
import { todayIso } from '../lib/monthGrid'
import { formatServiceDay } from '../lib/sunday'
import { nearestServiceDate } from '../lib/nearestService'
import { DEFAULT_DEPT_COLOR } from '../lib/deptBadge'

export function ChecklistsIndexPage() {
  const { session, isAdmin } = useAuth()

  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: fetchServices })
  const ownDeptsQuery = useQuery({
    queryKey: ['own-departments', session?.user.id],
    queryFn: () => fetchOwnDepartmentIds(session!.user.id),
    enabled: !!session,
  })

  const today = todayIso()

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

  // Admins can work any department's list; everyone else sees the teams
  // they actually belong to, so most people get theirs with no choosing.
  const myDepartments = useMemo(() => {
    const all = departmentsQuery.data ?? []
    if (isAdmin) return all
    const mine = new Set(ownDeptsQuery.data ?? [])
    return all.filter((d) => mine.has(d.id))
  }, [departmentsQuery.data, ownDeptsQuery.data, isAdmin])

  const [pickedDeptId, setPickedDeptId] = useState<string | null>(null)
  const activeDeptId = pickedDeptId ?? myDepartments[0]?.id ?? null

  const isLoading = departmentsQuery.isLoading || servicesQuery.isLoading || ownDeptsQuery.isLoading
  const error = departmentsQuery.error || servicesQuery.error || ownDeptsQuery.error

  return (
    <div>
      <h1 className="text-headline-xl">Checklists</h1>

      <QueryState isLoading={isLoading} error={error}>
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

            {myDepartments.length === 0 ? (
              <p className="mt-6 text-body-sm text-on-surface-variant">
                You're not on a team yet — an Admin can add you to one.
              </p>
            ) : (
              <>
                {myDepartments.length > 1 && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {myDepartments.map((d) => {
                      const active = d.id === activeDeptId
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setPickedDeptId(d.id)}
                          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-body-sm ${
                            active
                              ? 'border-secondary bg-secondary/10 font-medium text-secondary'
                              : 'border-border-subtle bg-surface-lowest text-on-surface hover:border-secondary'
                          }`}
                        >
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: d.color ?? DEFAULT_DEPT_COLOR }}
                          />
                          {d.name}
                        </button>
                      )
                    })}
                  </div>
                )}

                <div className="mt-6 flex flex-col gap-10">
                  {dayServices.map((service) => (
                    <section key={service.id}>
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h2 className="text-headline-lg">{service.service_type}</h2>
                        <span className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
                          {service.date}
                        </span>
                      </div>
                      {activeDeptId && (
                        <DepartmentChecklistPanel
                          departmentId={activeDeptId}
                          serviceId={service.id}
                          serviceDate={service.date}
                        />
                      )}
                    </section>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </QueryState>
    </div>
  )
}
