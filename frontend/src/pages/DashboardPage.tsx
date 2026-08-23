import { useAuth } from '../auth/AuthContext'

export function DashboardPage() {
  const { profile, roles } = useAuth()

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">
        Welcome{profile ? `, ${profile.first_name}` : ''}
      </h1>
      <p className="text-sm text-neutral-500">
        Dashboard metrics (attendance, checklist progress) land in Phase 5.
      </p>
      {roles.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2 text-xs text-neutral-500">
          {roles.map((r) => (
            <li
              key={r.id}
              className="rounded-full border border-neutral-300 px-2 py-1 dark:border-neutral-700"
            >
              {r.role_type}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
