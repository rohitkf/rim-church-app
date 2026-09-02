import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { fetchInvitations } from '../lib/queries'
import { formatRelativeTime } from '../lib/relativeTime'
import { useErrorText } from '../lib/useErrorText'
import {
  invitationStatus,
  invitationTally,
  matchesFilter,
  orderInvitations,
  type InvitationFilter,
} from '../lib/invitations'
import type { Invitation } from '../lib/types'
import { Panel, Pill, Row } from './Surface'
import { QueryState } from './QueryState'
import { TeamMark } from './TeamMark'
import { UserCheckIcon } from './icons'

/**
 * What was already asked, and by whom.
 *
 * Inviting is the one action on this page whose result does not show up on
 * this page: the invited person appears in the roster only once they sign
 * in, so until then there is nothing to see and the honest question — "did
 * anybody already ask them?" — has no answer. Two Admins each inviting the
 * same person a week apart is the small, avoidable mess this exists to
 * prevent.
 *
 * It also gives an outstanding invitation somewhere to be acted on: sent
 * again if it was probably lost, or taken off the list if the person was
 * asked in error or has said no.
 */
export function InvitationHistory() {
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<InvitationFilter>('all')
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmingRevoke, setConfirmingRevoke] = useState<Invitation | null>(null)

  const invitationsQuery = useQuery({ queryKey: ['invitations'], queryFn: fetchInvitations })

  const invitations = useMemo(() => invitationsQuery.data ?? [], [invitationsQuery.data])
  const tally = useMemo(() => invitationTally(invitations), [invitations])
  const shown = useMemo(
    () => orderInvitations(invitations.filter((i) => matchesFilter(i, filter))),
    [invitations, filter],
  )

  const done = () => {
    setBusyId(null)
    queryClient.invalidateQueries({ queryKey: ['invitations'] })
  }

  const resend = useMutation({
    mutationFn: async (invitation: Invitation) => {
      // The same edge function the dialog calls. Its upsert lands on this
      // row rather than adding another, so the list stays one line per
      // address and the date becomes the date of the latest attempt.
      const { data, error: callError } = await supabase.functions.invoke('invite', {
        body: { email: invitation.email, department_id: invitation.department_id },
      })
      if (callError) throw callError
      if (data?.error) throw new Error(data.error)
    },
    onSuccess: () => {
      setError(null)
      done()
    },
    onError: (err: unknown) => {
      setBusyId(null)
      setError(errorText(err, 'Could not send that invitation again.'))
    },
  })

  const revoke = useMutation({
    mutationFn: async (invitation: Invitation) => {
      // Only the record goes. A link already in somebody's inbox is not
      // something this app can reach into and cancel, which is why the
      // confirmation says so rather than implying otherwise.
      const { error: deleteError } = await supabase.from('invitations').delete().eq('id', invitation.id)
      if (deleteError) throw deleteError
    },
    onSuccess: () => {
      setError(null)
      setConfirmingRevoke(null)
      done()
    },
    onError: (err: unknown) => {
      setBusyId(null)
      setError(errorText(err, 'Could not remove that invitation.'))
    },
  })

  const filters: { key: InvitationFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: tally.total },
    { key: 'outstanding', label: 'Outstanding', count: tally.outstanding },
    { key: 'accepted', label: 'Accepted', count: tally.accepted },
  ]

  return (
    <Panel
      title="Invitation history"
      icon={UserCheckIcon}
      aside={
        tally.total > 0 && (
          <span className="flex flex-wrap items-center gap-2">
            {tally.outstanding > 0 && (
              <Pill tone={tally.stale > 0 ? 'orange' : 'blue'} dot>
                {tally.outstanding} outstanding
              </Pill>
            )}
            <Pill tone="green">{tally.accepted} joined</Pill>
          </span>
        )
      }
    >
      <p className="text-body-sm text-on-surface-variant">
        Everybody who has been asked to join, whether or not they have arrived. An invitation is
        counted as accepted the first time that address signs in.
      </p>

      {invitations.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter invitations">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={`tap rounded-full px-3 py-1.5 font-mono text-label-sm uppercase tracking-wide transition-colors duration-300 ${
                filter === f.key
                  ? 'bg-on-surface text-background'
                  : 'bg-raised-strong text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {f.label} {f.count}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      <div className="mt-4">
        <QueryState
          isLoading={invitationsQuery.isLoading}
          error={invitationsQuery.error}
          isEmpty={invitations.length === 0}
          emptyMessage="Nobody has been invited yet."
        >
          {shown.length === 0 ? (
            <p className="text-body-sm text-on-surface-variant">
              {filter === 'accepted'
                ? 'Nobody has accepted an invitation yet.'
                : 'No invitations are outstanding — everybody who was asked has arrived.'}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {shown.map((invitation) => {
                const status = invitationStatus(invitation)
                const busy = busyId === invitation.id

                return (
                  <Row key={invitation.id} as="li" variant="raised" className="flex-wrap gap-y-2">
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="break-all text-body-md font-medium text-on-surface">
                          {invitation.email}
                        </span>
                        {status === 'accepted' && <Pill tone="green">Accepted</Pill>}
                        {status === 'waiting' && <Pill tone="blue">Waiting</Pill>}
                        {status === 'stale' && <Pill tone="orange">No reply</Pill>}
                      </span>

                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-label-sm text-on-surface-variant">
                        {invitation.department && (
                          <span className="flex items-center gap-1.5">
                            <TeamMark color={invitation.department.color} />
                            {invitation.department.name}
                          </span>
                        )}
                        <span>
                          {/* Naming the sender is the whole point of a
                              history: it tells the next Admin who to ask
                              before they send a second one. */}
                          Invited{' '}
                          {invitation.inviter
                            ? `by ${invitation.inviter.first_name} ${invitation.inviter.last_name}`
                            : 'by somebody since removed'}{' '}
                          · {formatRelativeTime(invitation.created_at)}
                        </span>
                        {invitation.accepted_at && (
                          <span>· joined {formatRelativeTime(invitation.accepted_at)}</span>
                        )}
                      </span>
                    </span>

                    {!invitation.accepted_at && (
                      <span className="flex shrink-0 flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setError(null)
                            setBusyId(invitation.id)
                            resend.mutate(invitation)
                          }}
                          className="tap rounded-full hairline px-3 py-1.5 text-body-sm font-medium text-on-surface hover:border-secondary disabled:opacity-50"
                        >
                          {busy && resend.isPending ? 'Sending…' : 'Send again'}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setError(null)
                            setConfirmingRevoke(invitation)
                          }}
                          className="tap rounded-full hairline px-3 py-1.5 text-body-sm font-medium text-error hover:border-error disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </span>
                    )}
                  </Row>
                )
              })}
            </ul>
          )}
        </QueryState>
      </div>

      {confirmingRevoke && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="revoke-invitation-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-[var(--radius-shell)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12">
            <h2 id="revoke-invitation-title" className="text-headline-md">
              Remove the invitation to {confirmingRevoke.email}?
            </h2>
            <p className="mt-2 text-body-sm text-on-surface-variant">
              This takes the row off this list. It cannot un-send an email that has already gone —
              if they follow the link they will still be able to set a password and sign in. Use it
              when the address was wrong, or when they have said no and there is no point waiting.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmingRevoke(null)}
                className="rounded-full px-4 py-2.5 text-body-sm font-medium text-on-surface ring-1 ring-black/8 hover:ring-black/20 dark:ring-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={revoke.isPending}
                onClick={() => {
                  setBusyId(confirmingRevoke.id)
                  revoke.mutate(confirmingRevoke)
                }}
                className="rounded-full bg-error px-4 py-2.5 text-body-sm font-medium text-on-error hover:opacity-90 disabled:opacity-50"
              >
                {revoke.isPending ? 'Removing…' : 'Remove it'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Panel>
  )
}
