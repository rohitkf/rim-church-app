import { type FormEvent, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { ActionButton, PageHeader, inputClasses } from '../components/Surface'
import { formatRelativeTime } from '../lib/relativeTime'
import { messageRowSchema, type MessageRow } from '../lib/types'
import { formatCountdown, nextBoardClearTime } from '../lib/boardClear'
import { teamChipStyle } from '../lib/teamGradient'
import { useTeamStyle } from '../lib/useTeamStyle'
import { fetchDepartments, fetchOwnMemberships } from '../lib/queries'
import { idOrNull } from '../lib/selectValue'
import { canPostOnBoard } from '../lib/joinRequests'
import { TeamAlertPanel } from '../components/TeamAlertPanel'
import { useErrorText } from '../lib/useErrorText'
import { Link } from 'react-router-dom'

function BoardClearCountdown() {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const remaining = nextBoardClearTime(new Date(now)).getTime() - now

  return (
    <div className="mt-4 flex items-center gap-2 rounded-[var(--radius-card)] bg-surface-lowest hairline px-4 py-3">
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
  const { teamStyle } = useTeamStyle()

  return (
    <span
      className="rounded-full px-2 py-0.5 font-mono text-label-sm uppercase tracking-wide"
      style={teamChipStyle(color, teamStyle)}
    >
      {name}
    </span>
  )
}

export function MessageBoardPage() {
  const { session, isAdmin, hasRole, roles } = useAuth()
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const isHead = hasRole('department_head')

  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [postAsDeptId, setPostAsDeptId] = useState<string | null>(null)
  const [postAsTouched, setPostAsTouched] = useState(false)
  // Which deletion the user is being asked to confirm, if any.
  const [confirm, setConfirm] = useState<{ kind: 'one'; id: string } | { kind: 'all' } | null>(null)

  const messagesQuery = useQuery({ queryKey: ['messages'], queryFn: fetchMessages })
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  const membershipsQuery = useQuery({
    queryKey: ['own-memberships', session?.user.id],
    queryFn: () => fetchOwnMemberships(session!.user.id),
    enabled: !!session,
  })

  // What this person may put on a post: the teams they belong to (guest
  // memberships included, marked as such), plus the team they head, plus
  // "Admin" for Admins — an Admin speaks for the church, not for a team.
  const roleDeptIds = roles.map((r) => r.department_id).filter((id): id is string => !!id)
  const memberships = membershipsQuery.data ?? []
  const guestDeptIds = new Set(
    memberships.filter((m) => m.member_type === 'guest').map((m) => m.department_id),
  )
  const myDeptIds = new Set([...memberships.map((m) => m.department_id), ...roleDeptIds])
  const departments = departmentsQuery.data ?? []

  // Being on a team is what earns a voice here — the same rule the
  // messages_insert policy enforces, so the form is only offered to
  // someone the database would actually accept a post from.
  const canPost = canPostOnBoard({
    isAdmin,
    isHead,
    memberDeptIds: memberships.map((m) => m.department_id),
  })

  const postAsOptions = departments
    .filter((d) => myDeptIds.has(d.id))
    .map((d) => ({ id: d.id, label: guestDeptIds.has(d.id) ? `${d.name} (guest)` : d.name }))

  // Admins default to posting as Admin; everyone else to a team they're a
  // core member of, falling back to whatever else they can post as.
  const defaultPostAs = isAdmin
    ? ''
    : (departments.find((d) => myDeptIds.has(d.id) && !guestDeptIds.has(d.id))?.id ??
      postAsOptions[0]?.id ??
      '')
  const effectivePostAs = postAsTouched ? postAsDeptId : defaultPostAs

  const postMessage = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('messages')
        .insert({
          author_id: session!.user.id,
          body: body.trim(),
          // "" is the select's way of saying no team — as an Admin posting
          // for the church rather than for a department.
          department_id: idOrNull(effectivePostAs),
        })
      if (error) throw error
    },
    onSuccess: () => {
      setBody('')
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['messages'] })
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not post message.')),
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
    onError: (err: unknown) => setError(errorText(err, 'Could not delete that message.')),
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
    onError: (err: unknown) => setError(errorText(err, 'Could not clear the board.')),
  })

  const removing = deleteMessage.isPending || clearBoard.isPending

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    postMessage.mutate()
  }

  // The board is a reading column, so the header shares its width: the one
  // action then sits over the posts it acts on rather than out at the page
  // edge with nothing under it.
  return (
    <div className="max-w-2xl">
      <PageHeader
        eyebrow="Everyone signed in"
        title="Message Board"
        description="A post speaks for the team on its badge."
        action={
          isAdmin && (messagesQuery.data?.length ?? 0) > 0 ? (
            <ActionButton
              tone="quiet"
              onClick={() => {
                setError(null)
                setConfirm({ kind: 'all' })
              }}
              className="text-error"
            >
              Clear board now
            </ActionButton>
          ) : undefined
        }
      />

      <BoardClearCountdown />

      {/* Admins and heads only — the panel renders nothing for anyone else. */}
      <TeamAlertPanel />

      {canPost && (
        <form onSubmit={handleSubmit} className="mt-6 rounded-[var(--radius-card)] bg-surface-lowest hairline p-4">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Post an announcement…"
            rows={3}
            className={`${inputClasses} resize-y`}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            {error && <p className="min-w-0 flex-1 text-body-sm text-error">{error}</p>}
            <div className="ml-auto flex items-center gap-3">
              {(postAsOptions.length > 0 || isAdmin) && (
                <label className="flex items-center gap-2 text-body-sm text-on-surface-variant">
                  Post as
                  <select
                    value={effectivePostAs ?? ''}
                    onChange={(e) => {
                      setPostAsTouched(true)
                      setPostAsDeptId(e.target.value || null)
                    }}
                    className="rounded-full bg-raised hairline px-3 py-1.5 text-body-sm text-on-surface"
                  >
                    {isAdmin && <option value="">Admin</option>}
                    {postAsOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                type="submit"
                disabled={postMessage.isPending}
                className="rounded-full bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
              >
                {postMessage.isPending ? 'Posting…' : 'Post'}
              </button>
            </div>
          </div>
        </form>
      )}

      {!canPost && !membershipsQuery.isLoading && (
        <div className="mt-6 rounded-[var(--radius-shell)] bg-surface-low p-1.5 ring-1 ring-black/5 shadow-[var(--shadow-ambient)] dark:ring-white/10">
          <div className="rounded-[var(--radius-core)] bg-surface-lowest px-5 py-6 text-center">
            <p className="text-body-md text-on-surface">You&rsquo;re not on a team yet.</p>
            <p className="mx-auto mt-1.5 max-w-md text-body-sm text-on-surface-variant">
              A post here speaks for a team, so joining one comes first. Ask a team to take you on
              and the head will decide — you can read the board in the meantime.
            </p>
            <Link
              to="/departments"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-body-sm font-medium text-on-primary shadow-[var(--shadow-ambient)] transition-all duration-500 ease-[var(--ease-glide)] hover:shadow-[var(--shadow-lifted)] active:scale-[0.98]"
            >
              Find a team to join
              <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </div>
      )}

      {error && !canPost && (
        <p className="mt-4 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
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
              <li key={m.id} className="rounded-[var(--radius-card)] bg-surface-lowest hairline p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium text-on-surface">
                      {m.author ? `${m.author.first_name} ${m.author.last_name}` : 'Unknown'}
                    </span>
                    {m.department ? (
                      <DeptBadge name={m.department.name} color={m.department.color} />
                    ) : (
                      // Only an Admin may post without a team badge, so a
                      // post with no team is one made as an Admin.
                      <span className="rounded-full bg-primary px-2 py-0.5 font-mono text-label-sm uppercase tracking-wide text-on-primary">
                        Admin
                      </span>
                    )}
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
          <div className="w-full max-w-md rounded-[var(--radius-card)] bg-surface-lowest hairline p-6 shadow-lg">
            <h2 id="delete-message-title" className="text-headline-md">
              {confirm.kind === 'all' ? 'Clear the whole board?' : 'Delete this message?'}
            </h2>
            <p className="mt-2 text-body-sm text-on-surface-variant">
              {confirm.kind === 'all'
                ? 'Every post disappears for everyone, along with the notifications pointing at them. There is no undo — the board would have cleared itself on Tuesday anyway.'
                : 'The post disappears for everyone, along with the notification it sent. There is no undo.'}
            </p>

            {error && (
              <p className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
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
                className="rounded-full hairline px-4 py-2.5 text-body-sm font-medium text-on-surface hover:border-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  confirm.kind === 'all' ? clearBoard.mutate() : deleteMessage.mutate(confirm.id)
                }
                disabled={removing}
                className="rounded-full bg-error px-4 py-2.5 text-body-sm font-medium text-on-error hover:opacity-90 disabled:opacity-50"
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
