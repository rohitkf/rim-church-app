import { useCallback } from 'react'
import { useAuth } from '../auth/AuthContext'
import { humanError } from './humanError'

/**
 * `errorText(err, fallback)` — the message this particular viewer should
 * see. Admins get the raw database error; everyone else gets the rule they
 * ran into, in words.
 */
export function useErrorText() {
  const { isAdmin } = useAuth()
  return useCallback(
    (err: unknown, fallback: string) => humanError(err, fallback, isAdmin),
    [isAdmin],
  )
}
