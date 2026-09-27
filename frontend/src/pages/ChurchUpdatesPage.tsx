import { useEffect, useState, type FormEvent } from 'react'
import { Lifespan } from '../components/Lifespan'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { useErrorText } from '../lib/useErrorText'
import { formatRelativeTime } from '../lib/relativeTime'
import { CHURCH_UPDATES_KEY } from '../lib/churchUpdates'
import { QueryState } from '../components/QueryState'
import { useConfirmAction } from '../components/ConfirmAction'
import { ActionButton, Field, PageHeader, Pill, Tile, inputClasses } from '../components/Surface'

const TITLE_MAX = 120
const BODY_MAX = 5000

const updateSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  pinned: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  author: z
    .object({ first_name: z.string(), last_name: z.string() })
    .nullable()
    .default(null),
})
type ChurchUpdate = z.infer<typeof updateSchema>

async function fetchChurchUpdates(): Promise<ChurchUpdate[]> {
  const { data, error } = await supabase
    .from('church_updates')
    .select(
      'id, title, body, pinned, created_at, updated_at, author:profiles!church_updates_created_by_fkey(first_name, last_name)',
    )
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return z.array(updateSchema).parse(data)
}

/**
 * Church updates.
 *
 * What the church tells everybody that is neither an event on a date nor
 * an alert that has to be read this minute: new building hours, a
 * thank-you after the harvest, who has joined the pastoral team. Every
 * member reads it, Church Members included, newest first with anything
 * pinned above.
 *
 * An Admin posts, and posting reaches everybody's bell and phone — never
 * their inbox. The database does that (post_church_update), so an update
 * cannot be written without the people it is for being told.
 */
export function ChurchUpdatesPage() {
  const { isAdmin } = useAuth()
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const openedId = params.get('update')
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const { ask, dialog } = useConfirmAction()

  const updatesQuery = useQuery({ queryKey: CHURCH_UPDATES_KEY, queryFn: fetchChurchUpdates })
  const updates = updatesQuery.data ?? []

  // A tap on the notification lands on the update it was about.
  useEffect(() => {
    if (!openedId || !updatesQuery.data) return
    document.getElementById(`update-${openedId}`)?.scrollIntoView?.({ block: 'center' })
  }, [openedId, updatesQuery.data])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: CHURCH_UPDATES_KEY })

  const change = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ChurchUpdate> }) => {
      const { error: e } = await supabase
        .from('church_updates')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (e) throw e
    },
    onSuccess: () => {
      setError(null)
      setEditingId(null)
      invalidate()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not change that update.')),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error: e } = await supabase.from('church_updates').delete().eq('id', id)
      if (e) throw e
    },
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not delete that update.')),
  })

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        eyebrow="For the whole church"
        title="Church Updates"
        description="News from the church — what has changed, what is coming, and who to thank."
      />
      <Lifespan page="updates" className="mb-4" />

      {isAdmin && <UpdateComposer onPosted={invalidate} onError={setError} />}

      {error && (
        <p className="mt-4 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      <QueryState
        isLoading={updatesQuery.isLoading}
        error={updatesQuery.error}
        isEmpty={updates.length === 0}
        emptyMessage={
          isAdmin ? 'Nothing posted yet — the first update goes to everybody.' : 'No updates yet.'
        }
      >
        <ul className="mt-5 flex flex-col gap-4">
          {updates.map((update) => (
            <li key={update.id} id={`update-${update.id}`}>
              <Tile
                tone={update.pinned ? 'accent' : 'plain'}
                className={openedId === update.id ? 'ring-2 ring-primary/50' : ''}
              >
                {editingId === update.id ? (
                  <UpdateEditor
                    update={update}
                    saving={change.isPending}
                    onSave={(title, body) =>
                      change.mutate({ id: update.id, patch: { title, body } })
                    }
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <article>
                    <div className="flex flex-wrap items-center gap-2">
                      {update.pinned && <Pill tone="blue">Pinned</Pill>}
                      <span className="font-mono text-label-sm text-on-surface-faint">
                        {update.author
                          ? `${update.author.first_name} ${update.author.last_name} · `
                          : ''}
                        {formatRelativeTime(update.created_at)}
                        {update.updated_at !== update.created_at &&
                          new Date(update.updated_at).getTime() -
                            new Date(update.created_at).getTime() >
                            60_000 &&
                          ' · edited'}
                      </span>
                    </div>
                    <h2 className="mt-2 break-words text-headline-sm text-on-surface">
                      {update.title}
                    </h2>
                    {/* Plain text, its line breaks kept: an update is written
                        like a notice, not formatted like a web page. */}
                    <p className="mt-2 whitespace-pre-line break-words text-body-md text-on-surface-variant">
                      {update.body}
                    </p>

                    {isAdmin && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <ActionButton
                          size="sm"
                          tone="quiet"
                          onClick={() =>
                            change.mutate({ id: update.id, patch: { pinned: !update.pinned } })
                          }
                        >
                          {update.pinned ? 'Unpin' : 'Pin to top'}
                        </ActionButton>
                        <ActionButton size="sm" tone="ghost" onClick={() => setEditingId(update.id)}>
                          Edit
                        </ActionButton>
                        <ActionButton
                          size="sm"
                          tone="danger-quiet"
                          aria-label={`Delete update: ${update.title}`}
                          onClick={() =>
                            ask({
                              title: 'Delete this update?',
                              body: (
                                <>
                                  <strong>{update.title}</strong> goes for everybody. The
                                  notification they were sent stays in their bell.
                                </>
                              ),
                              onConfirm: () => remove.mutate(update.id),
                            })
                          }
                        >
                          Delete
                        </ActionButton>
                      </div>
                    )}
                  </article>
                )}
              </Tile>
            </li>
          ))}
        </ul>
      </QueryState>

      {dialog}
    </div>
  )
}

/** Posting: a title, what it says, and whether it stays at the top. */
function UpdateComposer({
  onPosted,
  onError,
}: {
  onPosted: () => void
  onError: (message: string | null) => void
}) {
  const errorText = useErrorText()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [pinned, setPinned] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const post = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('post_church_update', {
        title: title.trim(),
        body: body.trim(),
        pinned,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setTitle('')
      setBody('')
      setPinned(false)
      onError(null)
      setNote('Posted — everybody has been told, in the app and on their phone.')
      onPosted()
    },
    onError: (err: unknown) => {
      setNote(null)
      onError(errorText(err, 'That update did not post.'))
    },
  })

  const ready = title.trim().length > 0 && body.trim().length > 0 && !post.isPending

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (ready) post.mutate()
  }

  return (
    <Tile as="section">
      <form onSubmit={handleSubmit} aria-label="Post a church update" className="flex flex-col gap-4">
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
            placeholder="The hall now opens at 9"
            className={inputClasses}
          />
        </Field>
        <Field label="What it says">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
            rows={4}
            placeholder="From this Sunday the side door opens at 9, so the teams setting up can get in before the car park fills."
            className={inputClasses}
          />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-body-sm text-on-surface">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            Pin to the top
          </label>
          <ActionButton type="submit" disabled={!ready}>
            {post.isPending ? 'Posting…' : 'Post update'}
          </ActionButton>
        </div>
        <p className="text-label-sm text-on-surface-faint">
          Everybody signed in is told — their bell and their phone. Never by email.
        </p>
        {note && <p className="text-body-sm text-accent-green">{note}</p>}
      </form>
    </Tile>
  )
}

function UpdateEditor({
  update,
  saving,
  onSave,
  onCancel,
}: {
  update: ChurchUpdate
  saving: boolean
  onSave: (title: string, body: string) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(update.title)
  const [body, setBody] = useState(update.body)
  const ready = title.trim().length > 0 && body.trim().length > 0 && !saving

  return (
    <form
      aria-label={`Edit update: ${update.title}`}
      onSubmit={(e) => {
        e.preventDefault()
        if (ready) onSave(title.trim(), body.trim())
      }}
      className="flex flex-col gap-4"
    >
      <Field label="Title">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
          className={inputClasses}
        />
      </Field>
      <Field label="What it says">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
          rows={5}
          className={inputClasses}
        />
      </Field>
      <p className="text-label-sm text-on-surface-faint">
        Editing does not notify anybody again.
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <ActionButton tone="ghost" onClick={onCancel}>
          Cancel
        </ActionButton>
        <ActionButton type="submit" disabled={!ready}>
          {saving ? 'Saving…' : 'Save'}
        </ActionButton>
      </div>
    </form>
  )
}
