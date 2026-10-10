import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useErrorText } from '../lib/useErrorText'
import { useConfirmAction } from './ConfirmAction'
import { ActionButton } from './Surface'
import { useState } from 'react'

/**
 * The record of join requests that have been answered.
 *
 * People records are kept until somebody clears them (0128), so an
 * answered request — approved or turned down — stays in the database
 * after nobody needs it. This is the Admin's way to clear them all at
 * once. A request still waiting on a Head is never touched: the database
 * refuses those too (team_join_requests_admin_delete).
 */
export function AnsweredJoinRequests({ count }: { count: number }) {
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const { ask, dialog } = useConfirmAction()
  const [error, setError] = useState<string | null>(null)

  const clear = useMutation({
    mutationFn: async () => {
      const { error: e } = await supabase.from('team_join_requests').delete().neq('status', 'pending')
      if (e) throw e
    },
    onSuccess: () => {
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['join-requests'] })
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not clear those requests.')),
  })

  if (count === 0) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-row)] bg-surface-lowest px-4 py-3 hairline">
      <p className="text-body-sm text-on-surface-variant">
        {count} answered join {count === 1 ? 'request is' : 'requests are'} kept as a record.
      </p>
      <ActionButton
        size="sm"
        tone="danger-quiet"
        disabled={clear.isPending}
        onClick={() =>
          ask({
            title: 'Clear answered join requests?',
            body: 'The record of every approved and turned-down request goes. Nobody is taken off a team, and requests still waiting on a Head stay.',
            confirmLabel: 'Clear',
            onConfirm: () => clear.mutate(),
          })
        }
      >
        {clear.isPending ? 'Clearing…' : 'Clear them'}
      </ActionButton>
      {error && <p className="w-full text-body-sm text-error">{error}</p>}
      {dialog}
    </div>
  )
}
