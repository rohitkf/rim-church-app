import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <div className="text-headline-xl">404</div>
      <p className="text-body-md text-on-surface-variant">
        This page doesn't exist, or you don't have access to it.
      </p>
      <Link to="/" className="mt-2 text-body-sm font-medium text-secondary">
        Back to Dashboard
      </Link>
    </div>
  )
}
