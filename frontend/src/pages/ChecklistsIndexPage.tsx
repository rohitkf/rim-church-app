import { type FormEvent, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { fetchDepartments, fetchServices } from '../lib/queries'
import { agendaDate, todayIso } from '../lib/monthGrid'
import { DEFAULT_DEPT_COLOR } from '../lib/deptBadge'

export function ChecklistsIndexPage() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [serviceId, setServiceId] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newType, setNewType] = useState('')
  const [serviceError, setServiceError] = useState<string | null>(null)

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

  const createService = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('services').insert({ date: newDate, service_type: newType })
      if (error) throw error
    },
    onSuccess: () => {
      setNewDate('')
      setNewType('')
      setServiceError(null)
      queryClient.invalidateQueries({ queryKey: ['services'] })
    },
    onError: (err: unknown) => setServiceError(err instanceof Error ? err.message : 'Could not create service.'),
  })

  function handleCreateService(e: FormEvent) {
    e.preventDefault()
    if (!newDate || !newType.trim()) return
    createService.mutate()
  }

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
          isAdmin ? 'No services yet — create one below.' : 'No upcoming services scheduled yet — check back soon.'
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

      {isAdmin && (
        <div className="mt-10 max-w-xl rounded-lg border border-border-subtle bg-surface-lowest p-6">
          <h2 className="text-headline-md">New Service</h2>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Registers the date/type so a checklist and attendance record can attach to it, and it
            appears on the Service Planner calendar.
          </p>
          <form onSubmit={handleCreateService} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-body-sm text-on-surface-variant">
              Date
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="rounded-sm border border-border-subtle px-3 py-2 text-body-md text-on-surface"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-body-sm text-on-surface-variant">
              Service type
              <input
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                placeholder="English, Malayalam…"
                className="rounded-sm border border-border-subtle px-3 py-2 text-body-md text-on-surface"
              />
            </label>
            <button
              type="submit"
              disabled={createService.isPending}
              className="rounded-sm bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
            >
              {createService.isPending ? 'Creating…' : 'Create'}
            </button>
          </form>
          {serviceError && (
            <p className="mt-2 rounded-sm bg-error-container px-3 py-2 text-body-sm text-on-error-container">
              {serviceError}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
