import { type FormEvent, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { formatRelativeTime } from '../lib/relativeTime'
import { messageRowSchema, type MessageRow } from '../lib/types'
import { formatCountdown, nextBoardClearTime } from '../lib/boardClear'
import { deptBadgeStyle } from '../lib/deptBadge'
import { fetchDepartments, fetchOwnDepartmentIds } from '../lib/queries'
import { errorMessage } from '../lib/errorMessage'

function BoardClearCountdown() {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const remaining = nextBoardClearTime(new Date(now)).getTime() - now

  return (
    <div className="mt-4 flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-lowest px-4 py-3">
      <svg
        className="h-4 w-4 shrink-0 text-on-surface-variant"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2 2" />
        <path d="M9 2h6" />
      </svg>
      <span className="text-body-sm text-on-surface-variant">
        Board clears in{' '}
        <span className="font-mono font-medium text-on-surface">{formatCountdown(remaining)}</span>
        <span className="hidden sm:inline"> — every Tuesday, after Sunday service</span>
      </span>
    </div>
  )
}

async function fetchMessages(): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from('messages')
    .select(
      '*, author:profiles!messages_author_id_fkey(id, first_name, last_name), department:departments(id, name, color)',
    )
    .order('created_at', { ascending: false })
  if (error) throw error
  return z.array(messageRowSchema).parse(data)
}


function DeptBadge({ name, color }: { name: string; color: string | null }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 font-mono text-label-sm uppercase tracking-wide"
      style={deptBadgeStyle(color)}
    >
      {name}
    </span>
  )
}

export function MessageBoardPage() {
  const { session, isAdmin, hasRole, roles } = useAuth()
  const queryClient = useQueryClient()
  // Heads post; that includes the head of the Service Flow team, who is a
  // department head like any other now that Service Flow is a team.
  const canPost = isAdmin || hasRole('department_head')

  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [postAsDeptId, setPostAsDeptId] = useState<string | null>(null)
  const [postAsTouched, setPostAsTouched] = useState(false)
  // Which deletion the user is being asked to confirm, if any.
  const [confirm, setConfirm] = useState<{ kind: 'one'; id: string } | { kind: 'all' } | null>(null)

  const messagesQuery = useQuery({ queryKey: ['messages'], queryFn: fetchMessages })
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments, enabled: canPost })
  const ownDeptsQuery = useQuery({
    queryKey: ['own-departments', session?.user.id],
    queryFn: () => fetchOwnDepartmentIds(session!.user.id),
    enabled: canPost && !!session,
  })

  // Departments this user can post as: admins pick any; everyone else is
  // limited to departments they belong to or head.
  const roleDeptIds = roles.map((r) => r.department_id).filter((id): id is string => !!id)
  const ownDeptIds = new Set([...(ownDeptsQuery.data ?? []), ...roleDeptIds])
  const postAsOptions = (departmentsQuery.data ?? []).filter((d) => isAdmin || ownDeptIds.has(d.id))
  const defaultPostAs = postAsOptions.find((d) => ownDeptIds.has(d.id))?.id ?? null
  const effectivePostAs = postAsTouched ? postAsDeptId : defaultPostAs

  const postMessage = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('messages')
        .insert({ author_id: session!.user.id, body: body.trim(), department_id: effectivePostAs })
      if (error) throw error
    },
    onSuccess: () => {
      setBody('')
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['messages'] })
    },
    onError: (err: unknown) => setError(errorMessage(err, 'Could not post message.')),
  })

  const deleteMessage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_message', { message_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      setConfirm(null)
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (err: unknown) => setError(errorMessage(err, 'Could not delete that message.')),
  })

  const clearBoard = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('clear_message_board')
      if (error) throw error
    },
    onSuccess: () => {
      setConfirm(null)
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (err: unknown) => setError(errorMessage(err, 'Could not clear the board.')),
  })

  const removing = deleteMessage.isPending || clearBoard.isPending

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    postMessage.mutate()
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-headline-xl">Message Board</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">
        Visible to everyone signed in. Only Admins, Department Heads, and Service Flow
        Coordinators can post.
      </p>

      <BoardClearCountdown />

      {isAdmin && (messagesQuery.data?.length ?? 0) > 0 && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => {
              setError(null)
              setConfirm({ kind: 'all' })
            }}
            className="rounded-sm border border-border-subtle px-3 py-1.5 text-body-sm font-medium text-error hover:border-error"
          >
            Clear board now
          </button>
        </div>
      )}

      {canPost && (
        <form onSubmit={handleSubmit} className="mt-6 rounded-lg border border-border-subtle bg-surface-lowest p-4">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Post an announcement…"
            rows={3}
            className="w-full rounded-sm border border-border-subtle px-3 py-2 text-body-md text-on-surface focus:border-2 focus:border-secondary focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            {error && <p className="text-body-sm text-error">{error}</p>}
            <div className="ml-auto flex items-center gap-3">
              {postAsOptions.length > 0 && (
                <label className="flex items-center gap-2 text-body-sm text-on-surface-variant">
                  Post as
                  <select
                    value={effectivePostAs ?? ''}
                    onChange={(e) => {
                      setPostAsTouched(true)
                      setPostAsDeptId(e.target.value || null)
                    }}
                    className="rounded-sm border border-border-subtle px-2 py-1.5 text-body-sm text-on-surface"
                  >
                    <option value="">No team badge</option>
                    {postAsOptions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                type="submit"
                disabled={postMessage.isPending}
                className="rounded-sm bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
              >
                {postMessage.isPending ? 'Posting…' : 'Post'}
              </button>
            </div>
          </div>
        </form>
      )}

      {error && !canPost && (
        <p className="mt-4 rounded-sm bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      <div className="mt-6">
        <QueryState
          isLoading={messagesQuery.isLoading}
          error={messagesQuery.error}
          isEmpty={messagesQuery.data?.length === 0}
          emptyMessage="No messages yet."
        >
          <ul className="flex flex-col gap-4">
            {messagesQuery.data?.map((m) => (
              <li key={m.id} className="rounded-lg border border-border-subtle bg-surface-lowest p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium text-on-surface">
                      {m.author ? `${m.author.first_name} ${m.author.last_name}` : 'Unknown'}
                    </span>
                    {m.department && <DeptBadge name={m.department.name} color={m.department.color} />}
                  </span>
                  <span className="flex shrink-0 items-baseline gap-3">
                    <span className="font-mono text-label-sm text-on-surface-variant">
                      {formatRelativeTime(m.created_at)}
                    </span>
                    {(isAdmin || m.author?.id === session?.user.id) && (
                      <button
                        type="button"
                        onClick={() => {
                          setError(null)
                          setConfirm({ kind: 'one', id: m.id })
                        }}
                        aria-label="Delete message"
                        className="text-label-sm font-medium text-on-surface-variant hover:text-error"
                      >
                        Delete
                      </button>
                    )}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-body-md text-on-surface">{m.body}</p>
              </li>
            ))}
          </ul>
        </QueryState>
      </div>

      {confirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-message-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
        >
          <div className="w-full max-w-md rounded-lg border border-border-subtle bg-surface-lowest p-6 shadow-lg">
            <h2 id="delete-message-title" className="text-headline-md">
              {confirm.kind === 'all' ? 'Clear the whole board?' : 'Delete this message?'}
            </h2>
            <p className="mt-2 text-body-sm text-on-surface-variant">
              {confirm.kind === 'all'
                ? 'Every post disappears for everyone, along with the notifications pointing at them. There is no undo — the board would have cleared itself on Tuesday anyway.'
                : 'The post disappears for everyone, along with the notification it sent. There is no undo.'}
            </p>

            {error && (
              <p className="mt-3 rounded-sm bg-error-container px-3 py-2 text-body-sm text-on-error-container">
                {error}
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setConfirm(null)
                  setError(null)
                }}
                className="rounded-sm border border-border-subtle px-4 py-2.5 text-body-sm font-medium text-on-surface hover:border-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  confirm.kind === 'all' ? clearBoard.mutate() : deleteMessage.mutate(confirm.id)
                }
                disabled={removing}
                className="rounded-sm bg-error px-4 py-2.5 text-body-sm font-medium text-on-error hover:opacity-90 disabled:opacity-50"
              >
                {removing ? 'Deleting…' : confirm.kind === 'all' ? 'Yes, clear the board' : 'Yes, delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
