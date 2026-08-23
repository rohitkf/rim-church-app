import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { QueryState } from '../components/QueryState'
import { fetchDepartments } from '../lib/queries'

export function InventoryIndexPage() {
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })

  return (
    <div>
      <h1 className="text-headline-xl">Inventory</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">
        Pick a department to view or manage its inventory.
      </p>

      <div className="mt-6">
        <QueryState
          isLoading={departmentsQuery.isLoading}
          error={departmentsQuery.error}
          isEmpty={departmentsQuery.data?.length === 0}
          emptyMessage="No departments visible to you yet."
        >
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {departmentsQuery.data?.map((dept) => (
              <li key={dept.id}>
                <Link
                  to={`/inventory/${dept.id}`}
                  className="block rounded-lg border border-border-subtle bg-surface-lowest p-5 hover:border-secondary"
                >
                  <div className="text-headline-md">{dept.name}</div>
                </Link>
              </li>
            ))}
          </ul>
        </QueryState>
      </div>
    </div>
  )
}
