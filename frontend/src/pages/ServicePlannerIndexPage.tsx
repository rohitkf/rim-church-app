import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { QueryState } from '../components/QueryState'
import type { Service } from '../lib/types'

async function fetchServices(): Promise<Service[]> {
  const { data, error } = await supabase.from('services').select('*').order('date', { ascending: false })
  if (error) throw error
  return data
}

export function ServicePlannerIndexPage() {
  const navigate = useNavigate()
  const [serviceId, setServiceId] = useState('')
  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: fetchServices })

  function handleGo(e: FormEvent) {
    e.preventDefault()
    if (!serviceId) return
    navigate(`/service-planner/${serviceId}`)
  }

  return (
    <div>
      <h1 className="text-headline-xl">Service Planner</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">
        Pick a service to view or edit its running order. Only the first session's start time is
        directly editable — everything after it is computed from the previous session's start plus
        its duration.
      </p>

      <QueryState isLoading={servicesQuery.isLoading} error={servicesQuery.error} isEmpty={servicesQuery.data?.length === 0} emptyMessage="No services yet — create one from the Checklists page.">
        <form onSubmit={handleGo} className="mt-6 flex max-w-md items-end gap-3">
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
            disabled={!serviceId}
            className="rounded-sm bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
          >
            Open Planner
          </button>
        </form>
      </QueryState>
    </div>
  )
}
