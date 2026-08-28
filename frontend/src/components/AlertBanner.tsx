import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { Overlay } from './Surface'
import { formatRelativeTime } from '../lib/relativeTime'

const alertSchema = z.object({
  id: z.string(),
  body: z.string().nullable(),
  created_at: z.string(),
})
type PendingAlert = z.infer<typeof alertSchema>

/**
 * The alert nobody gets to scroll past.
 *
 * An alert exists because reading it late is the same as not reading it —
 * "sound check moved to 8:30" is worth nothing at 8:45. So it stops the
 * page until it has been acknowledged, once, and then never appears again.
 *
 * "Acknowledged" is the notification being marked read: there is no second
 * table keeping score, and dismissing it here also clears it from the
 * bell, which is what someone who has just read the words expects. The
 * alert itself stays on the team board for anyone who wants to check what
 * it said afterwards.
 */
export function AlertBanner() {
  const { session } = useAuth()
  const queryClient = useQueryClient()

  const pendingQuery = useQuery({
    queryKey: ['pending-alerts', session?.user.id],
    queryFn: async (): Promise<PendingAlert[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, body, created_at')
        .eq('user_id', session!.user.id)
        .eq('type', 'team_alert')
        .eq('read_boolean', false)
        .order('created_at', { ascending: true })
      if (error) throw error
      return z.array(alertSchema).parse(data)
    },
    enabled: !!session,
    // Alerts are urgent by definition, so this asks more often than the
    // rest of the app does.
    refetchInterval: 60_000,
  })

  const acknowledge = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_boolean: true })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-alerts'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const alert = pendingQuery.data?.[0]
  if (!alert) return null

  const remaining = (pendingQuery.data?.length ?? 1) - 1

  return (
    <Overlay label="Team alert" onDismiss={() => {}} align="center">
      <div className="w-full max-w-sm rounded-[var(--radius-tile)] bg-surface-low p-6 text-center shadow-[var(--shadow-lifted)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent-orange)_30%,transparent)]">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-accent-orange)_16%,transparent)]">
          <svg
            className="h-5 w-5 text-accent-orange"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
        </div>

        <p className="mt-4 font-mono text-label-sm uppercase tracking-wide text-accent-orange">
          From your team
        </p>
        <p className="mt-2 text-body-md text-on-surface">{alert.body}</p>
        <p className="mt-2 font-mono text-label-sm text-on-surface-faint">
          {formatRelativeTime(alert.created_at)}
        </p>

        <button
          type="button"
          disabled={acknowledge.isPending}
          onClick={() => acknowledge.mutate(alert.id)}
          className="mt-5 w-full rounded-full bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary disabled:opacity-50"
        >
          {acknowledge.isPending ? 'One moment…' : 'Okay'}
        </button>

        {remaining > 0 && (
          <p className="mt-3 font-mono text-label-sm text-on-surface-faint">
            {remaining} more {remaining === 1 ? 'alert' : 'alerts'} after this
          </p>
        )}
      </div>
    </Overlay>
  )
}
