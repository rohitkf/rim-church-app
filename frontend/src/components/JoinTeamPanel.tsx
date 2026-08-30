import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useErrorText } from '../lib/useErrorText'
import { TeamAvatar } from './TeamMark'
import { joinableTeams, joinOptions, type TeamJoinOption } from '../lib/joinRequests'
import type { Department, JoinRequest } from '../lib/types'
import { Panel } from './Surface'
import { UsersIcon } from './icons'

interface JoinTeamPanelProps {
  departments: Department[]
  memberDeptIds: string[]
  myRequests: JoinRequest[]
}

/**
 * How long the button may say "Sending…" before it admits it doesn't know.
 *
 * The request itself answers in about thirty milliseconds, so anything
 * approaching this is not slowness — it is a connection that has stopped
 * answering. The Supabase client's own deadline is a minute, which is the
 * right length for a large upload and far too long to watch a button spin
 * on a phone: long enough that people press it again, which is how one ask
 * becomes three.
 */
const REQUEST_TIMEOUT_MS = 15_000

function withDeadline<T>(work: PromiseLike<T>): Promise<T> {
  return Promise.race([
    Promise.resolve(work),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('The server didn’t answer. Check your connection and try again.')),
        REQUEST_TIMEOUT_MS,
      ),
    ),
  ])
}

/**
 * The way in.
 *
 * Someone who has just signed up belongs to nothing, and until now that was
 * a dead end: an empty Teams page and no way to change it without knowing
 * to email a head. Here every team is listed with one honest verb — ask —
 * and the state of that ask afterwards, so the wait is visible rather than
 * silent.
 */
export function JoinTeamPanel({ departments, memberDeptIds, myRequests }: JoinTeamPanelProps) {
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const options = joinableTeams(joinOptions(departments, memberDeptIds, myRequests))

  const refresh = () => {
    setError(null)
    setBusyId(null)
    queryClient.invalidateQueries({ queryKey: ['join-requests'] })
  }

  const ask = useMutation({
    mutationFn: async (departmentId: string) => {
      const { error } = await withDeadline(
        supabase.rpc('request_team_join', { dept_id: departmentId }),
      )
      if (error) throw error
    },
    onSuccess: refresh,
    onError: (err: unknown) => {
      setBusyId(null)
      setError(errorText(err, 'Could not send that request.'))
    },
  })

  const withdraw = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await withDeadline(
        supabase.rpc('withdraw_team_join', { request_id: requestId }),
      )
      if (error) throw error
    },
    onSuccess: refresh,
    onError: (err: unknown) => {
      setBusyId(null)
      setError(errorText(err, 'Could not withdraw that request.'))
    },
  })

  if (options.length === 0) return null

  return (
    <Panel
      title="Join a team"
      icon={UsersIcon}
      aside={
        <span className="text-label-sm text-on-surface-variant">
          The team&rsquo;s head decides, and whether you join as a core member or a guest.
        </span>
      }
    >
      {error && (
        <p className="mb-4 whitespace-pre-line rounded-xl bg-error-container px-3.5 py-2.5 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {options.map((option) => (
          <JoinTeamRow
            key={option.department.id}
            option={option}
            busy={busyId === option.department.id}
            onAsk={() => {
              setError(null)
              setBusyId(option.department.id)
              ask.mutate(option.department.id)
            }}
            onWithdraw={() => {
              if (!option.requestId) return
              setError(null)
              setBusyId(option.department.id)
              withdraw.mutate(option.requestId)
            }}
          />
        ))}
      </ul>
    </Panel>
  )
}

function JoinTeamRow({
  option,
  busy,
  onAsk,
  onWithdraw,
}: {
  option: TeamJoinOption
  busy: boolean
  onAsk: () => void
  onWithdraw: () => void
}) {
  const { department, state } = option

  return (
    <li className="flex items-center gap-3 rounded-xl bg-surface-low px-3.5 py-3 ring-1 ring-black/5 dark:ring-white/8">
      <TeamAvatar
        color={department.color}
        name={department.name}
        className="h-9 w-9 shrink-0 rounded-lg text-label-sm hairline"
      />

      <span className="min-w-0 flex-1">
        <span className="block break-words text-body-md font-medium text-on-surface">{department.name}</span>
        {state === 'pending' && (
          <span className="text-label-sm text-on-surface-variant">Waiting on the head</span>
        )}
        {state === 'declined' && (
          <span className="text-label-sm text-on-surface-variant">Not this time — you can ask again</span>
        )}
      </span>

      {state === 'pending' ? (
        <button
          type="button"
          onClick={onWithdraw}
          disabled={busy}
          className="shrink-0 rounded-full px-3 py-1.5 text-label-sm font-medium text-on-surface-variant ring-1 ring-black/8 transition-colors duration-300 ease-[var(--ease-glide)] hover:text-error hover:ring-error/40 disabled:opacity-50 dark:ring-white/12"
        >
          {busy ? 'Withdrawing…' : 'Withdraw'}
        </button>
      ) : (
        <button
          type="button"
          onClick={onAsk}
          disabled={busy}
          className="shrink-0 rounded-full bg-primary px-3.5 py-1.5 text-label-sm font-medium text-on-primary shadow-[var(--shadow-ambient)] transition-all duration-500 ease-[var(--ease-glide)] hover:shadow-[var(--shadow-lifted)] active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? 'Sending…' : state === 'declined' ? 'Ask again' : 'Request to join'}
        </button>
      )}
    </li>
  )
}
