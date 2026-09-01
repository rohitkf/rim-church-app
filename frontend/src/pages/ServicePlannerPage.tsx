import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { LeadPicker, type LeadOption } from '../components/LeadPicker'
import { ExportServiceDialog } from '../components/ExportServiceDialog'
import type { SheetSession } from '../lib/serviceSheet'
import { editingLocked, editingLocksAt, serviceStanding } from '../lib/serviceState'
import { useAppSettings } from '../lib/appSettings'
import { ServiceGuestsPanel, fetchServiceGuests } from '../components/ServiceGuestsPanel'
import { GrowingField } from '../components/GrowingField'
import { grantsOf, runsForMinutes } from '../lib/sessionLength'
import { QueryState } from '../components/QueryState'
import { ActionButton, Eyebrow, Overlay, Panel, Row, Tile } from '../components/Surface'
import { AssigneePill, RailCountdown, TimelineCard, TimelineRow } from '../components/Timeline'
import { DragHandle } from '../components/DragHandle'
import { NumberDialField } from '../components/NumberDial'
import { useDragReorder } from '../lib/useDragReorder'
import { initialsOf } from '../lib/initials'
import { addMinutesIso, combineDateAndTime, formatTime, timeInputValue } from '../lib/time'
import { formatDuration } from '../lib/duration'
import { runVariance, serviceBounds, serviceProgress, startableSession } from '../lib/serviceProgress'
import {
  addTimePlan,
  heldBackBy,
  holdPlan,
  jumpedSessions,
  releasePlan,
  skipPlan,
  snapshotFor,
  startAtPlan,
  toTheMinute,
  unskipPlan,
  type RunWrite,
} from '../lib/sessionRunPlan'
import { SessionRunDialog, type RunAction } from '../components/SessionRunDialog'
import { AddTimeDialog } from '../components/AddTimeDialog'
import { useErrorText } from '../lib/useErrorText'
import {
  serviceSchema,
  serviceSessionRowSchema,
  profileOptionSchema,
  type ProfileOption,
  type Service,
  type ServiceSessionRow,
} from '../lib/types'

async function fetchService(id: string): Promise<Service | null> {
  const { data, error } = await supabase.from('services').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? serviceSchema.parse(data) : null
}

async function fetchSessions(serviceId: string): Promise<ServiceSessionRow[]> {
  const { data, error } = await supabase
    .from('service_sessions')
    .select(
      '*, assignee:profiles!service_sessions_assigned_user_id_fkey(id, first_name, last_name), guest:service_guests(id, name, note)',
    )
    .eq('service_id', serviceId)
    .order('order_index')
  if (error) throw error
  return z.array(serviceSessionRowSchema).parse(data)
}

async function fetchProfileOptions(): Promise<ProfileOption[]> {
  const { data, error } = await supabase.from('profiles').select('id, first_name, last_name').order('first_name')
  if (error) throw error
  return z.array(profileOptionSchema).parse(data)
}

export function ServicePlannerPage() {
  const { serviceId } = useParams<{ serviceId: string }>()
  const settings = useAppSettings()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const errorText = useErrorText()
  const queryClient = useQueryClient()

  /*
   * Preview: the planner as everyone else gets it.
   *
   * An Admin never sees the page the team sees, because every control they
   * have is one the team hasn't — so it is easy to leave a running order
   * that reads perfectly from the editing side and is missing a name or a
   * time from the other. Preview is simply an Admin choosing not to be one
   * for a moment: `canManage` goes false and every affordance falls away
   * with it, rather than the page growing a second read-only rendering
   * that could drift from the real one.
   */
  const [previewing, setPreviewing] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Planning a service is an Admin action: Service Flow is a department
  // like any other, not a role scoped to one service.
  const canManage = isAdmin && !previewing

  const serviceQuery = useQuery({
    queryKey: ['service', serviceId],
    queryFn: () => fetchService(serviceId!),
    enabled: !!serviceId,
  })
  const sessionsQuery = useQuery({
    queryKey: ['service-sessions', serviceId],
    queryFn: () => fetchSessions(serviceId!),
    enabled: !!serviceId,
  })
  const profilesQuery = useQuery({ queryKey: ['profile-options'], queryFn: fetchProfileOptions, enabled: canManage })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['service-sessions', serviceId] })

  const [undoStack, setUndoStack] = useState<{ label: string; writes: RunWrite[] }[]>([])
  // The session a Start or Skip is being confirmed for. Both actions rewrite
  // every time after them, so neither happens on a single tap.
  const [confirming, setConfirming] = useState<{ action: RunAction; id: string } | null>(null)
  const [endingService, setEndingService] = useState(false)
  const [addingTimeTo, setAddingTimeTo] = useState<string | null>(null)

  const updateField = useMutation({
    mutationFn: async ({
      id,
      patch,
      label,
    }: {
      id: string
      patch: Partial<ServiceSessionRow>
      /** What Undo should offer to put back. Omitted for changes not worth it. */
      label?: string
    }) => {
      const before = sessions.find((s) => s.id === id)
      const { error } = await supabase.from('service_sessions').update(patch).eq('id', id)
      if (error) throw error
      if (!label || !before) return null
      // Only the keys this write touches, so undoing a rename cannot also
      // revive a start time somebody has since corrected by hand.
      const undoPatch = Object.fromEntries(
        Object.keys(patch).map((key) => [key, before[key as keyof ServiceSessionRow] ?? null]),
      ) as RunWrite['patch']
      return { label, writes: [{ id, patch: undoPatch }] }
    },
    onSuccess: (entry) => {
      if (entry) setUndoStack((stack) => [...stack, entry].slice(-25))
      return invalidate()
    },
    onError: (err: unknown) =>
      setServiceError(errorText(err, 'Could not save that change.')),
  })

  /*
   * Working the running order while the service is on.
   *
   * Both live actions — "this is starting now" and "this is not happening" —
   * come down to the same thing: a set of writes computed from the current
   * rows by `sessionRunPlan`, applied in one go. Keeping the arithmetic out
   * of the mutation is what lets the confirmation dialog show the very plan
   * that is about to run, and what makes it testable without a database.
   */
  const applyWrites = async (writes: RunWrite[]) => {
    for (const write of writes) {
      const { error } = await supabase
        .from('service_sessions')
        .update(write.patch)
        .eq('id', write.id)
      if (error) throw error
    }
  }

  const runPlan = useMutation({
    mutationFn: async ({
      label,
      build,
    }: {
      label: string
      build: (rows: ServiceSessionRow[], now: number) => RunWrite[]
    }) => {
      // Re-read first: the plan has to be computed against what is actually
      // stored, not a list this tab loaded several minutes ago.
      const current = await fetchSessions(serviceId!)
      const writes = build(current, Date.now())
      if (writes.length === 0) return null
      await applyWrites(writes)
      return { label, writes: snapshotFor(current, writes) }
    },
    onSuccess: (entry) => {
      setServiceError(null)
      if (entry) setUndoStack((stack) => [...stack, entry].slice(-25))
      return invalidate()
    },
    onError: (err: unknown) => setServiceError(errorText(err, 'Could not change the running order.')),
  })

  /**
   * Putting back what the last action changed.
   *
   * The stack holds the rows' previous values, taken from the same read the
   * plan was computed against — so undoing is a restore rather than an
   * inverse somebody had to derive, and it gets multi-row, multi-field
   * changes right. It lives in this tab only: a reload starts a fresh
   * history rather than offering to undo something from an hour ago.
   */
  const undo = useMutation({
    mutationFn: async () => {
      const entry = undoStack.at(-1)
      if (!entry) return
      await applyWrites(entry.writes)
    },
    onSuccess: () => {
      setServiceError(null)
      setUndoStack((stack) => stack.slice(0, -1))
      return invalidate()
    },
    onError: (err: unknown) => setServiceError(errorText(err, 'Could not undo that.')),
  })

  /**
   * Calling the end of the service, and taking it back.
   *
   * Ending it starts the hour, the same way the last session's planned end
   * does. Everything stays editable inside that hour, Undo included, and
   * reopening is the way back afterwards — the services row itself is not
   * gated on the service being finished, which is what leaves that possible.
   */
  const endService = useMutation({
    mutationFn: async (at: string | null) => {
      const { error } = await supabase
        .from('services')
        .update({ ended_at: at })
        .eq('id', serviceId!)
      if (error) throw error
    },
    onSuccess: () => {
      setServiceError(null)
      // The page's clock only ticks every 30 seconds, so without this the
      // service could sit there ended but still reading as running for up to
      // half a minute — offering live controls the database has by then
      // already stopped accepting.
      setClock(Date.now())
      queryClient.invalidateQueries({ queryKey: ['service', serviceId] })
      return invalidate()
    },
    onError: (err: unknown) => setServiceError(errorText(err, 'Could not change the service.')),
  })

  const addSession = useMutation({
    mutationFn: async () => {
      // Read the tail of the list from the database rather than the cached
      // copy: if the cache were stale, the computed order_index would
      // already be taken and the insert would fail its unique constraint.
      const current = await fetchSessions(serviceId!)
      const last = current[current.length - 1]
      const nextOrderIndex = (last?.order_index ?? 0) + 1
      const startTime = last
        ? addMinutesIso(last.start_time, last.duration_minutes)
        : combineDateAndTime(serviceQuery.data!.date, '09:00')

      const { error } = await supabase.from('service_sessions').insert({
        service_id: serviceId,
        order_index: nextOrderIndex,
        start_time: startTime,
        duration_minutes: 5,
        session_name: 'New Session',
      })
      if (error) throw error
    },
    // Returning the promise keeps the button in its "Adding…" state until
    // the refreshed list is actually in hand, so the new row is on screen
    // the moment the button reads normally again.
    onSuccess: () => {
      setServiceError(null)
      return invalidate()
    },
    onError: (err: unknown) =>
      setServiceError(errorText(err, 'Could not add the session.')),
  })

  const deleteSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const sessions = sessionsQuery.data ?? []
      const { error: deleteError } = await supabase.from('service_sessions').delete().eq('id', sessionId)
      if (deleteError) throw deleteError

      const remaining = sessions.filter((s) => s.id !== sessionId)
      let cursor: string | null = null
      for (let i = 0; i < remaining.length; i++) {
        const s = remaining[i]
        const newOrderIndex = i + 1
        const newStart = i === 0 ? s.start_time : cursor!
        if (newOrderIndex !== s.order_index || newStart !== s.start_time) {
          const { error } = await supabase
            .from('service_sessions')
            .update({ order_index: newOrderIndex, start_time: newStart })
            .eq('id', s.id)
          if (error) throw error
        }
        cursor = addMinutesIso(newStart, s.duration_minutes)
      }
    },
    onSuccess: () => {
      setServiceError(null)
      return invalidate()
    },
    onError: (err: unknown) =>
      setServiceError(errorText(err, 'Could not delete the session.')),
  })

  /*
   * Dragging a session up or down the running order.
   *
   * The whole list goes to the database in its new order, and the cascade
   * — every session after the first starting when the one before it ends —
   * is redone there, in one transaction. Doing it a row at a time from here
   * would trip the unique index the running order relies on, halfway
   * through, leaving a service in an order nobody asked for.
   */
  const reorderSessions = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.rpc('reorder_service_sessions', { svc: serviceId, ids })
      if (error) throw error
    },
    onSuccess: () => {
      setServiceError(null)
      return invalidate()
    },
    onError: (err: unknown) =>
      setServiceError(errorText(err, 'Could not reorder the running order.')),
  })

  const sessions = useMemo(() => sessionsQuery.data ?? [], [sessionsQuery.data])

  // The rail doubles as a clock, so it needs one. Twenty seconds is finer
  // than anyone can see on a 3-minute item and coarse enough to cost
  // nothing on a screen left open through a service.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 20_000)
    return () => window.clearInterval(tick)
  }, [])
  const progress = useMemo(() => serviceProgress(sessions, now), [sessions, now])
  const endedAt = serviceQuery.data?.ended_at ?? null
  const variance = useMemo(() => runVariance(sessions, endedAt), [sessions, endedAt])
  const startable = useMemo(() => startableSession(sessions, now), [sessions, now])
  // What the running order adds up to, and what has nobody on it — the two
  // things a planner is actually managing, neither of which a table showed.
  // A skipped session takes no time, so it takes none of the total either —
  // otherwise the running order claims a length the service will not run to.
  const totalMinutes = sessions.reduce(
    (n, session) => n + (session.skipped_at ? 0 : runsForMinutes(session)),
    0,
  )
  const guestsQuery = useQuery({
    queryKey: ['service-guests', serviceId],
    queryFn: () => fetchServiceGuests(serviceId!),
    enabled: !!serviceId,
  })

  // The clock, re-read on a timer so a service that ends while the page is
  // open locks itself rather than waiting for a reload.
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  const finished = serviceStanding(sessions, clock, endedAt).state === 'done'

  /*
   * Editing stops an hour after the service does.
   *
   * Once the last session has ended the running order is no longer a plan —
   * it is what happened. Changing it a week later is almost always a mistake
   * (the wrong service opened, a stray tap on a phone in a pocket), and the
   * cost is a record of a Sunday that quietly stops matching the Sunday.
   *
   * But the corrections worth making are all noticed in the minutes after
   * the last session, while people are packing down: a session nobody
   * pressed the button on, a name spelt wrong, ten minutes granted that
   * never got recorded. Locking on the stroke of the end means the record is
   * wrong for good. So the lock comes an hour late.
   *
   * The database refuses these writes on the same rule, so this is not the
   * lock — it only saves someone the round trip and an error message about a
   * button that should not have been there.
   */
  const graceMs = settings.edit_grace_minutes * 60_000
  const locksAt = editingLocksAt(sessions, endedAt, graceMs)
  const canEdit = canManage && !editingLocked(sessions, clock, endedAt, graceMs)

  const {
    ordered: sessionOrder,
    handleProps: dragHandleProps,
    rowProps: dragRowProps,
  } = useDragReorder(
    sessions.map((session) => session.id),
    (ids) => reorderSessions.mutate(ids),
    { enabled: canEdit },
  )
  // The running order as it is drawn, which mid-drag is a step ahead of
  // what the database has been told.
  const sessionById = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions])
  const drawn = useMemo(
    () =>
      sessionOrder
        .map((id) => sessionById.get(id))
        .filter((s): s is (typeof sessions)[number] => !!s),
    [sessionOrder, sessionById],
  )

  // Everyone who could take a session: the people with accounts, then
  // this service's guests.
  const leadOptions: LeadOption[] = useMemo(
    () => [
      ...(profilesQuery.data ?? []).map((p) => ({
        kind: 'member' as const,
        id: p.id,
        name: `${p.first_name} ${p.last_name}`,
      })),
      ...(guestsQuery.data ?? []).map((g) => ({
        kind: 'guest' as const,
        id: g.id,
        name: g.name,
        note: g.note,
      })),
    ],
    [profilesQuery.data, guestsQuery.data],
  )

  // A session that was dropped needs nobody on it, so it is not something
  // the page should still be asking anyone to fix.
  const unassignedSessions = sessions.filter(
    (session) => !session.skipped_at && !session.assigned_user_id && !session.guest_id,
  )
  /*
   * When the service actually ends, not when the plan's lengths add up to.
   *
   * Adding the total to the first start assumes nothing has slipped, which
   * stopped being true the moment a session could be started late or
   * dropped: it would have claimed a 07:55 finish for a service whose last
   * session now runs to 08:02. The bounds read the real last end.
   */
  const bounds = useMemo(() => serviceBounds(sessions), [sessions])
  /** How long it actually ran, once somebody has called the end. Null until then. */
  const ranMinutes =
    endedAt && bounds ? Math.round((new Date(endedAt).getTime() - bounds.from) / 60_000) : null
  const endsAt = endedAt
    ? formatTime(endedAt)
    : bounds
      ? formatTime(new Date(bounds.to).toISOString())
      : null

  // Exactly what the page is showing, handed over in the shape the sheet
  // takes — so an export is a copy of the running order rather than a
  // second reading of it.
  const exportSheet = useMemo(
    () => ({
      serviceType: serviceQuery.data?.service_type ?? 'Service',
      date: serviceQuery.data?.date ?? '',
      // Dropped sessions are left off: the export is the running order
      // people work from, and a line for something that is not happening is
      // worse than no line at all.
      sessions: sessions.filter((s) => !s.skipped_at).map<SheetSession>((session) => ({
        time: formatTime(session.start_time),
        minutes: runsForMinutes(session),
        name: session.session_name,
        lead: session.guest
          ? session.guest.name
          : session.assignee
            ? `${session.assignee.first_name} ${session.assignee.last_name}`
            : null,
      })),
      totalLabel: formatDuration(totalMinutes),
      windowLabel:
        sessions.length > 0 && endsAt
          ? `Doors at ${formatTime(sessions[0].start_time)}, closing around ${endsAt}.`
          : null,
      printedOn: `exported ${new Date().toLocaleDateString()}`,
    }),
    [serviceQuery.data, sessions, totalMinutes, endsAt],
  )

  const [serviceError, setServiceError] = useState<string | null>(null)

  const updateService = useMutation({
    mutationFn: async (patch: { service_type?: string; date?: string }) => {
      const { error } = await supabase.from('services').update(patch).eq('id', serviceId)
      if (error) throw error
      // Moving the service to another day: re-anchor the first session to
      // the same clock time on the new date — the cascade trigger walks
      // the rest of the timeline onto that day.
      if (patch.date && sessions.length > 0) {
        const first = sessions[0]
        const { error: shiftError } = await supabase
          .from('service_sessions')
          .update({ start_time: combineDateAndTime(patch.date, timeInputValue(first.start_time)) })
          .eq('id', first.id)
        if (shiftError) throw shiftError
      }
    },
    onSuccess: () => {
      setServiceError(null)
      queryClient.invalidateQueries({ queryKey: ['service', serviceId] })
      queryClient.invalidateQueries({ queryKey: ['services'] })
      invalidate()
    },
    onError: (err: unknown) =>
      setServiceError(errorText(err, 'Could not update the service.')),
  })

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirmingClear, setConfirmingClear] = useState(false)

  const clearPlan = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('service_sessions').delete().eq('service_id', serviceId)
      if (error) throw error
    },
    onSuccess: () => {
      setConfirmingClear(false)
      invalidate()
    },
    onError: (err: unknown) =>
      setServiceError(errorText(err, 'Could not clear the plan.')),
  })

  const deleteService = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('services').delete().eq('id', serviceId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
      navigate('/service-planner')
    },
    onError: (err: unknown) =>
      setServiceError(errorText(err, 'Could not delete the service.')),
  })

  const [templateFormOpen, setTemplateFormOpen] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateMessage, setTemplateMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const saveTemplate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('service_templates')
        .insert({ name: templateName.trim(), start_time: timeInputValue(sessions[0].start_time) })
        .select()
        .single()
      if (error) throw error
      const template = z.object({ id: z.string() }).parse(data)
      const { error: sessionsError } = await supabase.from('service_template_sessions').insert(
        sessions.map((s) => ({
          template_id: template.id,
          order_index: s.order_index,
          session_name: s.session_name,
          duration_minutes: s.duration_minutes,
        })),
      )
      if (sessionsError) throw sessionsError
    },
    onSuccess: () => {
      setTemplateFormOpen(false)
      setTemplateMessage({ ok: true, text: `Saved "${templateName.trim()}" — pick it when creating a service.` })
      setTemplateName('')
      queryClient.invalidateQueries({ queryKey: ['service-templates'] })
    },
    onError: (err: unknown) =>
      setTemplateMessage({
        ok: false,
        text: errorText(err, 'Could not save template.'),
      }),
  })

  function handleSaveTemplate(e: FormEvent) {
    e.preventDefault()
    if (!templateName.trim() || sessions.length === 0) return
    setTemplateMessage(null)
    saveTemplate.mutate()
  }

  return (
    <QueryState
      isLoading={serviceQuery.isLoading}
      error={serviceQuery.error}
      isEmpty={serviceQuery.data === null}
      emptyMessage="Service not found."
    >
      <div>
        <Link to="/service-planner" className="tap inline-flex items-center text-body-sm text-secondary">
          ← Back to Service Planner
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {canEdit ? (
              <>
                <GrowingField
                  key={serviceQuery.data?.service_type}
                  value={serviceQuery.data?.service_type ?? ''}
                  label="Service name"
                  onCommit={(value) => updateService.mutate({ service_type: value })}
                  /* Block, not inline: two inline fields sat on one line and
                     the name ran straight into the date. */
                  className="max-w-xl rounded-[var(--radius-chip)] border-0 bg-transparent px-2 py-1 -ml-2 text-headline-lg text-on-surface transition-colors duration-300 ease-[var(--ease-glide)] hover:bg-raised focus:bg-raised focus:outline-none sm:text-headline-xl"
                />
                <input
                  key={`date-${serviceQuery.data?.date}`}
                  type="date"
                  defaultValue={serviceQuery.data?.date}
                  aria-label="Service date"
                  onBlur={(e) => {
                    if (!e.target.value || e.target.value === serviceQuery.data?.date) return
                    updateService.mutate({ date: e.target.value })
                  }}
                  className="mt-1.5 block rounded-full border-0 bg-raised-strong px-3 py-1 font-mono text-label-md text-on-surface-variant transition-colors duration-300 ease-[var(--ease-glide)] hover:text-on-surface focus:outline-none [color-scheme:dark]"
                />
              </>
            ) : (
              <>
                <h1 className="text-headline-lg sm:text-headline-xl">
                  {serviceQuery.data?.service_type}
                </h1>
                <p className="mt-1.5 font-mono text-label-md text-on-surface-variant">
                  {serviceQuery.data?.date}
                </p>
              </>
            )}
          </div>
          {/* Four buttons come to 517px, and `shrink-0` meant they ran
              off the side of a phone rather than wrapping. They wrap
              here and stay one row from `sm`, where they fit. */}
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            {/* Export is not an editing control. Anyone rostered on needs the
                running order on a phone screen or a printed sheet, and having
                to ask an Admin for a copy of a plan they can already read on
                this page is a worse answer than letting them take it. It sits
                outside the Admin block for that reason, and stays visible in
                Preview, which is meant to show what everyone else gets. */}
            <button
              onClick={() => setExporting(true)}
              className="tap rounded-full bg-raised-strong px-4 py-2.5 text-body-sm font-medium text-on-surface hairline-strong transition-transform duration-500 ease-[var(--ease-glide)] active:scale-[0.98]"
            >
              Export
            </button>
            {canManage && (
            <>
              <button
                onClick={() => setPreviewing(true)}
                className="tap rounded-full bg-raised-strong px-4 py-2.5 text-body-sm font-medium text-on-surface hairline-strong transition-transform duration-500 ease-[var(--ease-glide)] active:scale-[0.98]"
              >
                Preview
              </button>
              {sessions.length > 0 && (
                <button
                  onClick={() => {
                    setTemplateMessage(null)
                    setTemplateFormOpen((v) => !v)
                  }}
                  className="rounded-full bg-raised-strong px-4 py-2.5 text-body-sm font-medium text-on-surface hairline-strong transition-transform duration-500 ease-[var(--ease-glide)] active:scale-[0.98]"
                >
                  Save as template
                </button>
              )}
              {canEdit && undoStack.length > 0 && (
                <button
                  onClick={() => undo.mutate()}
                  disabled={undo.isPending}
                  title="Only what has been changed since this page was opened"
                  className="rounded-full hairline px-4 py-2.5 text-body-sm font-medium text-on-surface disabled:opacity-50"
                >
                  {undo.isPending ? 'Undoing…' : `Undo ${undoStack.at(-1)!.label}`}
                </button>
              )}
              {canEdit && (
                <button
                  onClick={() => addSession.mutate()}
                  disabled={addSession.isPending}
                  className="rounded-full bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
                >
                  {addSession.isPending ? 'Adding…' : '+ Add Session'}
                </button>
              )}
              {canEdit && sessions.length > 0 && (
                <button
                  onClick={() => {
                    setConfirmingDelete(false)
                    setConfirmingClear(true)
                  }}
                  className="rounded-full hairline px-4 py-2.5 text-body-sm font-medium text-error hover:border-error"
                >
                  Clear plan
                </button>
              )}
              <button
                onClick={() => {
                  setConfirmingClear(false)
                  setConfirmingDelete(true)
                }}
                className="rounded-full hairline px-4 py-2.5 text-body-sm font-medium text-error hover:border-error"
              >
                Delete
              </button>
            </>
            )}
          </div>
        </div>

        {/* Preview hides every control an Admin has, including the button
            that started it — so the way out has to be somewhere those
            controls are not. It sticks to the top of the page for the
            same reason. */}
        {isAdmin && previewing && (
          <div className="sticky top-16 z-10 mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-card)] bg-[color-mix(in_oklab,var(--color-accent-indigo)_12%,var(--color-surface-lowest))] px-4 py-3 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent-indigo)_30%,transparent)] backdrop-blur-xl">
            <span className="font-mono text-label-sm uppercase tracking-wide text-accent-indigo-soft">
              Preview
            </span>
            <span className="text-body-sm text-on-surface-variant">
              This is the running order as everyone who isn&rsquo;t an Admin sees it.
            </span>
            <button
              onClick={() => setPreviewing(false)}
              className="tap ml-auto rounded-full bg-raised-strong px-4 py-2 text-body-sm font-medium text-on-surface hairline-strong transition-transform duration-500 ease-[var(--ease-glide)] active:scale-[0.98]"
            >
              Back to editing
            </button>
          </div>
        )}

        {/* A page with its controls quietly missing reads as broken. Say
            what happened and that nothing is lost. */}
        {finished && (
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-card)] bg-[color-mix(in_oklab,var(--color-accent-green)_8%,var(--color-surface-lowest))] px-4 py-3 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent-green)_24%,transparent)]">
            <span className="font-mono text-label-sm uppercase tracking-wide text-accent-green">
              Finished
            </span>
            <span className="text-body-sm text-on-surface-variant">
              {canEdit
                ? 'This service is over. The running order is a record of it now, still open to be corrected.'
                : 'This service is over, so the running order is now a record of it and can’t be changed.'}
            </span>
            {canEdit && locksAt !== null && (
              // The one number somebody standing on a stage needs: how long
              // they have to fix what they just noticed.
              <span className="text-label-md text-accent-green">
                Changes close at{' '}
                <span className="font-mono">{formatTime(new Date(locksAt).toISOString())}</span>.
              </span>
            )}
            {canManage && (
              <span className="text-label-md text-on-surface-faint">
                Attendance and checklists can still be filled in.
              </span>
            )}
          </div>
        )}

        {exporting && (
        <ExportServiceDialog sheet={exportSheet} onClose={() => setExporting(false)} />
      )}

      {confirming && canEdit && (() => {
        const index = sessions.findIndex((s) => s.id === confirming.id)
        if (index < 0) return null
        const session = sessions[index]
        const now = Date.now()
        return (
          <SessionRunDialog
            action={confirming.action}
            session={session}
            jumpedAt={(when) => jumpedSessions(sessions, index, when)}
            earliest={(() => {
              const before = sessions
                .slice(0, index)
                .filter((s) => !s.skipped_at)
                .at(-1)
              return before ? new Date(before.start_time).getTime() : null
            })()}
            at={new Date(toTheMinute(now)).getTime()}
            busy={runPlan.isPending}
            onClose={() => setConfirming(null)}
            onConfirm={(reason, chosen) => {
              const action = confirming.action
              setConfirming(null)
              runPlan.mutate({
                label:
                  action === 'start'
                    ? `starting ${session.session_name}`
                    : `skipping ${session.session_name}`,
                // Re-found against the rows the mutation re-read, so a plan
                // built here cannot act on a stale position in the list.
                // A start uses the minute chosen in the dialog rather than
                // the mutation's own clock: that is the whole point of being
                // able to correct it.
                build: (rows, at) => {
                  const i = rows.findIndex((r) => r.id === session.id)
                  if (i < 0) return []
                  return action === 'start'
                    ? startAtPlan(rows, i, chosen, reason)
                    : skipPlan(rows, i, at, reason)
                },
              })
            }}
          />
        )
      })()}

      {addingTimeTo && canEdit && (() => {
        const session = sessions.find((s) => s.id === addingTimeTo)
        if (!session) return null
        return (
          <AddTimeDialog
            session={session}
            busy={runPlan.isPending}
            onClose={() => setAddingTimeTo(null)}
            onConfirm={(minutes, note) => {
              setAddingTimeTo(null)
              runPlan.mutate({
                label: `adding ${minutes} min to ${session.session_name}`,
                build: (rows) => {
                  const i = rows.findIndex((r) => r.id === session.id)
                  return i < 0 ? [] : addTimePlan(rows, i, minutes, note)
                },
              })
            }}
          />
        )
      })()}

      {endingService && canEdit && (
        <Overlay label="End this service" align="sheet" onDismiss={() => setEndingService(false)}>
          <div className="w-full rounded-t-[var(--radius-card)] bg-surface-lowest p-6 shadow-[inset_0_0_0_1px_var(--color-outline-variant),var(--shadow-lifted)] sm:max-w-md sm:rounded-[var(--radius-card)]">
            <h2 className="text-headline-md">End the service?</h2>
            <p className="mt-2 text-body-sm text-on-surface-variant">
              It will be recorded as finishing at{' '}
              <span className="font-mono text-on-surface">
                {formatTime(new Date(toTheMinute(clock)).toISOString())}
              </span>
              , which is what gives the closing session its over or under. The running order
              becomes a record of it, still open to be corrected for an hour — after that an Admin
              has to reopen it.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEndingService(false)}
                className="tap rounded-full px-4 py-2.5 text-body-sm font-medium text-on-surface-variant hover:text-on-surface"
              >
                Cancel
              </button>
              <ActionButton
                type="button"
                disabled={endService.isPending}
                onClick={() => {
                  setEndingService(false)
                  endService.mutate(toTheMinute(Date.now()))
                }}
              >
                {endService.isPending ? 'Ending…' : 'Yes, end it'}
              </ActionButton>
            </div>
          </div>
        </Overlay>
      )}

      {confirmingClear && (
          <div className="mt-4 max-w-md rounded-lg border border-error/40 bg-error-container p-4">
            <p className="text-body-sm font-medium text-on-error-container">
              Clear the whole running order for "{serviceQuery.data?.service_type}"?
            </p>
            <p className="mt-1 text-body-sm text-on-error-container">
              All {sessions.length} session{sessions.length === 1 ? '' : 's'} will be removed. The
              service itself, its checklists, and attendance stay. This can't be undone.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={() => clearPlan.mutate()}
                disabled={clearPlan.isPending}
                className="rounded-full bg-error px-4 py-2 text-body-sm font-medium text-on-error hover:opacity-90 disabled:opacity-50"
              >
                {clearPlan.isPending ? 'Clearing…' : 'Yes, clear plan'}
              </button>
              <button
                onClick={() => setConfirmingClear(false)}
                className="text-body-sm font-medium text-on-error-container hover:underline"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {confirmingDelete && (
          <div className="mt-4 max-w-md rounded-lg border border-error/40 bg-error-container p-4">
            <p className="text-body-sm font-medium text-on-error-container">
              Delete "{serviceQuery.data?.service_type}" on {serviceQuery.data?.date}?
            </p>
            <p className="mt-1 text-body-sm text-on-error-container">
              Its running order, checklists, and attendance records go with it. This can't be
              undone.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={() => deleteService.mutate()}
                disabled={deleteService.isPending}
                className="rounded-full bg-error px-4 py-2 text-body-sm font-medium text-on-error hover:opacity-90 disabled:opacity-50"
              >
                {deleteService.isPending ? 'Deleting…' : 'Yes, delete service'}
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="text-body-sm font-medium text-on-error-container hover:underline"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {serviceError && (
          <p className="mt-3 max-w-md rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
            {serviceError}
          </p>
        )}

        {templateFormOpen && (
          <form
            onSubmit={handleSaveTemplate}
            className="mt-4 flex max-w-md flex-wrap items-end gap-3 rounded-[var(--radius-card)] bg-surface-lowest hairline p-4"
          >
            <label className="flex flex-1 flex-col gap-1 text-body-sm text-on-surface-variant">
              Template name
              <input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="English Sunday service"
                className="rounded-full hairline px-3 py-2 text-body-md text-on-surface focus:border-2 focus:border-secondary focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={saveTemplate.isPending || !templateName.trim()}
              className="rounded-full bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
            >
              {saveTemplate.isPending ? 'Saving…' : 'Save'}
            </button>
          </form>
        )}
        {templateMessage && (
          <p
            className={`mt-3 max-w-md rounded-sm px-3 py-2 text-body-sm ${
              templateMessage.ok ? 'bg-secondary/10 text-secondary' : 'bg-error-container text-on-error-container'
            }`}
          >
            {templateMessage.text}
          </p>
        )}

        <QueryState
          isLoading={sessionsQuery.isLoading}
          error={sessionsQuery.error}
          isEmpty={sessions.length === 0}
          emptyMessage="No sessions yet."
        >
          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-12">
            <Tile as="section" className="lg:col-span-8" padded={false}>
              <div className="px-5 py-5 sm:px-7 sm:py-6">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <Eyebrow>Running order</Eyebrow>
                  <span className="font-mono text-label-sm text-on-surface-faint">
                    {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'} ·{' '}
                    {formatDuration(totalMinutes)}
                  </span>
                </div>

                <ul className="mt-5 flex flex-col">
                  {drawn.map((session, idx) => {
                    const isFirst = idx === 0
                    const skipped = !!session.skipped_at
                    // A dropped session needs nobody on it, so it is never
                    // the thing the page is nagging about.
                    const unassigned =
                      !skipped && !session.assigned_user_id && !session.guest_id
                    const timing = progress.byId.get(session.id)
                    const running = progress.runningId === session.id
                    const drift = variance.get(session.id)
                    // The gap this row's rail leaves before the next thing
                    // that is actually going to happen — a skipped session
                    // is not it.
                    const nextUp = drawn.slice(idx + 1).find((s) => !s.skipped_at)
                    // Somebody has said the next one has not begun, so this
                    // one is still going whatever its planned end says.
                    const heldBack = heldBackBy(drawn, idx)
                    const onNow = running || !!heldBack
                    const held = !!session.held_at
                    // Every session gets the controls, not just the one the
                    // clock is on: a session that finishes early is started
                    // by pressing the next one, and a session nobody got to
                    // is skipped from wherever the service actually is.
                    const isNext = startable === session.id
                    /* The one time the planner actually sets; every other
                       start is this one plus the durations. It is rendered
                       in the rail on a desktop and inside the card on a
                       phone — only ever one of the two at a time. */
                    const startTimeEditor = (
                      <input
                        type="time"
                        aria-label="Service start time"
                        defaultValue={timeInputValue(session.start_time)}
                        onBlur={(e) => {
                          if (!e.target.value) return
                          updateField.mutate({
                            id: session.id,
                            patch: {
                              start_time: combineDateAndTime(
                                serviceQuery.data!.date,
                                e.target.value,
                              ),
                            },
                          })
                        }}
                        className="w-full min-w-0 rounded-full bg-raised-strong px-2 py-1 text-right font-mono text-label-md text-on-surface hairline [color-scheme:dark]"
                      />
                    )
                    return (
                      <TimelineRow
                        key={`${session.id}-${session.updated_at}`}
                        last={idx === drawn.length - 1}
                        rowRef={dragRowProps(session.id).ref}
                        style={dragRowProps(session.id).style}
                        fill={timing?.fill}
                        running={running}
                        tone={unassigned ? 'warning' : isFirst && !skipped ? 'now' : 'plain'}
                        time={
                          isFirst && canEdit ? (
                            <>
                              {/* The rail is 56px wide on a phone and a time
                                  input is nearly twice that, so there it
                                  reads the time and the editor moves into
                                  the card, which has the room. */}
                              <span className="font-mono sm:hidden">
                                {formatTime(session.start_time)}
                              </span>
                              <span className="hidden sm:block">{startTimeEditor}</span>
                            </>
                          ) : (
                            formatTime(session.start_time)
                          )
                        }
                        meta={
                          canEdit ? (
                            <span className="flex items-center justify-end gap-1">
                              {/* The rail is 56px wide on a phone, so the
                                  ruler opens over the row rather than living
                                  in it — the chip is what the column can
                                  hold, and a length is what the ruler is
                                  good at. */}
                              <NumberDialField
                                value={session.duration_minutes}
                                onChange={(next) => {
                                  if (next === session.duration_minutes) return
                                  updateField.mutate({
                                    id: session.id,
                                    patch: { duration_minutes: next },
                                  })
                                }}
                                min={0}
                                max={180}
                                majorEvery={5}
                                unit="min"
                                label={`${session.session_name} duration in minutes`}
                              />
                            </span>
                          ) : (
                            `${session.duration_minutes} min`
                          )
                        }
                        over={drift}
                        skipped={skipped}
                        grants={grantsOf(session)}
                        runsFor={runsForMinutes(session)}
                        countdown={
                          onNow && nextUp ? (
                            <RailCountdown startsAt={nextUp.start_time} holding={!!heldBack} />
                          ) : undefined
                        }
                      >
                        {/* Nobody on it still outranks "on now": an empty
                            session is the thing that needs a person. */}
                        <TimelineCard
                          tone={
                            skipped
                              ? 'skipped'
                              : unassigned
                                ? 'warning'
                                : onNow
                                  ? 'running'
                                  : 'plain'
                          }
                        >
                          {/* The chip is not gated on edit: everyone reading
                              the running order needs to know this one did not
                              happen. Only putting it back is the Admin's. */}
                          {(skipped || canEdit) && (
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                              {skipped ? (
                                <>
                                  <span className="rounded-full bg-raised-strong px-3 py-1.5 text-label-md text-on-surface-variant">
                                    Skipped
                                  </span>
                                  {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      runPlan.mutate({
                                        label: `un-skipping ${session.session_name}`,
                                        build: (rows) =>
                                          unskipPlan(rows, rows.findIndex((r) => r.id === session.id)),
                                      })
                                    }
                                    disabled={runPlan.isPending}
                                    className="tap rounded-full hairline px-3.5 py-1.5 text-label-md font-medium text-on-surface disabled:opacity-50"
                                  >
                                    Put it back
                                  </button>
                                  )}
                                </>
                              ) : canEdit ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setConfirming({ action: 'start', id: session.id })}
                                    disabled={runPlan.isPending}
                                    className={`tap rounded-full px-3.5 py-1.5 text-label-md font-medium transition-transform duration-500 ease-[var(--ease-glide)] active:scale-[0.98] disabled:opacity-50 ${
                                      isNext
                                        ? 'bg-accent-green text-accent-green-ink'
                                        : 'hairline text-on-surface'
                                    }`}
                                  >
                                    Session started
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      runPlan.mutate({
                                        label: held
                                          ? `un-holding ${session.session_name}`
                                          : `holding ${session.session_name}`,
                                        build: (rows, at) => {
                                          const i = rows.findIndex((r) => r.id === session.id)
                                          if (i < 0) return []
                                          return held ? releasePlan(rows, i) : holdPlan(rows, i, at)
                                        },
                                      })
                                    }
                                    disabled={runPlan.isPending}
                                    className={`tap rounded-full px-3.5 py-1.5 text-label-md font-medium disabled:opacity-50 ${
                                      held
                                        ? 'bg-error-container text-on-error-container'
                                        : 'hairline text-on-surface-variant'
                                    }`}
                                  >
                                    {held ? 'Still not started' : 'Not started'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setAddingTimeTo(session.id)}
                                    disabled={runPlan.isPending}
                                    className="tap rounded-full hairline px-3.5 py-1.5 text-label-md font-medium text-on-surface disabled:opacity-50"
                                  >
                                    + Time
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirming({ action: 'skip', id: session.id })}
                                    disabled={runPlan.isPending}
                                    className="tap rounded-full hairline px-3.5 py-1.5 text-label-md font-medium text-on-surface-variant hover:text-error disabled:opacity-50"
                                  >
                                    Skip
                                  </button>
                                  {held && (
                                    <span className="basis-full text-label-sm text-error">
                                      Not started yet — the one before it is still running, and its
                                      overrun is still counting.
                                    </span>
                                  )}
                                  {isNext && !held && (
                                    <span className="basis-full text-label-sm text-on-surface-faint sm:basis-auto">
                                      Sets this to now and moves everything after it.
                                    </span>
                                  )}
                                </>
                              ) : null}
                            </div>
                          )}
                          {!skipped && grantsOf(session).length > 0 && (
                            <ul className="mb-3 flex flex-col gap-0.5">
                              {grantsOf(session).map((grant, i) => (
                                <li key={i} className="text-label-md text-accent-blue">
                                  +{grant.minutes} min added on request
                                  {grant.note ? ` — ${grant.note}` : ''}
                                </li>
                              ))}
                            </ul>
                          )}
                          {skipped && session.skip_reason && (
                            <p className="mb-3 text-label-md text-on-surface-faint">
                              Skipped — {session.skip_reason}
                            </p>
                          )}
                          {isFirst && canEdit && (
                            <label className="mb-3 flex items-center gap-2 sm:hidden">
                              <span className="shrink-0 font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
                                Starts
                              </span>
                              {startTimeEditor}
                            </label>
                          )}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                            {/* `min-w-0` lets this shrink, which is what a
                                wrapping row needs — but with nothing to
                                shrink *to* it collapsed against the lead
                                picker's own width until the name was one
                                letter wide. `basis-full` gives it the whole
                                line on a phone, so the picker wraps under
                                it instead of squeezing it. */}
                            <div className="min-w-0 flex-1 basis-full sm:basis-0">
                              <div className="flex items-start gap-1">
                              {/* The grip sits with the name rather than
                                  out at the card's edge: it is the row's
                                  first thing, and on a phone an edge is
                                  where the thumb already is for scrolling. */}
                              {canEdit && (
                                <DragHandle
                                  label={session.session_name}
                                  className="mt-1.5"
                                  {...dragHandleProps(session.id)}
                                />
                              )}
                              <div className="min-w-0 flex-1">
                              {canEdit ? (
                                <GrowingField
                                  value={session.session_name}
                                  label="Session name"
                                  onCommit={(value) =>
                                    updateField.mutate({
                                      id: session.id,
                                      patch: { session_name: value },
                                    })
                                  }
                                  className="rounded-[var(--radius-chip)] bg-transparent px-2 py-1 -ml-2 text-headline-sm text-on-surface transition-shadow duration-300 ease-[var(--ease-glide)] hover:bg-raised focus:bg-raised focus:outline-none"
                                />
                              ) : (
                                <div className="text-headline-sm">{session.session_name}</div>
                              )}
                              </div>
                              </div>
                              {unassigned && (
                                <div className="mt-1 px-0.5 text-label-md text-accent-orange-soft">
                                  Nobody assigned yet
                                </div>
                              )}
                            </div>

                            {canEdit ? (
                              <LeadPicker
                                label={`Who leads ${session.session_name}`}
                                options={leadOptions}
                                value={
                                  session.assigned_user_id
                                    ? { kind: 'member', id: session.assigned_user_id }
                                    : session.guest_id
                                      ? { kind: 'guest', id: session.guest_id }
                                      : null
                                }
                                onChange={(next) =>
                                  updateField.mutate({
                                    id: session.id,
                                    // Both fields are written every time: a
                                    // session has one lead, and setting one
                                    // without clearing the other is exactly
                                    // the pair the database refuses.
                                    patch: {
                                      assigned_user_id: next?.kind === 'member' ? next.id : null,
                                      guest_id: next?.kind === 'guest' ? next.id : null,
                                    },
                                  })
                                }
                              />
                            ) : session.guest ? (
                              <AssigneePill
                                name={session.guest.name}
                                initials={session.guest.name
                                  .split(' ')
                                  .map((part) => part.slice(0, 1))
                                  .join('')
                                  .slice(0, 2)
                                  .toUpperCase()}
                              />
                            ) : session.assignee ? (
                              <AssigneePill
                                name={`${session.assignee.first_name} ${session.assignee.last_name}`}
                                initials={initialsOf(
                                  session.assignee.first_name,
                                  session.assignee.last_name,
                                )}
                              />
                            ) : null}

                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => deleteSession.mutate(session.id)}
                                aria-label={`Remove ${session.session_name}`}
                                className="tap shrink-0 rounded-full px-2.5 py-2 text-label-md text-on-surface-faint transition-colors duration-300 ease-[var(--ease-glide)] hover:text-error"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </TimelineCard>
                      </TimelineRow>
                    )
                  })}
                </ul>

                {/*
                  The end of the service, at the end of the running order.
                  A service used to be over only once the clock passed the
                  last session's planned end, which is wrong every time one
                  finishes early — and left the closing session with no way
                  to record how it ran, because nothing came after it.
                */}
                {sessions.length > 0 && (canEdit || endedAt) && (
                  <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-black/5 pt-5 dark:border-white/8">
                    {endedAt ? (
                      <>
                        <span className="text-body-sm text-on-surface-variant">
                          Service ended at{' '}
                          <span className="font-mono text-on-surface">{formatTime(endedAt)}</span>.
                        </span>
                        {isAdmin && !previewing && (
                          <button
                            type="button"
                            onClick={() => endService.mutate(null)}
                            disabled={endService.isPending}
                            className="tap ml-auto rounded-full hairline px-4 py-2 text-body-sm font-medium text-on-surface disabled:opacity-50"
                          >
                            {endService.isPending ? 'Reopening…' : 'Reopen service'}
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="text-body-sm text-on-surface-variant">
                          Closes the running order and records when it really finished.
                        </span>
                        <button
                          type="button"
                          onClick={() => setEndingService(true)}
                          disabled={endService.isPending}
                          className="tap ml-auto rounded-full bg-raised-strong px-4 py-2 text-body-sm font-medium text-on-surface hairline disabled:opacity-50"
                        >
                          End service
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </Tile>

            {/* What the running order adds up to — the number a planner is
                actually managing, and the only one the table never showed. */}
            <div className="flex flex-col gap-5 lg:col-span-4">
              <Tile tone="accent">
                <Eyebrow>Service window</Eyebrow>
                <div className="mt-3 flex flex-wrap items-baseline gap-x-3">
                  <span className="font-mono text-headline-lg tabular">
                    {formatDuration(ranMinutes ?? totalMinutes)}
                  </span>
                  {/* Once the end has been called, the headline number is how
                      long it actually took. Leaving the plan's total there
                      claimed "1h 20m end to end" for a service the same tile
                      said had closed eleven minutes after it opened. */}
                  <span className="text-label-md text-on-surface-variant">
                    {ranMinutes === null ? 'end to end' : 'as it ran'}
                  </span>
                </div>
                <p className="mt-3 text-body-sm text-on-surface-variant">
                  {sessions.length === 0
                    ? 'Add a session to start the clock.'
                    : ranMinutes === null
                      ? `Doors at ${formatTime(sessions[0].start_time)}, closing around ${endsAt}.`
                      : `Doors at ${formatTime(sessions[0].start_time)}, ended at ${endsAt}. Planned for ${formatDuration(totalMinutes)}.`}
                </p>
              </Tile>

              {unassignedSessions.length > 0 && (
                <Panel title="Needs attention" tone="warning">
                  <ul className="flex flex-col gap-2.5">
                    {unassignedSessions.map((session) => (
                      <Row key={session.id} variant="inset">
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 shrink-0 rounded-full bg-accent-orange"
                        />
                        <span className="min-w-0 flex-1 break-words text-body-sm">
                          {session.session_name}
                        </span>
                        <span className="shrink-0 font-mono text-label-sm text-accent-orange-soft">
                          NO LEAD
                        </span>
                      </Row>
                    ))}
                  </ul>
                </Panel>
              )}

              {/* Under Needs attention, because a missing guest is one of
                  the things that puts a session there. */}
              {serviceId && <ServiceGuestsPanel serviceId={serviceId} canManage={canEdit} />}
            </div>
          </div>
        </QueryState>
      </div>
    </QueryState>
  )
}
