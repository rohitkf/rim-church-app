import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from './QueryState'
import { Panel } from './Surface'
import { activitySentence, activityTone } from '../lib/activity'
import { formatRelativeTime } from '../lib/relativeTime'
import { useErrorText } from '../lib/useErrorText'

const activityRowSchema = z.object({
  id: z.string(),
  kind: z.string(),
  subject: z.string().nullable(),
  detail: z.string().nullable(),
  created_at: z.string(),
  actor: z
    .object({ id: z.string(), first_name: z.string().nullable(), last_name: z.string().nullable() })
    .nullable(),
})
type ActivityRow = z.infer<typeof activityRowSchema>

async function fetchActivity(serviceId: string): Promise<ActivityRow[]> {
  const { data, error } = await supabase
    .from('activity')
    .select('id, kind, subject, detail, created_at, actor:profiles!activity_actor_id_fkey(id, first_name, last_name)')
    .eq('service_id', serviceId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return z.array(activityRowSchema).parse(data)
}

/**
 * What has happened on this service, as it happens.
 *
 * One service at a time on purpose: during a Sunday the only activity that
 * matters is this Sunday's, and a feed mixing three of them is a log rather
 * than a dashboard. It clears itself every Tuesday with the message board,
 * and an Admin can clear it by hand for everyone.
 */
export function ActivityFeed({ serviceId, className = '' }: { serviceId: string; className?: string }) {
  const { isAdmin } = useAuth()
  const errorText = useErrorText()
  const queryClient = useQueryClient()

  const activityQuery = useQuery({
    queryKey: ['activity', serviceId],
    queryFn: () => fetchActivity(serviceId),
    enabled: !!serviceId,
  })

  // Live means live: the same Realtime channel the bell uses, so a tick on
  // someone else's phone shows up here without a refresh.
  useEffect(() => {
    if (!serviceId) return
    const channel = supabase
      .channel(`activity-${serviceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'activity', filter: `service_id=eq.${serviceId}` },
        () => queryClient.invalidateQueries({ queryKey: ['activity', serviceId] }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [serviceId, queryClient])

  const clear = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('clear_activity', { svc: serviceId })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['activity', serviceId] }),
  })

  const rows = activityQuery.data ?? []

  return (
    <Panel
      title="Live activity"
      live
      className={className}
      aside={
        isAdmin && rows.length > 0 ? (
          <button
            type="button"
            onClick={() => clear.mutate()}
            disabled={clear.isPending}
            className="text-label-md text-on-surface-variant transition-colors hover:text-error disabled:opacity-50"
          >
            {clear.isPending ? 'Clearing…' : 'Clear'}
          </button>
        ) : undefined
      }
    >
      {clear.error && (
        <p className="mb-3 text-label-md text-error">
          {errorText(clear.error, "That didn't clear.")}
        </p>
      )}
      <QueryState
        isLoading={activityQuery.isLoading}
        error={activityQuery.error}
        isEmpty={rows.length === 0}
        emptyMessage="Nothing has happened on this service yet."
      >
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const who = row.actor
              ? `${row.actor.first_name ?? ''} ${row.actor.last_name ?? ''}`.trim()
              : ''
            return (
              <li key={row.id} className="flex items-start gap-3 text-body-sm">
                {/* The kind as a colour, and the sentence says it too. */}
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${activityTone(row.kind)}`}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="font-medium text-on-surface">{who || 'Someone'}</span>{' '}
                  <span className="text-on-surface-variant">{activitySentence(row)}</span>
                  <span className="block font-mono text-label-sm text-on-surface-faint">
                    {formatRelativeTime(row.created_at)}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      </QueryState>
    </Panel>
  )
}
