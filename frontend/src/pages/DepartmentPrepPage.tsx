import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { QueryState } from '../components/QueryState'
import { DepartmentChecklistPanel } from '../components/DepartmentChecklistPanel'
import { departmentSchema, serviceSchema, type Department, type Service } from '../lib/types'

async function fetchDepartment(id: string): Promise<Department | null> {
  const { data, error } = await supabase.from('departments').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? departmentSchema.parse(data) : null
}

async function fetchService(id: string): Promise<Service | null> {
  const { data, error } = await supabase.from('services').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? serviceSchema.parse(data) : null
}

/**
 * Deep-linked view of a single department's checklist — reached from the
 * dashboard's department links. The Checklists page renders the same
 * panel inline instead of sending people here.
 */
export function DepartmentPrepPage() {
  const { departmentId, serviceId } = useParams<{ departmentId: string; serviceId: string }>()

  const deptQuery = useQuery({
    queryKey: ['department', departmentId],
    queryFn: () => fetchDepartment(departmentId!),
    enabled: !!departmentId,
  })
  const serviceQuery = useQuery({
    queryKey: ['service', serviceId],
    queryFn: () => fetchService(serviceId!),
    enabled: !!serviceId,
  })

  return (
    <QueryState
      isLoading={deptQuery.isLoading || serviceQuery.isLoading}
      error={deptQuery.error || serviceQuery.error}
      isEmpty={deptQuery.data === null || serviceQuery.data === null}
      emptyMessage="Department or service not found, or you don't have access."
    >
      <div>
        <Link to="/checklists" className="text-body-sm text-secondary">
          ← Back to Checklists
        </Link>
        <h1 className="mt-2 text-headline-xl">{deptQuery.data?.name} Department Prep</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          {serviceQuery.data?.service_type} Service — {serviceQuery.data?.date}
        </p>

        {departmentId && serviceId && (
          <div className="mt-6">
            <DepartmentChecklistPanel
              departmentId={departmentId}
              serviceId={serviceId}
              serviceDate={serviceQuery.data?.date}
            />
          </div>
        )}
      </div>
    </QueryState>
  )
}
