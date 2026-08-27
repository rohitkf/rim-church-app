import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { QueryState } from '../components/QueryState'
import { fetchDepartments } from '../lib/queries'
import { DEFAULT_DEPT_COLOR } from '../lib/deptBadge'

export function InventoryIndexPage() {
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })

  return (
    <div>
      <h1 className="text-headline-xl">Inventory</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">
        Pick a team to view or manage its inventory.
      </p>

      <div className="mt-6">
        <QueryState
          isLoading={departmentsQuery.isLoading}
          error={departmentsQuery.error}
          isEmpty={departmentsQuery.data?.length === 0}
          emptyMessage="No teams visible to you yet."
        >
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {departmentsQuery.data?.map((dept) => (
              <li key={dept.id}>
                <Link
                  to={`/inventory/${dept.id}`}
                  className="group block rounded-lg border border-border-subtle bg-surface-lowest p-5 hover:border-secondary"
                >
                  {/* Same shape as the cards on Teams: the team's own colour
                      first, so the two pages read as the same list. */}
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: dept.color ?? DEFAULT_DEPT_COLOR }}
                    />
                    <span className="text-headline-md leading-tight group-hover:text-secondary">
                      {dept.name}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </QueryState>
      </div>
    </div>
  )
}
