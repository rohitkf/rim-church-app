import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { QueryState } from '../components/QueryState'
import { DepartmentChecklistPanel } from '../components/DepartmentChecklistPanel'
import { PageHeader } from '../components/Surface'
import { formatServiceDay } from '../lib/sunday'
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
      missing={{ title: 'Checklist not found', back: { to: '/checklists', label: 'Checklists' } }}
    >
      <div>
        {/* The page's own header, like every other page: the way back above,
            the team's checklist as the title, and which service under it —
            the service's name and its day as people say it, not its ISO date. */}
        <PageHeader
          back={
            <Link to="/checklists" className="tap inline-flex items-center text-accent-blue-soft">
              <span aria-hidden="true">← </span>Checklists
            </Link>
          }
          title={`${deptQuery.data?.name ?? 'Team'} checklist`}
          context={
            serviceQuery.data
              ? `${serviceQuery.data.service_type} · ${formatServiceDay(serviceQuery.data.date)}`
              : undefined
          }
        />

        {departmentId && serviceId && (
          <div>
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
