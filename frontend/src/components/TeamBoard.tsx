import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { fetchMembersForDepartments } from '../lib/queries'
import { parseMentions, type MentionablePerson } from '../lib/mentions'
import { MentionInput } from './MentionInput'
import { MessageBody } from './MessageBody'
import { formatTime } from '../lib/time'
import { useErrorText } from '../lib/useErrorText'
import type { Department } from '../lib/types'

const teamMessageSchema = z.object({
  id: z.string(),
  department_id: z.string(),
  author_id: z.string(),
  body: z.string(),
  kind: z.enum(['post', 'alert']),
  created_at: z.string(),
  edited_at: z.string().nullable(),
  deleted_at: z.string().nullable(),
  author: z
    .object({ id: z.string(), first_name: z.string(), last_name: z.string() })
    .nullable(),
})
type TeamMessage = z.infer<typeof teamMessageSchema>

async function fetchTeamMessages(departmentId: string): Promise<TeamMessage[]> {
  const { data, error } = await supabase
    .from('team_messages')
    .select('id, department_id, author_id, body, kind, created_at, edited_at, deleted_at, author:profiles!team_messages_author_id_fkey(id, first_name, last_name)')
    .eq('department_id', departmentId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return z.array(teamMessageSchema).parse(data)
}

const initials = (person: { first_name: string; last_name: string } | null) =>
  person ? `${person.first_name.slice(0, 1)}${person.last_name.slice(0, 1)}` : '··'

/**
 * A team's own room.
 *
 * Beside the message board rather than inside it, because they are not the
 * same conversation: the board speaks to the whole church and is read once;
 * this is the four people setting up cameras asking each other where the
 * SD reader is. Only the team can see it, so it can be specific in a way
 * the board never can.
 *
 * Alerts land here too. An alert used to exist only as a notification,
 * which meant that reading it on the way in was the same as losing it —
 * now it is a message in the room that also interrupts, and it can still
 * be read at half past nine when someone asks what the change was.
 */
export function TeamBoard({
  departments,
  className = '',
  departmentId: controlledId,
}: {
  departments: Department[]
  className?: string
  /**
   * Which team's room to show. Passing it makes the board a follower: the
   * page owns the choice and shows the picker, so the chat, the alert
   * composer and the polls all answer about the same team instead of each
   * asking separately.
   */
  departmentId?: string | null
}) {
  const { session, isAdmin } = useAuth()
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  const controlled = controlledId !== undefined
  const departmentId = controlled ? controlledId : (selectedId ?? departments[0]?.id ?? null)
  const department = departments.find((d) => d.id === departmentId) ?? null

  const messagesQuery = useQuery({
    queryKey: ['team-messages', departmentId],
    queryFn: () => fetchTeamMessages(departmentId!),
    enabled: !!departmentId,
  })

  const rosterQuery = useQuery({
    queryKey: ['team-board-roster', departmentId],
    queryFn: () => fetchMembersForDepartments([departmentId!]),
    enabled: !!departmentId,
  })

  const people: MentionablePerson[] = useMemo(
    () =>
      (rosterQuery.data ?? [])
        .map((m) => m.profiles)
        .filter((p): p is NonNullable<typeof p> => !!p)
        .map((p) => ({ id: p.id, first_name: p.first_name, last_name: p.last_name })),
    [rosterQuery.data],
  )

  // A chat has to arrive without a refresh, or it is a forum.
  useEffect(() => {
    if (!departmentId) return
    const channel = supabase
      .channel(`team-messages-${departmentId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'team_messages', filter: `department_id=eq.${departmentId}` },
        () => queryClient.invalidateQueries({ queryKey: ['team-messages', departmentId] }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [departmentId, queryClient])

  // New messages belong at the bottom. The scroller is moved directly
  // rather than with scrollIntoView, which walks up the ancestors and
  // scrolls the whole page — landing on the message board with its own
  // header pushed off the top of the screen.
  useEffect(() => {
    const scroller = scrollerRef.current
    if (scroller) scroller.scrollTop = scroller.scrollHeight
  }, [messagesQuery.data])

  // Which message is showing its Edit/Delete row, which is being edited, and
  // which is one tap from going. Touch has no hover, so the actions appear on
  // a tap rather than on a pointer nobody has.
  const [openActionsId, setOpenActionsId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const post = useMutation({
    mutationFn: async () => {
      const text = body.trim()
      if (!text || !departmentId || !session) return
      const { error: insertError } = await supabase.from('team_messages').insert({
        department_id: departmentId,
        author_id: session.user.id,
        body: text,
        mentions: parseMentions(text, people),
      })
      if (insertError) throw insertError
    },
    onSuccess: () => {
      setBody('')
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['team-messages', departmentId] })
    },
    onError: (err: unknown) => setError(errorText(err, 'That message did not send.')),
  })

  /*
   * Second thoughts.
   *
   * A message sent to the wrong room, or with the wrong time in it, used to
   * stand for ever — and deleting one took it away so completely that the
   * replies underneath stopped making sense. So: an edit says it was edited,
   * and a delete leaves a marker where the message was. Both are the
   * author's; an Admin can take one down but never rewrite it, which the
   * database enforces rather than this form.
   */
  const editMessage = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      const { error: updateError } = await supabase
        .from('team_messages')
        .update({ body: text, mentions: parseMentions(text, people) })
        .eq('id', id)
      if (updateError) throw updateError
    },
    onSuccess: () => {
      setEditingId(null)
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['team-messages', departmentId] })
    },
    onError: (err: unknown) => setError(errorText(err, 'That edit did not save.')),
  })

  const deleteMessage = useMutation({
    mutationFn: async (id: string) => {
      const { error: updateError } = await supabase
        .from('team_messages')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (updateError) throw updateError
    },
    onSuccess: () => {
      setConfirmDeleteId(null)
      setOpenActionsId(null)
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['team-messages', departmentId] })
    },
    onError: (err: unknown) => setError(errorText(err, 'That message could not be deleted.')),
  })

  if (departments.length === 0) return null

  const messages = messagesQuery.data ?? []

  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-tile)] bg-surface-lowest hairline ${className}`}
    >
      <header className="flex items-center gap-3 border-b border-border-subtle px-5 py-4">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] font-mono text-label-sm text-on-surface"
          style={{
            background: `linear-gradient(140deg, ${department?.color ?? '#0a84ff'}, transparent)`,
          }}
        >
          {department?.name.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="break-words text-body-md font-medium text-on-surface">
            {department?.name}
          </div>
          <div className="font-mono text-label-sm text-on-surface-faint">
            Only this team can read it
          </div>
        </div>
      </header>

      {!controlled && departments.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-5 py-3">
          {departments.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setSelectedId(d.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-label-md font-medium transition-colors ${
                d.id === departmentId
                  ? 'bg-secondary text-on-primary'
                  : 'bg-raised text-on-surface-variant hover:bg-raised-strong'
              }`}
            >
              {d.name}
            </button>
          ))}
        </div>
      )}

      <div
        ref={scrollerRef}
        className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-4"
      >
        {messagesQuery.isLoading && (
          <p className="text-body-sm text-on-surface-variant">Loading…</p>
        )}
        {!messagesQuery.isLoading && messages.length === 0 && (
          <p className="my-auto text-center text-body-sm text-on-surface-variant">
            Nothing here yet. This room is just your team — say what you&rsquo;d say in the corridor.
          </p>
        )}

        {messages.map((message) => {
          const mine = message.author_id === session?.user.id

          if (message.kind === 'alert') {
            return (
              <div
                key={message.id}
                className="rounded-[var(--radius-card)] bg-[color-mix(in_oklab,var(--color-accent-orange)_9%,var(--color-surface-lowest))] px-4 py-3 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent-orange)_26%,transparent)]"
              >
                <div className="flex items-center gap-2 font-mono text-label-sm uppercase tracking-wide text-accent-orange">
                  Alert
                  <span className="ml-auto normal-case text-on-surface-faint">
                    {formatTime(message.created_at)}
                  </span>
                </div>
                <MessageBody
                  body={message.body}
                  people={people}
                  className="mt-1.5 text-body-sm text-on-surface"
                />
                <div className="mt-1.5 font-mono text-label-sm text-on-surface-faint">
                  {message.author ? `${message.author.first_name} ${message.author.last_name}` : ''}
                </div>
              </div>
            )
          }

          const gone = !!message.deleted_at
          const editing = editingId === message.id
          // An Admin can take a message down; only its author can reword it.
          const mayDelete = mine || isAdmin
          const stamp = `${formatTime(message.created_at)}${message.edited_at ? ' · edited' : ''}`

          return (
            <div key={message.id} className={`flex gap-2.5 ${mine ? 'justify-end' : ''}`}>
              {!mine && (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-raised-strong font-mono text-label-sm text-on-surface-variant">
                  {initials(message.author)}
                </span>
              )}
              <div className="max-w-[78%] min-w-0">
                {!mine && (
                  <div className="mb-1 text-label-md text-on-surface-faint">
                    {message.author?.first_name} · {stamp}
                  </div>
                )}

                {gone ? (
                  /* The gap stays. A conversation with a hole in it reads as
                     a conversation with a hole in it; one where the message
                     simply vanished reads as replies to nothing. */
                  <div className="rounded-[18px] px-3.5 py-2.5 text-body-sm italic text-on-surface-faint hairline">
                    This message was deleted
                  </div>
                ) : editing ? (
                  <div className="flex flex-col gap-2">
                    <MentionInput
                      value={draft}
                      onChange={setDraft}
                      people={people}
                      rows={2}
                      onSubmit={() => draft.trim() && editMessage.mutate({ id: message.id, text: draft.trim() })}
                      className="w-full resize-none rounded-[var(--radius-chip)] bg-raised px-3 py-2 text-body-sm text-on-surface hairline focus:outline-none focus:ring-1 focus:ring-secondary"
                    />
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="tap rounded-full px-3 py-1.5 text-label-md text-on-surface-variant hover:text-on-surface"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={editMessage.isPending || draft.trim().length === 0}
                        onClick={() => editMessage.mutate({ id: message.id, text: draft.trim() })}
                        className="tap rounded-full bg-primary px-3 py-1.5 text-label-md font-medium text-on-primary disabled:opacity-40"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      mayDelete ? setOpenActionsId((id) => (id === message.id ? null : message.id)) : undefined
                    }
                    aria-expanded={mayDelete ? openActionsId === message.id : undefined}
                    className={`block w-full text-left ${mayDelete ? '' : 'cursor-default'}`}
                  >
                    <MessageBody
                      body={message.body}
                      people={people}
                      className={`rounded-[18px] px-3.5 py-2.5 text-body-sm ${
                        mine
                          ? 'rounded-br-[6px] bg-primary text-on-primary'
                          : 'rounded-bl-[6px] bg-raised text-on-surface'
                      }`}
                    />
                  </button>
                )}

                {mine && !editing && (
                  <div className="mt-1 text-right font-mono text-label-sm text-on-surface-faint">
                    {gone ? 'deleted' : stamp}
                  </div>
                )}

                {!gone && !editing && openActionsId === message.id && mayDelete && (
                  <div className={`mt-1 flex flex-wrap gap-3 ${mine ? 'justify-end' : ''}`}>
                    {mine && (
                      <button
                        type="button"
                        onClick={() => {
                          setDraft(message.body)
                          setEditingId(message.id)
                          setOpenActionsId(null)
                        }}
                        className="tap text-label-md font-medium text-secondary hover:underline"
                      >
                        Edit
                      </button>
                    )}
                    {confirmDeleteId === message.id ? (
                      <>
                        <span className="text-label-md text-on-surface-variant">Delete it?</span>
                        <button
                          type="button"
                          disabled={deleteMessage.isPending}
                          onClick={() => deleteMessage.mutate(message.id)}
                          className="tap text-label-md font-medium text-error hover:underline disabled:opacity-50"
                        >
                          Yes, delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="tap text-label-md text-on-surface-variant hover:underline"
                        >
                          Keep
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(message.id)}
                        className="tap text-label-md text-error hover:underline"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {error && (
        <p className="mx-5 mb-2 text-body-sm text-error">{error}</p>
      )}

      <div className="border-t border-border-subtle p-3">
        <MentionInput
          value={body}
          onChange={setBody}
          people={people}
          rows={1}
          disabled={post.isPending}
          onSubmit={() => post.mutate()}
          placeholder={`Message ${department?.name ?? 'your team'}…  @ to mention`}
          className="w-full resize-none rounded-[var(--radius-chip)] bg-raised px-4 py-2.5 text-body-sm text-on-surface hairline placeholder:text-on-surface-faint focus:outline-none focus:ring-1 focus:ring-secondary"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="font-mono text-label-sm text-on-surface-faint">
            Enter sends · Shift+Enter for a new line
          </span>
          <button
            type="button"
            onClick={() => post.mutate()}
            disabled={post.isPending || body.trim().length === 0}
            className="tap rounded-full bg-primary px-4 py-2 text-body-sm font-medium text-on-primary disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </section>
  )
}
