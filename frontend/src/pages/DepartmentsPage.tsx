import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { ManageTeamsCard } from '../components/ManageTeamsCard'
import { fetchDepartments, fetchOwnDepartmentIds } from '../lib/queries'
import { DEFAULT_DEPT_COLOR } from '../lib/deptBadge'

export function DepartmentsPage() {
  const { isAdmin, ledDepartmentIds, session } = useAuth()

  const { data: allDepartments, isLoading, error } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
  })
  const ownDeptsQuery = useQuery({
    queryKey: ['own-departments', session?.user.id],
    queryFn: () => fetchOwnDepartmentIds(session!.user.id),
    enabled: !!session && !isAdmin,
  })

  // Everyone can read the department list (the rota needs other teams'
  // names), so this page narrows it to the teams you actually belong to
  // or lead. Admins keep the whole list.
  const data = useMemo(() => {
    if (isAdmin) return allDepartments
    const mine = new Set([...(ownDeptsQuery.data ?? []), ...ledDepartmentIds])
    return (allDepartments ?? []).filter((d) => mine.has(d.id))
  }, [allDepartments, ownDeptsQuery.data, ledDepartmentIds, isAdmin])

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-headline-xl">Teams</h1>
      </div>
      <p className="mt-2 text-body-md text-on-surface-variant">
        Only the teams you're a core member, guest, or head of — plus every team if you're an
        Admin — show up here.
      </p>

      {isAdmin && <ManageTeamsCard departments={allDepartments ?? []} />}

      <div className="mt-8">
        <QueryState isLoading={isLoading} error={error} isEmpty={data?.length === 0} emptyMessage="No teams yet.">
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data?.map((dept) => (
              <li key={dept.id} className="rounded-lg border border-border-subtle bg-surface-lowest p-5">
                <Link to={`/departments/${dept.id}`} className="block hover:text-secondary">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: dept.color ?? DEFAULT_DEPT_COLOR }}
                    />
                    <span className="text-headline-md">{dept.name}</span>
                  </div>
                  <div className="mt-1 text-body-sm text-on-surface-variant">
                    {dept.handbook_url ? 'Handbook on file' : 'No handbook uploaded'}
                  </div>
                </Link>
                {dept.is_service_flow && (
                  <p className="mt-2 text-label-sm text-on-surface-variant">
                    Gives the final checklist sign-off
                  </p>
                )}
              </li>
            ))}
          </ul>
        </QueryState>
      </div>
    </div>
  )
}
