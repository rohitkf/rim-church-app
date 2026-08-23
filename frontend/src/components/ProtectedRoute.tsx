import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function ProtectedRoute() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-body-sm text-on-surface-variant">
        Loading…
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  return <Outlet />
}
