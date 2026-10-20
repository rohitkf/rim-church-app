import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { ActionButton, Overlay, PageHeader, Pill, SegmentedControl, Tile, inputClasses } from '../components/Surface'
import { Select, triggerClasses } from '../components/Select'
import { QueryState } from '../components/QueryState'
import { Lifespan } from '../components/Lifespan'
import { StageCanvas, type BlockBox } from '../components/StageCanvas'
import { useConfirmAction } from '../components/ConfirmAction'
import { ExportSheetDialog } from '../components/ExportSheetDialog'
import { stageSheetPage, type StageSheet } from '../lib/stageSheet'
import { useErrorText } from '../lib/useErrorText'
import { showToast } from '../lib/toast'
import { formatServiceDay } from '../lib/sunday'
import { formatRelativeTime } from '../lib/relativeTime'
import { useFinishedServices } from '../lib/useFinishedServices'
import { useStageAccess } from '../lib/useStageAccess'
import { STAGE_ICONS } from '../lib/stageIcons'
import {
  BLOCK_COLORS,
  DEFAULT_ITEM,
  DEFAULT_SEATS,
  SEAT_PITCH,
  STAGE_KEY,
  addStageBlock,
  addStageComment,
  applyStageTemplate,
  clearStageLayout,
  deleteStageBlock,
  deleteStageTemplate,
  renameStageTemplate,
  restoreStageBlocks,
  deleteStageComment,
  ensureStageLayout,
  fetchStageBlocks,
  fetchStageComments,
  fetchStageAreas,
  fetchStageLayout,
  fetchStageLog,
  fetchStageMoveRequests,
  lockStageBlock,
  requestStageMove,
  decideStageMove,
  withdrawStageMove,
  fetchStageTemplates,
  logSentence,
  personName,
  placeNewBlock,
  duplicateOf,
  quickBlocksFor,
  regionsOf,
  saveStageTemplate,
  stampText,
  updateStageBlock,
  type BlockPatch,
  type StageArea,
  type StageBlock,
  type StageMoveRequest,
} from '../lib/stage'
import { UNDO_DEPTH, describeChange, inverseOf, isEmptyPatch, resolveId, snapshotOf } from '../lib/stageUndo'

/**
 * One service's layout: the canvas — every area as a region of one
 * workspace — and everything around it.
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

const serviceRowSchema = z.object({ id: z.string(), date: z.string(), service_type: z.string() })

async function fetchService(id: string) {
  const { data, error } = await supabase.from('services').select('id, date, service_type').eq('id', id).single()
  if (error) throw error
  return serviceRowSchema.parse(data)
}

const personSchema = z.object({ id: z.string(), first_name: z.string(), last_name: z.string() })

async function fetchPeople() {
  const { data, error } = await supabase.from('profiles').select('id, first_name, last_name').order('first_name')
  if (error) throw error
  return z.array(personSchema).parse(data ?? [])
}

type Panel = 'add' | 'templates' | 'comments' | 'history' | 'export' | null

/** One step back: what the Undo button says, and the opposite change that does it. */
interface UndoStep {
  label: string
  run: () => Promise<void>
}

export function StageLayoutPage() {
  const { serviceId = '' } = useParams()
  const { session: auth, isAdmin } = useAuth()
  const myId = auth?.user.id ?? ''
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const { ask, dialog } = useConfirmAction()
  const { may } = useStageAccess()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel>(null)
  const [error, setError] = useState<string | null>(null)
  /** A locked block being dragged to where somebody would like it. */
  const [proposing, setProposing] = useState<string | null>(null)
  /** Dropped: now the word why, before the ask goes. */
  const [proposal, setProposal] = useState<{ id: string; box: BlockBox } | null>(null)

  const serviceQuery = useQuery({ queryKey: ['service', 'stage', serviceId], queryFn: () => fetchService(serviceId), enabled: !!serviceId })
  const service = serviceQuery.data
  const { isFinished } = useFinishedServices(service ? [service.id] : [])
  const finished = !!service && isFinished(service.id)

  const areasQuery = useQuery({ queryKey: [...STAGE_KEY, 'areas'], queryFn: fetchStageAreas })
  const areas = useMemo(() => areasQuery.data ?? [], [areasQuery.data])
  const regions = useMemo(() => regionsOf(areas), [areas])
  const layoutQuery = useQuery({ queryKey: [...STAGE_KEY, 'layout', serviceId], queryFn: () => fetchStageLayout(serviceId), enabled: !!serviceId })
  const layout = layoutQuery.data ?? null
  const layoutId = layout?.id ?? ''
  const blocksQuery = useQuery({ queryKey: [...STAGE_KEY, 'blocks', layoutId], queryFn: () => fetchStageBlocks(layoutId), enabled: !!layoutId })
  const blocks = useMemo(() => blocksQuery.data ?? [], [blocksQuery.data])
  const commentsQuery = useQuery({ queryKey: [...STAGE_KEY, 'comments', layoutId], queryFn: () => fetchStageComments(layoutId), enabled: !!layoutId })
  const asksQuery = useQuery({ queryKey: [...STAGE_KEY, 'asks', layoutId], queryFn: () => fetchStageMoveRequests(layoutId), enabled: !!layoutId })
  const logQuery = useQuery({ queryKey: [...STAGE_KEY, 'log', layoutId], queryFn: () => fetchStageLog(layoutId), enabled: !!layoutId && panel === 'history' })
  const templatesQuery = useQuery({ queryKey: [...STAGE_KEY, 'templates'], queryFn: fetchStageTemplates, enabled: panel === 'templates' })
  const peopleQuery = useQuery({ queryKey: [...STAGE_KEY, 'people'], queryFn: fetchPeople, enabled: !!selectedId })

  const canAdd = !finished && may('add')
  const canEdit = !finished && may('edit')
  const canDelete = !finished && may('delete')
  const canComment = !finished && may('comment')
  const selected = blocks.find((b) => b.id === selectedId) ?? null

  // A block somebody else just removed is simply no longer selected:
  // `selected` is looked up fresh on every render.

  const invalidate = () => queryClient.invalidateQueries({ queryKey: STAGE_KEY })
  const fail = (fallback: string) => (err: unknown) => setError(errorText(err, fallback))

  /*
   * Undo, for what this person did on this stage since opening it.
   *
   * Every change is written as it is made, so a step back is the opposite
   * change, written and logged like any other — the history keeps both
   * lines. A block an undo puts back is a new row, so `aliases` follows
   * each old id to the block that now stands for it, and earlier steps
   * about that block still find it. The stack is this page's alone: it
   * goes when the page does, and never undoes anybody else's work.
   */
  const [undoStack, setUndoStack] = useState<UndoStep[]>([])
  const aliases = useRef(new Map<string, string>())
  useEffect(() => {
    setUndoStack([])
    aliases.current = new Map()
  }, [serviceId])
  const remember = (step: UndoStep) => setUndoStack((stack) => [...stack.slice(-(UNDO_DEPTH - 1)), step])
  /** The block as the page last saw it, after following it through any undo. */
  const current = (id: string) =>
    (queryClient.getQueryData<StageBlock[]>([...STAGE_KEY, 'blocks', layoutId]) ?? []).find(
      (b) => b.id === resolveId(aliases.current, id),
    )
  /** An undo that touches a block must find it, and find it unlocked: the database would refuse it silently. */
  const mustTouch = (id: string) => {
    const b = current(id)
    if (!b) throw new Error('That block is no longer on the stage.')
    if (b.locked_at) throw new Error(`${b.label} is locked now — unlock it first.`)
    return b
  }
  const putBack = async (layout: string, before: StageBlock[]) => {
    const made = await restoreStageBlocks(layout, before.map(snapshotOf))
    before.forEach((b, i) => {
      if (made[i]) aliases.current.set(b.id, made[i].id)
    })
  }

  /** The layout row, made on the first stroke. */
  const layoutFor = async () => {
    if (layout) return layout
    if (!service) throw new Error('The service has not loaded yet.')
    const made = await ensureStageLayout(service.id)
    await queryClient.invalidateQueries({ queryKey: [...STAGE_KEY, 'layout', serviceId] })
    return made
  }

  const add = useMutation({
    mutationFn: async (what: { label: string; areaId: string; seats?: number; icon?: string }) => {
      const lay = await layoutFor()
      const region = regions.find((r) => r.area.id === what.areaId) ?? regions[0]
      if (!region) throw new Error('There are no areas to lay out.')
      const size = what.seats
        ? { w: Math.min(region.width - 80, what.seats * SEAT_PITCH + 16), h: 90 }
        : what.icon
          ? DEFAULT_ITEM
          : undefined
      const at = placeNewBlock(blocks.filter((b) => b.area_id === region.area.id), { width: region.width, height: region.height }, size)
      const z = blocks.reduce((m, b) => Math.max(m, b.z), 0) + 1
      return addStageBlock(lay.id, {
        area_id: region.area.id,
        label: what.label.trim(),
        ...at,
        ...size,
        z,
        ...(what.seats ? { kind: 'seats' as const, seats: what.seats } : {}),
        ...(what.icon ? { kind: 'item' as const, icon: what.icon } : {}),
      })
    },
    onSuccess: (block) => {
      setError(null)
      setPanel(null)
      setSelectedId(block.id)
      remember({ label: `add ${block.label}`, run: async () => deleteStageBlock(mustTouch(block.id).id) })
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

  const duplicate = useMutation({
    mutationFn: async (source: StageBlock) => {
      const region = regions.find((r) => r.area.id === source.area_id) ?? regions[0]
      if (!region) throw new Error('There are no areas to lay out.')
      const z = blocks.reduce((m, b) => Math.max(m, b.z), 0) + 1
      return addStageBlock(source.layout_id, duplicateOf(source, { width: region.width, height: region.height }, z))
    },
    onSuccess: (made) => {
      setError(null)
      setSelectedId(made.id)
      remember({ label: `copy of ${made.label}`, run: async () => deleteStageBlock(mustTouch(made.id).id) })
      return invalidate()
    },
    onError: fail('Could not copy the block.'),
  })

  const remove = useMutation({
    mutationFn: (block: StageBlock) => deleteStageBlock(block.id),
    onSuccess: (_r, block) => {
      setSelectedId(null)
      remember({ label: `remove ${block.label}`, run: () => putBack(block.layout_id, [block]) })
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

  const lock = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => lockStageBlock(id, on),
    onSuccess: (_r, { on }) => {
      showToast(on ? 'Locked — nobody moves it until it is unlocked' : 'Unlocked')
      return invalidate()
    },
    onError: fail('Could not change the lock.'),
  })
  const askMove = useMutation({
    mutationFn: ({ id, box, note }: { id: string; box: BlockBox; note: string }) => requestStageMove(id, box, note),
    onSuccess: () => {
      setProposal(null)
      setProposing(null)
      showToast('Sent to an Admin')
      return invalidate()
    },
    onError: fail('Could not send the ask.'),
  })
  const decideMove = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => decideStageMove(id, approve),
    onSuccess: (_r, { approve }) => {
      showToast(approve ? 'Moved' : 'Declined')
      return invalidate()
    },
    onError: fail('Could not answer that.'),
  })
  const withdrawMove = useMutation({
    mutationFn: withdrawStageMove,
    onSuccess: () => invalidate(),
    onError: fail('Could not take that back.'),
  })

  const clear = useMutation({
    mutationFn: (_before: StageBlock[]) => clearStageLayout(serviceId),
    onSuccess: (_r, before) => {
      setSelectedId(null)
      showToast('Stage cleared')
      if (before.length > 0) remember({ label: 'clear the stage', run: () => putBack(before[0].layout_id, before) })
      return invalidate()
    },
    onError: fail('Could not clear the stage.'),
  })

  const apply = useMutation({
    mutationFn: ({ id }: { id: string; name: string; before: StageBlock[] }) => applyStageTemplate(serviceId, id),
    onSuccess: (_r, { name, before }) => {
      setPanel(null)
      setSelectedId(null)
      showToast('Template applied')
      // Back to the stage as it was: the template's blocks off, the old ones on.
      remember({
        label: `apply ${name}`,
        run: async () => {
          await clearStageLayout(serviceId)
          if (before.length > 0) await putBack(before[0].layout_id, before)
        },
      })
      return invalidate()
    },
    onError: fail('Could not apply the template.'),
  })

  const keep = useMutation({
    mutationFn: (name: string) => saveStageTemplate(serviceId, name),
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
      onConfirm: () => remove.mutate(block),
    })

  /** Every change to a block goes through here, so each one can be stepped back. */
  const edit = (id: string, changes: BlockPatch) => {
    const b = blocks.find((x) => x.id === id)
    if (b) {
      const back = inverseOf(b, changes)
      if (!isEmptyPatch(back)) {
        remember({ label: describeChange(b.label, changes), run: async () => updateStageBlock(mustTouch(id).id, back) })
      }
    }
    patch.mutate({ id, changes })
  }
  const onCommit = (id: string, box: BlockBox) => edit(id, box)

  const undo = useMutation({
    mutationFn: (step: UndoStep) => step.run(),
    onSuccess: (_r, step) => {
      setError(null)
      showToast(`Undone: ${step.label}`)
    },
    onError: fail('Could not undo that.'),
    onSettled: () => invalidate(),
  })
  const canUndo = !finished && undoStack.length > 0 && !undo.isPending
  const stepBack = () => {
    const step = undoStack[undoStack.length - 1]
    if (!step || finished || undo.isPending) return
    setUndoStack((stack) => stack.slice(0, -1))
    undo.mutate(step)
  }
  // Ctrl/Cmd+Z anywhere on the page, except while typing: there it is the field's own undo.
  const stepBackRef = useRef(stepBack)
  stepBackRef.current = stepBack
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return
      e.preventDefault()
      stepBackRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const renameTemplate = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameStageTemplate(id, name),
    onSuccess: () => {
      showToast('Template renamed')
      return invalidate()
    },
    onError: fail('Could not rename the template.'),
  })
  const removeTemplate = useMutation({
    mutationFn: (id: string) => deleteStageTemplate(id),
    onSuccess: () => {
      showToast('Template deleted')
      return invalidate()
    },
    onError: fail('Could not delete the template.'),
  })

  const title = service ? service.service_type : 'Stage Layout'
  const when = service ? formatServiceDay(service.date) : ''
  const thread = (commentsQuery.data ?? []).filter((c) => c.block_id === null)

  // The drawing as a sheet: what is on the stage, the way the page shows it.
  const sheet = (): StageSheet => {
    const last = [...blocks].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
    return {
      title,
      subtitle: when,
      regions: regions.map((r) => ({ name: r.area.name, top: r.top, left: r.left, width: r.width, height: r.height, topLabel: r.area.top_label, bottomLabel: r.area.bottom_label })),
      blocks: blocks.map((b) => ({
        area_id: areas.find((a) => a.id === b.area_id)?.name ?? '',
        label: b.label,
        person: b.person ? personName(b.person) : null,
        color: b.color,
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
        rotation: b.rotation,
        kind: b.kind,
        corners: b.corners,
        icon: b.icon,
        seats: b.seats,
      })),
      footer: `${blocks.length} ${blocks.length === 1 ? 'block' : 'blocks'}${last ? ` · last changed by ${stampText(last.updater, last.updated_at)}` : ''} · exported ${new Date().toLocaleDateString()}`,
    }
  }
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
          service ? (
            <>
              {when}
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

      <QueryState isLoading={serviceQuery.isLoading || layoutQuery.isLoading || areasQuery.isLoading} error={serviceQuery.error ?? layoutQuery.error ?? areasQuery.error}>
        {areasQuery.isSuccess && areas.length === 0 && (
          <p className="mb-3 text-body-sm text-on-surface-variant">No areas to lay out yet. An Admin names them in Settings › Stage Layout.</p>
        )}
        {/* What can be done, in the order somebody reaches for it. */}
        <div className="mb-3 flex flex-wrap items-center gap-2" data-tour="stage-tools">
          {canAdd && (
            <ActionButton size="sm" onClick={() => setPanel(panel === 'add' ? null : 'add')}>
              + Add block
            </ActionButton>
          )}
          {!finished && undoStack.length > 0 && (
            <ActionButton
              size="sm"
              tone="quiet"
              disabled={!canUndo}
              onClick={stepBack}
              aria-label={`Undo ${undoStack[undoStack.length - 1].label}`}
              title={`Undo ${undoStack[undoStack.length - 1].label} (Ctrl+Z)`}
            >
              ↶ Undo
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
          {blocks.length > 0 && (
            <ActionButton size="sm" tone="quiet" onClick={() => setPanel('export')}>
              Export
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
                  onConfirm: () => clear.mutate(blocks),
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
          regions={regions}
          blocks={blocks}
          selectedId={selectedId}
          onSelect={setSelectedId}
          canEdit={canEdit}
          canMove={(b) => !b.locked_at}
          onRefused={(id) => {
            const b = blocks.find((x) => x.id === id)
            if (!b?.locked_at) return
            showToast(isAdmin ? 'Locked — unlock it first' : 'Locked — ask an Admin, or propose a move')
          }}
          proposing={proposing}
          onPropose={(id, box) => setProposal({ id, box })}
          onCommit={onCommit}
          onDelete={canDelete ? (id) => { const b = blocks.find((x) => x.id === id); if (b && !b.locked_at) confirmDelete(b) } : undefined}
          onDuplicate={canAdd ? (id) => { const b = blocks.find((x) => x.id === id); if (b) duplicate.mutate(b) } : undefined}
        />
        {proposing && (
          <p role="status" className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-label-md text-accent-blue-soft">
            Drag {blocks.find((b) => b.id === proposing)?.label ?? 'it'} to where it should go — the drop sends an ask, nothing moves yet.
            <button type="button" onClick={() => setProposing(null)} className="tap text-on-surface-faint hover:text-on-surface">
              Cancel
            </button>
          </p>
        )}
        {blocks.length === 0 && layoutQuery.isSuccess && (
          <p className="mt-2 text-center text-label-md text-on-surface-faint">
            {canAdd ? 'Nothing drawn yet. Add a block, or start from a template.' : 'Nothing drawn yet.'}
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
            canEdit={canEdit && !selected.locked_at}
            canDelete={canDelete && !selected.locked_at}
            canDuplicate={canAdd}
            canComment={canComment}
            isAdmin={isAdmin && !finished}
            mayAsk={canEdit && !!selected.locked_at && !isAdmin}
            asks={(asksQuery.data ?? []).filter((r) => r.block_id === selected.id)}
            onLock={(on) => lock.mutate({ id: selected.id, on })}
            onAsk={() => setProposing(selected.id)}
            onDecide={(id, approve) => decideMove.mutate({ id, approve })}
            onWithdraw={(id) => withdrawMove.mutate(id)}
            people={peopleQuery.data ?? []}
            notes={notesOn(selected.id)}
            myId={myId}
            onChange={(changes) => edit(selected.id, changes)}
            onDelete={() => confirmDelete(selected)}
            onNote={(body) => comment.mutate({ body, blockId: selected.id })}
            onDeleteNote={(id) => uncomment.mutate(id)}
            onFront={() => edit(selected.id, { z: blocks.reduce((m, b) => Math.max(m, b.z), 0) + 1 })}
            onDuplicate={() => duplicate.mutate(selected)}
          />
        )}

        {proposal && (
          <ProposalSheet
            label={blocks.find((b) => b.id === proposal.id)?.label ?? 'the block'}
            busy={askMove.isPending}
            onSend={(note) => askMove.mutate({ id: proposal.id, box: proposal.box, note })}
            onClose={() => setProposal(null)}
          />
        )}
        {panel === 'export' && service && (
          <ExportSheetDialog
            title="Export this layout"
            blurb={`${title} · ${when} · ${blocks.length} ${blocks.length === 1 ? 'block' : 'blocks'}`}
            stem={`${service.date}-${service.service_type}-layout`}
            build={(theme) => stageSheetPage(sheet(), theme)}
            onClose={() => setPanel(null)}
          />
        )}
        {panel === 'add' && (
          <AddBlockSheet
            onClose={() => setPanel(null)}
            areas={areas}
            startIn={selected?.area_id ?? areas[0]?.id ?? ''}
            onAdd={(label, areaId, seats, icon) => add.mutate({ label, areaId, seats, icon })}
            busy={add.isPending}
          />
        )}
        {panel === 'templates' && (
          <TemplatesSheet
            onClose={() => setPanel(null)}
            templates={templatesQuery.data ?? []}
            loading={templatesQuery.isLoading}
            canApply={canEdit}
            canKeep={canEdit && blocks.length > 0}
            keepsDirectly={may('templates')}
            canManage={may('templates')}
            onRename={(id, name) => renameTemplate.mutate({ id, name })}
            onDelete={(id, name) =>
              ask({
                title: `Delete the template ${name}?`,
                body: 'It goes from the library for everybody. Stages it was applied to keep their blocks.',
                confirmLabel: 'Delete',
                onConfirm: () => removeTemplate.mutate(id),
              })
            }
            hasBlocks={blocks.length > 0}
            onApply={(id, name) =>
              blocks.length > 0
                ? ask({
                    title: `Apply ${name}?`,
                    body: `It replaces the ${blocks.length} ${blocks.length === 1 ? 'block' : 'blocks'} on this stage.`,
                    confirmLabel: 'Apply',
                    onConfirm: () => apply.mutate({ id, name, before: blocks }),
                  })
                : apply.mutate({ id, name, before: blocks })
            }
            onKeep={(name) => keep.mutate(name)}
            busy={apply.isPending || keep.isPending}
          />
        )}
        {panel === 'comments' && (
          <Tile className="mt-4">
            <h2 className="text-body-lg font-semibold text-on-surface">Comments</h2>
            <p className="mt-0.5 text-body-sm text-on-surface-variant">About the layout as a whole. A note about one block is pinned to it instead — tap the block.</p>
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
  canDuplicate,
  canComment,
  isAdmin,
  mayAsk,
  asks,
  onLock,
  onAsk,
  onDecide,
  onWithdraw,
  people,
  notes,
  myId,
  onChange,
  onDelete,
  onNote,
  onDeleteNote,
  onFront,
  onDuplicate,
}: {
  block: StageBlock
  canEdit: boolean
  canDelete: boolean
  /** May add blocks, so may add a copy of this one. */
  canDuplicate: boolean
  canComment: boolean
  /** May lock and unlock, and answer asks. */
  isAdmin: boolean
  /** May edit the layout but not this locked block: may ask instead. */
  mayAsk: boolean
  asks: StageMoveRequest[]
  onLock: (on: boolean) => void
  onAsk: () => void
  onDecide: (id: string, approve: boolean) => void
  onWithdraw: (id: string) => void
  people: { id: string; first_name: string; last_name: string }[]
  notes: { id: string; body: string; author: string | null; created_at: string; writer?: { first_name: string; last_name: string } | null }[]
  myId: string
  onChange: (changes: BlockPatch) => void
  onDelete: () => void
  onNote: (body: string) => void
  onDeleteNote: (id: string) => void
  onFront: () => void
  onDuplicate: () => void
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
        <div className="flex shrink-0 items-center gap-2">
          {isAdmin && (
            <ActionButton size="sm" tone="quiet" onClick={() => onLock(!block.locked_at)}>
              {block.locked_at ? 'Unlock' : 'Lock'}
            </ActionButton>
          )}
          {canDelete && (
            <ActionButton size="sm" tone="danger-quiet" onClick={onDelete}>
              Remove
            </ActionButton>
          )}
        </div>
      </div>

      {block.locked_at && (
        <p className="mt-3 rounded-[var(--radius-chip)] bg-[color-mix(in_oklab,var(--color-accent-orange)_14%,transparent)] px-3.5 py-2.5 text-body-sm text-on-surface">
          <strong className="font-medium">Locked</strong> by {stampText(block.locker, block.locked_at)}.{' '}
          {isAdmin ? 'Nothing on it changes until it is unlocked — Unlock first.' : 'Nobody can move or change it until an Admin unlocks it.'}
          {mayAsk && (
            <>
              {' '}
              <button type="button" onClick={onAsk} className="tap font-medium text-accent-blue-soft hover:underline">
                Propose a move
              </button>
            </>
          )}
        </p>
      )}

      {asks.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2" aria-label="Asks to move this block">
          {asks.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-[var(--radius-chip)] bg-raised px-3 py-2.5">
              <span className="min-w-0 flex-1 text-body-sm text-on-surface">
                <span className="font-medium">{personName(r.requester)}</span> asked to move it to {Math.round(r.x)}, {Math.round(r.y)}
                {r.note && <span className="text-on-surface-variant"> — “{r.note}”</span>}
                <span className="block font-mono text-label-sm text-on-surface-faint">{formatRelativeTime(r.requested_at)}</span>
              </span>
              {isAdmin ? (
                <>
                  <ActionButton size="sm" onClick={() => onDecide(r.id, true)}>
                    Approve
                  </ActionButton>
                  <ActionButton size="sm" tone="quiet" onClick={() => onDecide(r.id, false)}>
                    Decline
                  </ActionButton>
                </>
              ) : r.requested_by === myId ? (
                <ActionButton size="sm" tone="quiet" onClick={() => onWithdraw(r.id)}>
                  Withdraw
                </ActionButton>
              ) : null}
            </li>
          ))}
        </ul>
      )}

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
          {block.kind === 'seats' && (
            <label className="flex items-center justify-between gap-3 text-body-sm text-on-surface-variant sm:col-span-2">
              Seats in this row
              <SeatsInput value={block.seats} onCommit={(n) => onChange({ seats: n })} label="Seats in this row" />
            </label>
          )}
          {block.kind === 'item' ? (
            <div className="flex flex-col gap-1.5 text-body-sm text-on-surface-variant sm:col-span-2">
              Picture
              <div role="radiogroup" aria-label="Picture" className="flex flex-wrap gap-1.5">
                {STAGE_ICONS.map((i) => (
                  <button
                    key={i.key}
                    type="button"
                    role="radio"
                    aria-checked={block.icon === i.key}
                    aria-label={i.name}
                    title={i.name}
                    onClick={() => onChange({ icon: i.key })}
                    className={`tap flex h-10 w-10 items-center justify-center rounded-[var(--radius-chip)] hairline ${block.icon === i.key ? 'bg-primary text-on-primary' : 'bg-raised text-on-surface hover:bg-raised-strong'}`}
                  >
                    <IconGlyph d={i.d} />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 text-body-sm text-on-surface-variant">
              Corners
              <SegmentedControl
                label="Corners"
                value={block.corners}
                onChange={(c) => onChange({ corners: c })}
                options={[
                  { value: 'sharp', label: 'Sharp' },
                  { value: 'rounded', label: 'Rounded' },
                ]}
                className="self-start"
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <ActionButton size="sm" tone="quiet" onClick={() => onChange({ rotation: ((block.rotation + 90 + 180) % 360) - 180 })}>
              Turn 90°
            </ActionButton>
            <ActionButton size="sm" tone="quiet" onClick={onFront}>
              Bring to front
            </ActionButton>
            {canDuplicate && (
              <ActionButton size="sm" tone="quiet" onClick={onDuplicate}>
                Duplicate
              </ActionButton>
            )}
            <span className="ml-auto font-mono text-label-sm text-on-surface-faint">
              {Math.round(block.w)} × {Math.round(block.h)}
            </span>
          </div>
        </div>
      )}
      {!canEdit && block.person && (
        <p className="mt-3 text-body-sm text-on-surface">{personName(block.person)}</p>
      )}
      {!canEdit && canDuplicate && (
        <div className="mt-3">
          <ActionButton size="sm" tone="quiet" onClick={onDuplicate}>
            Duplicate
          </ActionButton>
        </div>
      )}

      <div className="mt-5">
        <h3 className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">Notes on this block</h3>
        <CommentList comments={notes} myId={myId} canDelete={canDelete} onDelete={onDeleteNote} empty="No notes pinned here." />
        {canComment && <CommentForm onSend={onNote} busy={false} placeholder="e.g. needs a second DI box" />}
      </div>
    </Tile>
  )
}

/** The word why, before an ask to move a locked block goes to an Admin. */
function ProposalSheet({ label, busy, onSend, onClose }: { label: string; busy: boolean; onSend: (note: string) => void; onClose: () => void }) {
  const [note, setNote] = useState('')
  return (
    <Overlay onDismiss={onClose} label={`Ask to move ${label}`} align="sheet">
      <div className="w-full max-w-md rounded-t-[var(--radius-shell)] bg-surface-lowest p-5 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 sm:rounded-[var(--radius-shell)] dark:ring-white/12">
        <h2 className="text-headline-sm">Ask to move {label}</h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">It goes to the Admins with where you dropped it. Nothing moves until one of them says yes.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSend(note)
          }}
          className="mt-4 flex flex-col gap-3"
        >
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            rows={3}
            autoFocus
            aria-label="Why"
            placeholder="Why — e.g. the camera needs it a metre to the left"
            className={`${inputClasses} text-body-sm`}
          />
          <div className="flex justify-end gap-2">
            <ActionButton tone="quiet" onClick={onClose}>
              Cancel
            </ActionButton>
            <ActionButton type="submit" disabled={busy}>
              Send the ask
            </ActionButton>
          </div>
        </form>
      </div>
    </Overlay>
  )
}

/** 1 to 60; anything else becomes the default. */
function clampSeats(text: string): number {
  const n = Number(text)
  return Number.isFinite(n) && n >= 1 ? Math.min(60, Math.round(n)) : DEFAULT_SEATS
}

/** A count you can empty while retyping; it is written on blur or Enter. */
function SeatsInput({ value, onCommit, label }: { value: number; onCommit: (n: number) => void; label: string }) {
  const [text, setText] = useState(String(value))
  const commit = () => {
    const n = clampSeats(text)
    setText(String(n))
    if (n !== value) onCommit(n)
  }
  return (
    <input
      type="number"
      min={1}
      max={60}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
      aria-label={label}
      className={`${inputClasses} w-24 text-center`}
    />
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

function AddBlockSheet({
  onClose,
  areas,
  startIn,
  onAdd,
  busy,
}: {
  onClose: () => void
  areas: StageArea[]
  /** The area it goes in to begin with: the selected block's, else the first. */
  startIn: string
  onAdd: (label: string, areaId: string, seats?: number, icon?: string) => void
  busy: boolean
}) {
  const [areaId, setAreaId] = useState(startIn)
  const area = areas.find((a) => a.id === areaId) ?? areas[0]
  const names = quickBlocksFor(area?.name ?? 'Stage')
  const [custom, setCustom] = useState('')
  const [rowName, setRowName] = useState('Row A')
  const [seats, setSeats] = useState(String(DEFAULT_SEATS))
  return (
    <Overlay onDismiss={onClose} label="Add a block" align="sheet">
      <div className="w-full max-w-md rounded-t-[var(--radius-shell)] bg-surface-lowest p-5 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 sm:rounded-[var(--radius-shell)] dark:ring-white/12">
        <h2 className="text-headline-sm">Add a block</h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">It lands in the first free spot; drag it where it goes — into another area too.</p>
        {areas.length > 1 && (
          <SegmentedControl
            label="Area"
            value={area?.id ?? null}
            onChange={setAreaId}
            options={areas.map((a) => ({ value: a.id, label: a.name }))}
            className="mt-3 self-start"
          />
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {names.map((name) => (
            <button
              key={name}
              type="button"
              disabled={busy || !area}
              onClick={() => onAdd(name, area!.id)}
              className="tap rounded-full bg-raised px-3.5 py-2 text-body-sm text-on-surface hairline hover:bg-raised-strong disabled:opacity-50"
            >
              {name}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (custom.trim() && area) onAdd(custom, area.id)
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
        {/* Seats, as a row of chairs rather than a box that says "seats". */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (rowName.trim() && area) onAdd(rowName, area.id, clampSeats(seats))
          }}
          className="mt-5 border-t border-border-subtle pt-4"
        >
          <h3 className="text-body-sm font-medium text-on-surface">A row of seats</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              value={rowName}
              onChange={(e) => setRowName(e.target.value)}
              maxLength={40}
              aria-label="Row name"
              className={`${inputClasses} min-w-0 basis-full sm:basis-0 sm:flex-1`}
            />
            <input
              type="number"
              min={1}
              max={60}
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
              aria-label="Seats"
              className={`${inputClasses} w-20 text-center`}
            />
            <ActionButton type="submit" disabled={busy || !rowName.trim()} className="flex-1 sm:flex-none">
              Add row
            </ActionButton>
          </div>
        </form>
        {/* Things that are not a person's place: drawn as a picture, named after it. */}
        <div className="mt-5 border-t border-border-subtle pt-4">
          <h3 className="text-body-sm font-medium text-on-surface">An item</h3>
          <p className="mt-0.5 text-label-md text-on-surface-faint">A picture of the thing, in whatever colour you give it. Rename it once it is down.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {STAGE_ICONS.map((i) => (
              <button
                key={i.key}
                type="button"
                disabled={busy || !area}
                aria-label={`Add ${i.name}`}
                title={i.name}
                onClick={() => onAdd(i.name, area!.id, undefined, i.key)}
                className="tap flex h-11 w-11 items-center justify-center rounded-[var(--radius-chip)] bg-raised text-on-surface hairline hover:bg-raised-strong disabled:opacity-50"
              >
                <IconGlyph d={i.d} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </Overlay>
  )
}

/** One of the stage pictures, at button size, in the current text colour. */
function IconGlyph({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
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
  canManage = false,
  onRename,
  onDelete,
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
  /** May rename and delete templates: whoever holds Templates. */
  canManage?: boolean
  onRename?: (id: string, name: string) => void
  onDelete?: (id: string, name: string) => void
}) {
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
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
              <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-row)] bg-raised px-3.5 py-2.5">
                {renaming?.id === t.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      const next = renaming.name.trim()
                      if (next && next !== t.name) onRename?.(t.id, next)
                      setRenaming(null)
                    }}
                    className="flex min-w-0 flex-1 basis-full gap-2"
                  >
                    <input
                      autoFocus
                      value={renaming.name}
                      onChange={(e) => setRenaming({ id: t.id, name: e.target.value })}
                      onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)}
                      maxLength={60}
                      aria-label={`New name for ${t.name}`}
                      className={`${inputClasses} min-w-0 flex-1`}
                    />
                    <ActionButton size="sm" type="submit" disabled={!renaming.name.trim()}>
                      Save
                    </ActionButton>
                    <ActionButton size="sm" tone="quiet" onClick={() => setRenaming(null)}>
                      Cancel
                    </ActionButton>
                  </form>
                ) : (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block text-body-sm font-medium text-on-surface">{t.name}</span>
                      <span className="block font-mono text-label-sm text-on-surface-faint">
                        {t.blocks.length} {t.blocks.length === 1 ? 'block' : 'blocks'}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {canApply && (
                        <ActionButton size="sm" tone="quiet" disabled={busy} onClick={() => onApply(t.id, t.name)}>
                          Apply
                        </ActionButton>
                      )}
                      {canManage && (
                        <>
                          <ActionButton size="sm" tone="quiet" aria-label={`Rename ${t.name}`} onClick={() => setRenaming({ id: t.id, name: t.name })}>
                            Rename
                          </ActionButton>
                          <ActionButton size="sm" tone="danger-quiet" aria-label={`Delete ${t.name}`} onClick={() => onDelete?.(t.id, t.name)}>
                            Delete
                          </ActionButton>
                        </>
                      )}
                    </span>
                  </>
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
