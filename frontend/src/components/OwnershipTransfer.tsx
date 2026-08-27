import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { useErrorText } from '../lib/useErrorText'
import { Panel } from './Surface'
import { formatRelativeTime } from '../lib/relativeTime'

const transferSchema = z.object({
  id: z.string(),
  from_user: z.string(),
  to_user: z.string(),
  status: z.string(),
  created_at: z.string(),
  from: z.object({ id: z.string(), first_name: z.string(), last_name: z.string() }).nullable().optional(),
  to: z.object({ id: z.string(), first_name: z.string(), last_name: z.string() }).nullable().optional(),
})

async function fetchPending() {
  const { data, error } = await supabase
    .from('ownership_transfers')
    .select(
      'id, from_user, to_user, status, created_at, from:profiles!ownership_transfers_from_user_fkey(id, first_name, last_name), to:profiles!ownership_transfers_to_user_fkey(id, first_name, last_name)',
    )
    .eq('status', 'pending')
    .maybeSingle()
  if (error) throw error
  return data ? transferSchema.parse(data) : null
}

const name = (p?: { first_name: string; last_name: string } | null) =>
  p ? `${p.first_name} ${p.last_name}`.trim() : 'someone'

/**
 * The one outstanding ownership offer, shown to the two people it concerns.
 *
 * Ownership never moves by one person taking it: the holder offers, and it
 * only changes hands when the other person accepts. Until then this is the
 * only trace of it, and either end can call it off.
 */
export function OwnershipTransfer() {
  const { session, isAdmin } = useAuth()
  const errorText = useErrorText()
  const queryClient = useQueryClient()

  const pending = useQuery({ queryKey: ['ownership-transfer'], queryFn: fetchPending, enabled: isAdmin })
  const transfer = pending.data

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['ownership-transfer'] })
    queryClient.invalidateQueries({ queryKey: ['all-user-roles'] })
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
    // Ownership decides what the whole page offers, so the session's own
    // view of it has to be re-read rather than patched.
    window.setTimeout(() => window.location.reload(), 400)
  }

  const respond = useMutation({
    mutationFn: async (accept: boolean) => {
      const { error } = await supabase.rpc('respond_ownership_transfer', {
        transfer_id: transfer!.id,
        accept,
      })
      if (error) throw error
    },
    onSuccess: refresh,
  })

  const cancel = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('cancel_ownership_transfer', { transfer_id: transfer!.id })
      if (error) throw error
    },
    onSuccess: refresh,
  })

  if (!transfer) return null

  const forMe = transfer.to_user === session?.user.id
  const mine = transfer.from_user === session?.user.id
  if (!forMe && !mine) return null

  const error = respond.error ?? cancel.error

  return (
    <Panel title="Ownership" className="mb-6">
      <p className="text-body-md text-on-surface">
        {forMe ? (
          <>
            <span className="font-medium">{name(transfer.from)}</span> has offered you ownership of
            the app. Accepting makes you the one account that can grant and remove Admin;{' '}
            {name(transfer.from)} stays an Admin.
          </>
        ) : (
          <>
            You have offered ownership to <span className="font-medium">{name(transfer.to)}</span>.
            It moves only when they accept.
          </>
        )}
      </p>
      <p className="mt-1 font-mono text-label-sm text-on-surface-variant">
        Offered {formatRelativeTime(transfer.created_at)}
      </p>

      {error && (
        <p className="mt-3 rounded-xl bg-error-container px-3.5 py-2.5 text-body-sm text-on-error-container">
          {errorText(error, 'That did not go through.')}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        {forMe ? (
          <>
            <button
              type="button"
              onClick={() => respond.mutate(true)}
              disabled={respond.isPending}
              className="rounded-full bg-primary px-5 py-2.5 text-body-sm font-medium text-on-primary shadow-[var(--shadow-ambient)] transition-transform duration-500 ease-[var(--ease-glide)] active:scale-[0.98] disabled:opacity-50"
            >
              {respond.isPending ? 'Working…' : 'Accept ownership'}
            </button>
            <button
              type="button"
              onClick={() => respond.mutate(false)}
              disabled={respond.isPending}
              className="rounded-full px-4 py-2.5 text-body-sm font-medium text-on-surface ring-1 ring-black/8 transition-all duration-500 ease-[var(--ease-glide)] hover:ring-black/20 disabled:opacity-50 dark:ring-white/10"
            >
              Decline
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => cancel.mutate()}
            disabled={cancel.isPending}
            className="rounded-full px-4 py-2.5 text-body-sm font-medium text-on-surface ring-1 ring-black/8 transition-all duration-500 ease-[var(--ease-glide)] hover:ring-black/20 disabled:opacity-50 dark:ring-white/10"
          >
            {cancel.isPending ? 'Withdrawing…' : 'Withdraw the offer'}
          </button>
        )}
      </div>
    </Panel>
  )
}
