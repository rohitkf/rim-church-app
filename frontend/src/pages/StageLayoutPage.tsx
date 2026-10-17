import { useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { ActionButton, Overlay, PageHeader, Pill, Tile, inputClasses } from '../components/Surface'
import { Select, triggerClasses } from '../components/Select'
import { QueryState } from '../components/QueryState'
import { Lifespan } from '../components/Lifespan'
import { StageCanvas, type BlockBox } from '../components/StageCanvas'
import { useConfirmAction } from '../components/ConfirmAction'
import { useErrorText } from '../lib/useErrorText'
import { showToast } from '../lib/toast'
import { formatServiceDay } from '../lib/sunday'
import { formatTime } from '../lib/time'
import { formatRelativeTime } from '../lib/relativeTime'
import { useFinishedServices } from '../lib/useFinishedServices'
import { useStageAccess } from '../lib/useStageAccess'
import {
  BLOCK_COLORS,
  DEFAULT_STAGE,
  QUICK_BLOCKS,
  STAGE_KEY,
  addStageBlock,
  addStageComment,
  applyStageTemplate,
  clearStageLayout,
  deleteStageBlock,
  deleteStageComment,
  ensureStageLayout,
  fetchStageBlocks,
  fetchStageComments,
  fetchStageLayout,
  fetchStageLog,
  fetchStageTemplates,
  logSentence,
  personName,
  placeNewBlock,
  saveStageTemplate,
  stampText,
  updateStageBlock,
  type BlockPatch,
  type StageBlock,
} from '../lib/stage'

/**
 * One session's stage: the canvas, and everything around it.
 *
 * The canvas is the page. Under it, whichever block is selected opens
 * for editing — its name, who is on it, its colour — and says who put it
 * there and who last moved it, because "who moved the drums?" is the
 * first question anybody asks of a layout that changed overnight. The
 * thread, the notes and the log fold away until wanted.
 *
 * What is offered follows the church's grid for this page (Settings ›
 * Stage layout) and the service's clock: once a service is over the
 * layout is a record, like its rota.
 */

const sessionSchema = z.object({
  id: z.string(),
  service_id: z.string(),
  session_name: z.string(),
  start_time: z.string(),
  service: z.object({ date: z.string(), service_type: z.string() }),
})

async function fetchSession(id: string) {
  const { data, error } = await supabase
    .from('service_sessions')
    .select('id, service_id, session_name, start_time, service:services(date, service_type)')
    .eq('id', id)
    .single()
  if (error) throw error
  return sessionSchema.parse(data)
}

const personSchema = z.object({ id: z.string(), first_name: z.string(), last_name: z.string() })

async function fetchPeople() {
  const { data, error } = await supabase.from('profiles').select('id, first_name, last_name').order('first_name')
  if (error) throw error
  return z.array(personSchema).parse(data ?? [])
}

type Panel = 'add' | 'templates' | 'comments' | 'history' | null

export function StageLayoutPage() {
  const { sessionId = '' } = useParams()
  const { session: auth } = useAuth()
  const myId = auth?.user.id ?? ''
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const { ask, dialog } = useConfirmAction()
  const { may } = useStageAccess()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel>(null)
  const [error, setError] = useState<string | null>(null)

  const sessionQuery = useQuery({ queryKey: ['service-sessions', 'one', sessionId], queryFn: () => fetchSession(sessionId), enabled: !!sessionId })
  const session = sessionQuery.data
  const { isFinished } = useFinishedServices(session ? [session.service_id] : [])
  const finished = !!session && isFinished(session.service_id)

  const layoutQuery = useQuery({ queryKey: [...STAGE_KEY, 'layout', sessionId], queryFn: () => fetchStageLayout(sessionId), enabled: !!sessionId })
  const layout = layoutQuery.data ?? null
  const layoutId = layout?.id ?? ''
  const blocksQuery = useQuery({ queryKey: [...STAGE_KEY, 'blocks', layoutId], queryFn: () => fetchStageBlocks(layoutId), enabled: !!layoutId })
  const blocks = useMemo(() => blocksQuery.data ?? [], [blocksQuery.data])
  const commentsQuery = useQuery({ queryKey: [...STAGE_KEY, 'comments', layoutId], queryFn: () => fetchStageComments(layoutId), enabled: !!layoutId })
  const logQuery = useQuery({ queryKey: [...STAGE_KEY, 'log', layoutId], queryFn: () => fetchStageLog(layoutId), enabled: !!layoutId && panel === 'history' })
  const templatesQuery = useQuery({ queryKey: [...STAGE_KEY, 'templates'], queryFn: fetchStageTemplates, enabled: panel === 'templates' })
  const peopleQuery = useQuery({ queryKey: [...STAGE_KEY, 'people'], queryFn: fetchPeople, enabled: !!selectedId })

  const canAdd = !finished && may('add')
  const canEdit = !finished && may('edit')
  const canDelete = !finished && may('delete')
  const canComment = !finished && may('comment')
  const stage = layout ? { width: layout.width, height: layout.height } : DEFAULT_STAGE
  const selected = blocks.find((b) => b.id === selectedId) ?? null

  // A block somebody else just removed is simply no longer selected:
  // `selected` is looked up fresh on every render.

  const invalidate = () => queryClient.invalidateQueries({ queryKey: STAGE_KEY })
  const fail = (fallback: string) => (err: unknown) => setError(errorText(err, fallback))

  /** The layout row, made on the first stroke. */
  const layoutFor = async () => {
    if (layout) return layout
    if (!session) throw new Error('The session has not loaded yet.')
    const made = await ensureStageLayout(session.id, session.service_id)
    await queryClient.invalidateQueries({ queryKey: [...STAGE_KEY, 'layout', sessionId] })
    return made
  }

  const add = useMutation({
    mutationFn: async (label: string) => {
      const lay = await layoutFor()
      const at = placeNewBlock(blocks, { width: lay.width, height: lay.height })
      const z = blocks.reduce((m, b) => Math.max(m, b.z), 0) + 1
      return addStageBlock(lay.id, { label: label.trim(), ...at, z })
    },
    onSuccess: (block) => {
      setError(null)
      setPanel(null)
      setSelectedId(block.id)
      return invalidate()
    },
    onError: fail('Could not add the block.'),
  })

  const patch = useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: BlockPatch }) => updateStageBlock(id, changes),
    // Moves land locally first: a drag that waited on the server would snap back.
    onMutate: async ({ id, changes }) => {
      await queryClient.cancelQueries({ queryKey: [...STAGE_KEY, 'blocks', layoutId] })
      const before = queryClient.getQueryData<StageBlock[]>([...STAGE_KEY, 'blocks', layoutId])
      queryClient.setQueryData<StageBlock[]>([...STAGE_KEY, 'blocks', layoutId], (old) =>
        (old ?? []).map((b) => (b.id === id ? { ...b, ...changes } : b)),
      )
      return { before }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.before) queryClient.setQueryData([...STAGE_KEY, 'blocks', layoutId], ctx.before)
      fail('Could not save the change.')(err)
    },
    onSettled: () => invalidate(),
  })

  const remove = useMutation({
    mutationFn: deleteStageBlock,
    onSuccess: () => {
      setSelectedId(null)
      return invalidate()
    },
    onError: fail('Could not remove the block.'),
  })

  const comment = useMutation({
    mutationFn: ({ body, blockId }: { body: string; blockId: string | null }) => addStageComment(layoutId, body, myId, blockId),
    onSuccess: () => invalidate(),
    onError: fail('Could not post that.'),
  })
  const uncomment = useMutation({
    mutationFn: deleteStageComment,
    onSuccess: () => invalidate(),
    onError: fail('Could not delete that.'),
  })

  const clear = useMutation({
    mutationFn: () => clearStageLayout(sessionId),
    onSuccess: () => {
      setSelectedId(null)
      showToast('Stage cleared')
      return invalidate()
    },
    onError: fail('Could not clear the stage.'),
  })

  const apply = useMutation({
    mutationFn: (templateId: string) => applyStageTemplate(sessionId, templateId),
    onSuccess: () => {
      setPanel(null)
      setSelectedId(null)
      showToast('Template applied')
      return invalidate()
    },
    onError: fail('Could not apply the template.'),
  })

  const keep = useMutation({
    mutationFn: (name: string) => saveStageTemplate(sessionId, name),
    onSuccess: (outcome) => {
      setPanel(null)
      showToast(outcome === 'saved' ? 'Saved as a template' : 'Sent to an Admin to approve')
      return invalidate()
    },
    onError: fail('Could not save the template.'),
  })

  const confirmDelete = (block: StageBlock) =>
    ask({
      title: `Remove ${block.label}?`,
      body: 'It comes off the stage. The log keeps a line saying who removed it.',
      confirmLabel: 'Remove',
      onConfirm: () => remove.mutate(block.id),
    })

  const onCommit = (id: string, box: BlockBox) => patch.mutate({ id, changes: box })

  const title = session ? `${session.session_name}` : 'Stage layout'
  const when = session ? `${formatServiceDay(session.service.date)} · ${formatTime(session.start_time)}` : ''
  const thread = (commentsQuery.data ?? []).filter((c) => c.block_id === null)
  const notesOn = (blockId: string) => (commentsQuery.data ?? []).filter((c) => c.block_id === blockId)

  return (
    <div>
      <PageHeader
        eyebrow={
          <Link to="/stage" className="hover:underline">
            ‹ Stage layouts
          </Link>
        }
        title={title}
        description={
          session ? (
            <>
              {session.service.service_type} · {when}
              {finished && (
                <>
                  {' '}
                  <Pill tone="neutral">Record</Pill>
                </>
              )}
            </>
          ) : undefined
        }
      />
      <Lifespan page="stage" className="mb-4" />

      <QueryState isLoading={sessionQuery.isLoading || layoutQuery.isLoading} error={sessionQuery.error ?? layoutQuery.error}>
        {/* What can be done, in the order somebody reaches for it. */}
        <div className="mb-3 flex flex-wrap items-center gap-2" data-tour="stage-tools">
          {canAdd && (
            <ActionButton size="sm" onClick={() => setPanel(panel === 'add' ? null : 'add')}>
              + Add block
            </ActionButton>
          )}
          {(canEdit || templatesMayBeRead(may('templates'))) && (
            <ActionButton size="sm" tone="quiet" onClick={() => setPanel(panel === 'templates' ? null : 'templates')}>
              Templates
            </ActionButton>
          )}
          <ActionButton size="sm" tone="quiet" onClick={() => setPanel(panel === 'comments' ? null : 'comments')}>
            Comments{thread.length > 0 ? ` (${thread.length})` : ''}
          </ActionButton>
          {layout && (
            <ActionButton size="sm" tone="quiet" onClick={() => setPanel(panel === 'history' ? null : 'history')}>
              History
            </ActionButton>
          )}
          {canDelete && blocks.length > 0 && (
            <ActionButton
              size="sm"
              tone="danger-quiet"
              className="ml-auto"
              onClick={() =>
                ask({
                  title: 'Clear the whole stage?',
                  body: `Every block comes off — ${blocks.length} of them. Templates are not touched.`,
                  confirmLabel: 'Clear',
                  onConfirm: () => clear.mutate(),
                })
              }
            >
              Clear
            </ActionButton>
          )}
        </div>

        {error && (
          <p role="alert" className="mb-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
            {error}
          </p>
        )}

        {!layout && !canAdd && !canEdit && (
          <p className="mb-3 text-body-sm text-on-surface-variant">
            {finished ? 'Nothing was drawn for this session.' : 'Nothing drawn yet.'}
          </p>
        )}

        <StageCanvas
          stage={stage}
          blocks={blocks}
          selectedId={selectedId}
          onSelect={setSelectedId}
          canEdit={canEdit}
          onCommit={onCommit}
          onDelete={canDelete ? (id) => { const b = blocks.find((x) => x.id === id); if (b) confirmDelete(b) } : undefined}
        />
        {blocks.length === 0 && layoutQuery.isSuccess && (
          <p className="mt-2 text-center text-label-md text-on-surface-faint">
            {canAdd ? 'An empty stage. Add a block, or start from a template.' : 'An empty stage.'}
          </p>
        )}
        {canEdit && blocks.length > 0 && (
          <p className="mt-2 text-center text-label-md text-on-surface-faint">
            Drag to move · pull the corner to resize · pinch or scroll to zoom
          </p>
        )}

        {selected && (
          <BlockInspector
            key={selected.id}
            block={selected}
            canEdit={canEdit}
            canDelete={canDelete}
            canComment={canComment}
            people={peopleQuery.data ?? []}
            notes={notesOn(selected.id)}
            myId={myId}
            onChange={(changes) => patch.mutate({ id: selected.id, changes })}
            onDelete={() => confirmDelete(selected)}
            onNote={(body) => comment.mutate({ body, blockId: selected.id })}
            onDeleteNote={(id) => uncomment.mutate(id)}
            onFront={() => patch.mutate({ id: selected.id, changes: { z: blocks.reduce((m, b) => Math.max(m, b.z), 0) + 1 } })}
          />
        )}

        {panel === 'add' && (
          <AddBlockSheet onClose={() => setPanel(null)} onAdd={(label) => add.mutate(label)} busy={add.isPending} />
        )}
        {panel === 'templates' && (
          <TemplatesSheet
            onClose={() => setPanel(null)}
            templates={templatesQuery.data ?? []}
            loading={templatesQuery.isLoading}
            canApply={canEdit}
            canKeep={canEdit && blocks.length > 0}
            keepsDirectly={may('templates')}
            hasBlocks={blocks.length > 0}
            onApply={(id, name) =>
              blocks.length > 0
                ? ask({
                    title: `Apply ${name}?`,
                    body: `It replaces the ${blocks.length} ${blocks.length === 1 ? 'block' : 'blocks'} on this stage.`,
                    confirmLabel: 'Apply',
                    onConfirm: () => apply.mutate(id),
                  })
                : apply.mutate(id)
            }
            onKeep={(name) => keep.mutate(name)}
            busy={apply.isPending || keep.isPending}
          />
        )}
        {panel === 'comments' && (
          <Tile className="mt-4">
            <h2 className="text-body-lg font-semibold text-on-surface">Comments</h2>
            <p className="mt-0.5 text-body-sm text-on-surface-variant">About this stage as a whole. A note about one block is pinned to it instead — tap the block.</p>
            <CommentList
              comments={thread}
              myId={myId}
              canDelete={canDelete}
              onDelete={(id) => uncomment.mutate(id)}
              empty="Nothing said yet."
            />
            {canComment && layout && <CommentForm onSend={(body) => comment.mutate({ body, blockId: null })} busy={comment.isPending} />}
            {canComment && !layout && <p className="mt-3 text-label-md text-on-surface-faint">Add a block first; the thread belongs to the drawing.</p>}
          </Tile>
        )}
        {panel === 'history' && layout && (
          <Tile className="mt-4">
            <h2 className="text-body-lg font-semibold text-on-surface">History</h2>
            <p className="mt-0.5 text-body-sm text-on-surface-variant">Every change to this stage, newest first. Written by the database, so it cannot be tidied.</p>
            <QueryState isLoading={logQuery.isLoading} error={logQuery.error} isEmpty={(logQuery.data ?? []).length === 0} emptyMessage="Nothing has happened yet.">
              <ol className="mt-3 flex flex-col">
                {(logQuery.data ?? []).map((line) => (
                  <li key={line.id} className="flex items-baseline justify-between gap-3 border-b border-border-subtle py-2.5 last:border-0">
                    <span className="text-body-sm text-on-surface">{logSentence(line)}</span>
                    <span className="shrink-0 font-mono text-label-sm text-on-surface-faint" title={new Date(line.at).toLocaleString()}>
                      {formatRelativeTime(line.at)}
                    </span>
                  </li>
                ))}
              </ol>
            </QueryState>
          </Tile>
        )}
      </QueryState>
      {dialog}
    </div>
  )
}

/** The Templates button shows for anybody who may apply one; the library is readable by all, but a list you cannot use is noise. */
function templatesMayBeRead(keeps: boolean) {
  return keeps
}

function BlockInspector({
  block,
  canEdit,
  canDelete,
  canComment,
  people,
  notes,
  myId,
  onChange,
  onDelete,
  onNote,
  onDeleteNote,
  onFront,
}: {
  block: StageBlock
  canEdit: boolean
  canDelete: boolean
  canComment: boolean
  people: { id: string; first_name: string; last_name: string }[]
  notes: { id: string; body: string; author: string | null; created_at: string; writer?: { first_name: string; last_name: string } | null }[]
  myId: string
  onChange: (changes: BlockPatch) => void
  onDelete: () => void
  onNote: (body: string) => void
  onDeleteNote: (id: string) => void
  onFront: () => void
}) {
  const [label, setLabel] = useState(block.label)
  const commitLabel = () => {
    const next = label.trim().slice(0, 40)
    if (next && next !== block.label) onChange({ label: next })
    else setLabel(block.label)
  }

  return (
    <Tile className="mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {canEdit ? (
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={commitLabel}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
              maxLength={40}
              aria-label="Block name"
              className={`${inputClasses} text-body-lg font-semibold`}
            />
          ) : (
            <h2 className="text-body-lg font-semibold text-on-surface">{block.label}</h2>
          )}
          <p className="mt-1.5 text-label-md text-on-surface-variant">
            Placed by <span className="text-on-surface">{stampText(block.placer, block.placed_at)}</span>
            {block.updated_at !== block.placed_at && (
              <>
                {' '}· last changed by <span className="text-on-surface">{stampText(block.updater, block.updated_at)}</span>
              </>
            )}
          </p>
        </div>
        {canDelete && (
          <ActionButton size="sm" tone="danger-quiet" onClick={onDelete}>
            Remove
          </ActionButton>
        )}
      </div>

      {canEdit && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-body-sm text-on-surface-variant">
            Who is on it
            <Select
              value={block.person_id ?? ''}
              onChange={(v) => onChange({ person_id: v || null })}
              aria-label="Who is on this block"
              placeholder="Nobody yet"
              className={triggerClasses}
              options={[
                { value: '', label: 'Nobody' },
                ...people.map((p) => ({ value: p.id, label: `${p.first_name} ${p.last_name}` })),
              ]}
            />
          </label>
          <div className="flex flex-col gap-1.5 text-body-sm text-on-surface-variant">
            Colour
            <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-2">
              {BLOCK_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  role="radio"
                  aria-checked={block.color.toUpperCase() === c.hex}
                  aria-label={c.name}
                  onClick={() => onChange({ color: c.hex })}
                  className={`tap h-8 w-8 rounded-full transition-transform ${block.color.toUpperCase() === c.hex ? 'scale-110 ring-2 ring-primary ring-offset-2 ring-offset-surface-lowest' : ''}`}
                  style={{ background: c.hex }}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <ActionButton size="sm" tone="quiet" onClick={() => onChange({ rotation: ((block.rotation + 90 + 180) % 360) - 180 })}>
              Turn 90°
            </ActionButton>
            <ActionButton size="sm" tone="quiet" onClick={onFront}>
              Bring to front
            </ActionButton>
            <span className="ml-auto font-mono text-label-sm text-on-surface-faint">
              {Math.round(block.w)} × {Math.round(block.h)}
            </span>
          </div>
        </div>
      )}
      {!canEdit && block.person && (
        <p className="mt-3 text-body-sm text-on-surface">{personName(block.person)}</p>
      )}

      <div className="mt-5">
        <h3 className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">Notes on this block</h3>
        <CommentList comments={notes} myId={myId} canDelete={canDelete} onDelete={onDeleteNote} empty="No notes pinned here." />
        {canComment && <CommentForm onSend={onNote} busy={false} placeholder="e.g. needs a second DI box" />}
      </div>
    </Tile>
  )
}

function CommentList({
  comments,
  myId,
  canDelete,
  onDelete,
  empty,
}: {
  comments: { id: string; body: string; author: string | null; created_at: string; writer?: { first_name: string; last_name: string } | null }[]
  myId: string
  canDelete: boolean
  onDelete: (id: string) => void
  empty: string
}) {
  if (comments.length === 0) return <p className="mt-2 text-label-md text-on-surface-faint">{empty}</p>
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {comments.map((c) => (
        <li key={c.id} className="rounded-[var(--radius-chip)] bg-raised px-3 py-2.5">
          <p className="whitespace-pre-wrap break-words text-body-sm text-on-surface">{c.body}</p>
          <p className="mt-1 flex items-center gap-2 font-mono text-label-sm text-on-surface-faint">
            {personName(c.writer)} · {formatRelativeTime(c.created_at)}
            {(c.author === myId || canDelete) && (
              <button type="button" onClick={() => onDelete(c.id)} className="tap ml-auto text-label-sm text-on-surface-faint hover:text-error">
                Delete
              </button>
            )}
          </p>
        </li>
      ))}
    </ul>
  )
}

function CommentForm({ onSend, busy, placeholder = 'Say something about the stage' }: { onSend: (body: string) => void; busy: boolean; placeholder?: string }) {
  const [body, setBody] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!body.trim()) return
    onSend(body.trim())
    setBody('')
  }
  return (
    <form onSubmit={submit} className="mt-3 flex items-start gap-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={500}
        rows={2}
        aria-label={placeholder}
        placeholder={placeholder}
        className={`${inputClasses} min-w-0 flex-1 py-2 text-body-sm`}
      />
      <ActionButton type="submit" size="sm" disabled={busy || !body.trim()}>
        Post
      </ActionButton>
    </form>
  )
}

function AddBlockSheet({ onClose, onAdd, busy }: { onClose: () => void; onAdd: (label: string) => void; busy: boolean }) {
  const [custom, setCustom] = useState('')
  return (
    <Overlay onDismiss={onClose} label="Add a block" align="sheet">
      <div className="w-full max-w-md rounded-t-[var(--radius-shell)] bg-surface-lowest p-5 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 sm:rounded-[var(--radius-shell)] dark:ring-white/12">
        <h2 className="text-headline-sm">Add a block</h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">It lands in the first free spot; drag it where it goes.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {QUICK_BLOCKS.map((name) => (
            <button
              key={name}
              type="button"
              disabled={busy}
              onClick={() => onAdd(name)}
              className="tap rounded-full bg-raised px-3.5 py-2 text-body-sm text-on-surface hairline hover:bg-raised-strong disabled:opacity-50"
            >
              {name}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (custom.trim()) onAdd(custom)
          }}
          className="mt-4 flex gap-2"
        >
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            maxLength={40}
            placeholder="Something else…"
            aria-label="Block name"
            className={`${inputClasses} min-w-0 flex-1`}
          />
          <ActionButton type="submit" disabled={busy || !custom.trim()}>
            Add
          </ActionButton>
        </form>
      </div>
    </Overlay>
  )
}

function TemplatesSheet({
  onClose,
  templates,
  loading,
  canApply,
  canKeep,
  keepsDirectly,
  hasBlocks,
  onApply,
  onKeep,
  busy,
}: {
  onClose: () => void
  templates: { id: string; name: string; blocks: unknown[]; updated_at: string }[]
  loading: boolean
  canApply: boolean
  canKeep: boolean
  keepsDirectly: boolean
  hasBlocks: boolean
  onApply: (id: string, name: string) => void
  onKeep: (name: string) => void
  busy: boolean
}) {
  const [name, setName] = useState('')
  return (
    <Overlay onDismiss={onClose} label="Templates" align="sheet">
      <div className="w-full max-w-md rounded-t-[var(--radius-shell)] bg-surface-lowest p-5 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 sm:rounded-[var(--radius-shell)] dark:ring-white/12">
        <h2 className="text-headline-sm">Templates</h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">A layout kept for next time: the blocks and where they go, not who is on them.</p>
        {loading ? (
          <p className="mt-3 text-body-sm text-on-surface-variant">Loading…</p>
        ) : templates.length === 0 ? (
          <p className="mt-3 text-body-sm text-on-surface-variant">No templates yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center gap-3 rounded-[var(--radius-row)] bg-raised px-3.5 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-body-sm font-medium text-on-surface">{t.name}</span>
                  <span className="block font-mono text-label-sm text-on-surface-faint">
                    {t.blocks.length} {t.blocks.length === 1 ? 'block' : 'blocks'}
                  </span>
                </span>
                {canApply && (
                  <ActionButton size="sm" tone="quiet" disabled={busy} onClick={() => onApply(t.id, t.name)}>
                    Apply
                  </ActionButton>
                )}
              </li>
            ))}
          </ul>
        )}
        {canKeep && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (name.trim()) onKeep(name.trim())
            }}
            className="mt-5 border-t border-border-subtle pt-4"
          >
            <h3 className="text-body-sm font-medium text-on-surface">Keep this stage as a template</h3>
            <p className="mt-0.5 text-label-md text-on-surface-variant">
              {keepsDirectly ? 'It goes straight into the library.' : 'It is sent to an Admin, and appears here once they approve it.'}
            </p>
            <div className="mt-2 flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                placeholder="e.g. Full band"
                aria-label="Template name"
                className={`${inputClasses} min-w-0 flex-1`}
              />
              <ActionButton type="submit" disabled={busy || !name.trim() || !hasBlocks}>
                {keepsDirectly ? 'Save' : 'Ask'}
              </ActionButton>
            </div>
          </form>
        )}
      </div>
    </Overlay>
  )
}
