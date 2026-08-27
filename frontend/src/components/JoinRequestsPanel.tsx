import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useErrorText } from '../lib/useErrorText'
import { formatRelativeTime } from '../lib/relativeTime'
import { DEFAULT_DEPT_COLOR } from '../lib/deptBadge'
import type { JoinRequest, MemberType } from '../lib/types'
import { Panel } from './Surface'
import { UsersIcon } from './icons'

interface JoinRequestsPanelProps {
  requests: JoinRequest[]
}

/**
 * A head's inbox.
 *
 * Approving is two decisions in one, so it reads as two buttons rather than
 * one button and a dropdown nobody notices: a core member is expected to
 * serve and counts toward the team's availability, a guest can see what the
 * team is doing without being on the hook for it.
 */
export function JoinRequestsPanel({ requests }: JoinRequestsPanelProps) {
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const respond = useMutation({
    mutationFn: async ({
      requestId,
      accept,
      asType,
    }: {
      requestId: string
      accept: boolean
      asType: MemberType
    }) => {
      const { error } = await supabase.rpc('respond_team_join', {
        request_id: requestId,
        accept,
        as_type: asType,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setError(null)
      setBusyId(null)
      queryClient.invalidateQueries({ queryKey: ['join-requests'] })
      queryClient.invalidateQueries({ queryKey: ['department-members'] })
      queryClient.invalidateQueries({ queryKey: ['own-memberships'] })
      queryClient.invalidateQueries({ queryKey: ['own-departments'] })
    },
    onError: (err: unknown) => {
      setBusyId(null)
      setError(errorText(err, 'Could not answer that request.'))
    },
  })

  if (requests.length === 0) return null

  function answer(requestId: string, accept: boolean, asType: MemberType) {
    setError(null)
    setBusyId(requestId)
    respond.mutate({ requestId, accept, asType })
  }

  return (
    <Panel
      title="Requests to join"
      icon={UsersIcon}
      aside={
        <span className="rounded-full bg-secondary/12 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-secondary ring-1 ring-inset ring-secondary/20">
          {requests.length} waiting
        </span>
      }
    >
      {error && (
        <p className="mb-4 whitespace-pre-line rounded-xl bg-error-container px-3.5 py-2.5 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {requests.map((request) => {
          const colour = request.department?.color ?? DEFAULT_DEPT_COLOR
          const name = request.requester
            ? `${request.requester.first_name} ${request.requester.last_name}`
            : 'Someone'
          const busy = busyId === request.id

          return (
            <li
              key={request.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl bg-surface-low px-4 py-3.5 ring-1 ring-black/5 dark:ring-white/8"
            >
              <span className="flex min-w-0 flex-1 items-center gap-3">
                {request.requester?.avatar_url ? (
                  <img
                    src={request.requester.avatar_url}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-full object-cover hairline"
                  />
                ) : (
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono text-label-sm uppercase hairline"
                    style={{
                      backgroundColor: `color-mix(in oklab, ${colour} 16%, transparent)`,
                      color: colour,
                    }}
                    aria-hidden="true"
                  >
                    {name.slice(0, 1)}
                  </span>
                )}

                <span className="min-w-0">
                  <span className="block truncate text-body-md font-medium text-on-surface">{name}</span>
                  <span className="block truncate text-label-sm text-on-surface-variant">
                    {request.department?.name ?? 'a team'} · asked {formatRelativeTime(request.created_at)}
                  </span>
                  {request.note && (
                    <span className="mt-1 block text-body-sm text-on-surface-variant">
                      &ldquo;{request.note}&rdquo;
                    </span>
                  )}
                </span>
              </span>

              <span className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => answer(request.id, true, 'core')}
                  disabled={busy}
                  className="rounded-full bg-primary px-3.5 py-1.5 text-label-sm font-medium text-on-primary shadow-[var(--shadow-ambient)] transition-all duration-500 ease-[var(--ease-glide)] hover:shadow-[var(--shadow-lifted)] active:scale-[0.98] disabled:opacity-50"
                >
                  Add as core member
                </button>
                <button
                  type="button"
                  onClick={() => answer(request.id, true, 'guest')}
                  disabled={busy}
                  className="rounded-full px-3 py-1.5 text-label-sm font-medium text-on-surface ring-1 ring-black/8 transition-colors duration-300 ease-[var(--ease-glide)] hover:ring-black/20 disabled:opacity-50 dark:ring-white/12 dark:hover:ring-white/24"
                >
                  Add as guest
                </button>
                <button
                  type="button"
                  onClick={() => answer(request.id, false, 'core')}
                  disabled={busy}
                  className="rounded-full px-3 py-1.5 text-label-sm font-medium text-on-surface-variant transition-colors duration-300 ease-[var(--ease-glide)] hover:text-error disabled:opacity-50"
                >
                  Decline
                </button>
              </span>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
