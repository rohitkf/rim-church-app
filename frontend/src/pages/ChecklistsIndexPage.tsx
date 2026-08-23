import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import type { Department, Service } from '../lib/types'

async function fetchDepartments(): Promise<Department[]> {
  const { data, error } = await supabase.from('departments').select('*').order('name')
  if (error) throw error
  return data
}

async function fetchServices(): Promise<Service[]> {
  const { data, error } = await supabase.from('services').select('*').order('date', { ascending: false })
  if (error) throw error
  return data
}

export function ChecklistsIndexPage() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [departmentId, setDepartmentId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newType, setNewType] = useState('')
  const [serviceError, setServiceError] = useState<string | null>(null)

  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: fetchServices })

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

  function handleGo(e: FormEvent) {
    e.preventDefault()
    if (!departmentId || !serviceId) return
    navigate(`/checklists/${departmentId}/${serviceId}`)
  }

  return (
    <div>
      <h1 className="text-headline-xl">Checklists</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">
        Pick a department and a service to view or work its pre-service checklist.
      </p>

      <form onSubmit={handleGo} className="mt-6 flex max-w-xl flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1 text-body-sm text-on-surface-variant">
          Department
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="rounded-sm border border-border-subtle px-3 py-2 text-body-md text-on-surface"
          >
            <option value="">Select…</option>
            {departmentsQuery.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-body-sm text-on-surface-variant">
          Service
          <select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="rounded-sm border border-border-subtle px-3 py-2 text-body-md text-on-surface"
          >
            <option value="">Select…</option>
            {servicesQuery.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.service_type} — {s.date}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={!departmentId || !serviceId}
          className="rounded-sm bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
        >
          View Checklist
        </button>
      </form>

      <QueryState isLoading={departmentsQuery.isLoading || servicesQuery.isLoading} error={departmentsQuery.error || servicesQuery.error}>
        <></>
      </QueryState>

      {isAdmin && (
        <div className="mt-10 max-w-xl rounded-lg border border-border-subtle bg-surface-lowest p-6">
          <h2 className="text-headline-md">New Service</h2>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Full running-order planning lands in Phase 6 — this just registers the date/type so a
            checklist and attendance record can attach to it.
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
