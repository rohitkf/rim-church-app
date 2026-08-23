import { useAuth } from '../auth/AuthContext'
import type { RoleType } from '../auth/types'

const roleChipColor: Record<RoleType, string> = {
  admin: 'bg-primary text-on-primary',
  department_head: 'bg-status-head/15 text-status-head',
  assisting_head: 'bg-status-head/10 text-status-head',
  service_flow_coordinator: 'bg-status-coordinator/15 text-status-coordinator',
}

const roleLabel: Record<RoleType, string> = {
  admin: 'Admin',
  department_head: 'Department Head',
  assisting_head: 'Assisting Head',
  service_flow_coordinator: 'Service Flow Coordinator',
}

export function DashboardPage() {
  const { profile, roles } = useAuth()

  return (
    <div>
      <h1 className="text-headline-xl">Welcome{profile ? `, ${profile.first_name}` : ''}</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">
        Live attendance and checklist readiness metrics land in Phase 5 — this is the shell they'll
        plug into.
      </p>

      {roles.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {roles.map((r) => (
            <li
              key={r.id}
              className={`rounded-full px-3 py-1 font-mono text-label-sm uppercase tracking-wide ${roleChipColor[r.role_type]}`}
            >
              {roleLabel[r.role_type]}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-border-subtle bg-surface-lowest p-6">
          <div className="text-headline-md">Global Readiness</div>
          <p className="mt-2 text-body-sm text-on-surface-variant">
            Attendance % and checklist completion, once Phases 3–5 are built.
          </p>
        </div>
        <div className="rounded-lg border border-border-subtle bg-surface-lowest p-6">
          <div className="text-headline-md">Department Status</div>
          <p className="mt-2 text-body-sm text-on-surface-variant">
            Per-department checklist progress, scoped to what you're allowed to see.
          </p>
        </div>
      </div>
    </div>
  )
}
