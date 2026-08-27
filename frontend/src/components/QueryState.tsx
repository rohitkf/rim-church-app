import type { ReactNode } from 'react'
import { useErrorText } from '../lib/useErrorText'

interface QueryStateProps {
  isLoading: boolean
  error: unknown
  isEmpty?: boolean
  emptyMessage?: string
  children: ReactNode
}

/**
 * Consistent loading/error/empty wrapper for a Supabase-backed query, so
 * every list/detail page renders the same three states the same way
 * instead of each screen inventing its own ad-hoc spinner/error text.
 */
export function QueryState({
  isLoading,
  error,
  isEmpty,
  emptyMessage = 'Nothing here yet.',
  children,
}: QueryStateProps) {
  const errorText = useErrorText()
  if (isLoading) {
    return <p className="text-body-sm text-on-surface-variant">Loading…</p>
  }

  if (error) {
    return (
      <p className="rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
        {errorText(error, 'Something went wrong loading this.')}
      </p>
    )
  }

  if (isEmpty) {
    return <p className="text-body-sm text-on-surface-variant">{emptyMessage}</p>
  }

  return <>{children}</>
}
