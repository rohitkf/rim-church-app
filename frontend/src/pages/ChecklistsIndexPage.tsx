import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { fetchDepartments, fetchServices } from '../lib/queries'
import { agendaDate, todayIso } from '../lib/monthGrid'
import { DEFAULT_DEPT_COLOR } from '../lib/deptBadge'

export function ChecklistsIndexPage() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()

  const [serviceId, setServiceId] = useState('')

  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: fetchServices })

  const today = todayIso()
  // Same rule as the Service Planner: members work upcoming services;
  // past ones remain visible history for Admins only.
  const visibleServices = useMemo(
    () =>
      (servicesQuery.data ?? [])
        .filter((s) => isAdmin || s.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [servicesQuery.data, isAdmin, today],
  )

  return (
    <div>
      <h1 className="text-headline-xl">Checklists</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">
        Tap a service, then a department, to open its pre-service checklist.
      </p>

      <QueryState
        isLoading={departmentsQuery.isLoading || servicesQuery.isLoading}
        error={departmentsQuery.error || servicesQuery.error}
        isEmpty={visibleServices.length === 0}
        emptyMessage={
          isAdmin
            ? 'No services yet — create one from the Service Planner.'
            : 'No upcoming services scheduled yet — check back soon.'
        }
      >
        <section className="mt-6">
          <div className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">1 · Service</div>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleServices.map((s) => {
              const d = agendaDate(s.date)
              const selected = s.id === serviceId
              const past = s.date < today
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setServiceId(selected ? '' : s.id)}
                    className={`flex w-full items-center gap-4 rounded-lg border p-4 text-left ${
                      selected
                        ? 'border-2 border-secondary bg-secondary/5'
                        : 'border-border-subtle bg-surface-lowest hover:border-secondary'
                    } ${past && !selected ? 'opacity-60' : ''}`}
                  >
                    <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-md bg-secondary/10 text-secondary">
                      <span className="font-mono text-label-sm uppercase leading-none">{d.month}</span>
                      <span className="text-headline-md leading-tight">{d.day}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-on-surface">{s.service_type}</span>
                      <span className="block text-body-sm text-on-surface-variant">
                        {d.weekday} · {s.date}
                        {past ? ' · past' : ''}
                      </span>
                    </span>
                    {selected && <span className="shrink-0 font-mono text-secondary">✓</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        {serviceId && (
          <section className="mt-8">
            <div className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
              2 · Department
            </div>
            {departmentsQuery.data?.length === 0 ? (
              <p className="mt-3 text-body-sm text-on-surface-variant">No departments yet.</p>
            ) : (
              <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {departmentsQuery.data?.map((dept) => (
                  <li key={dept.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/checklists/${dept.id}/${serviceId}`)}
                      className="flex w-full items-center gap-3 rounded-lg border border-border-subtle bg-surface-lowest p-4 text-left hover:border-secondary"
                    >
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: dept.color ?? DEFAULT_DEPT_COLOR }}
                      />
                      <span className="min-w-0 flex-1 truncate font-medium text-on-surface">{dept.name}</span>
                      <span className="shrink-0 text-on-surface-variant">›</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </QueryState>

    </div>
  )
}
