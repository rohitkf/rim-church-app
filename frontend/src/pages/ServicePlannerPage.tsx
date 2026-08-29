import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { LeadPicker, type LeadOption } from '../components/LeadPicker'
import { serviceStanding } from '../lib/serviceState'
import { ServiceGuestsPanel, fetchServiceGuests } from '../components/ServiceGuestsPanel'
import { QueryState } from '../components/QueryState'
import { Eyebrow, Panel, Row, Tile } from '../components/Surface'
import { AssigneePill, TimelineCard, TimelineRow } from '../components/Timeline'
import { initialsOf } from '../lib/initials'
import { addMinutesIso, combineDateAndTime, formatTime, timeInputValue } from '../lib/time'
import { formatDuration } from '../lib/duration'
import { overrunMinutes, serviceProgress, startableSession } from '../lib/serviceProgress'
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
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const errorText = useErrorText()
  const queryClient = useQueryClient()

  // Planning a service is an Admin action: Service Flow is a department
  // like any other, not a role scoped to one service.
  const canManage = isAdmin

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

  const updateField = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ServiceSessionRow> }) => {
      const { error } = await supabase.from('service_sessions').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: (err: unknown) =>
      setServiceError(errorText(err, 'Could not save that change.')),
  })

  /**
   * "This is starting now."
   *
   * A session overruns and everything after it is wrong. Rather than making
   * someone re-type six start times, the Admin says which session is
   * actually beginning: that one takes the current time and every session
   * after it cascades off it. Nothing extra is recorded — the previous
   * session's overrun is simply the gap this opens between when it was due
   * to end and when the next one really began.
   */
  const startSessionNow = useMutation({
    mutationFn: async (sessionId: string) => {
      const current = await fetchSessions(serviceId!)
      const index = current.findIndex((s) => s.id === sessionId)
      if (index < 0) return

      // To the minute: seconds in a running order are noise, and a start of
      // 10:06 reads as a decision where 10:06:43 reads as a machine.
      const startedAt = new Date()
      startedAt.setSeconds(0, 0)

      let cursor = startedAt.toISOString()
      for (let i = index; i < current.length; i++) {
        const session = current[i]
        if (session.start_time !== cursor) {
          const { error } = await supabase
            .from('service_sessions')
            .update({ start_time: cursor })
            .eq('id', session.id)
          if (error) throw error
        }
        cursor = addMinutesIso(cursor, session.duration_minutes)
      }
    },
    onSuccess: () => {
      setServiceError(null)
      return invalidate()
    },
    onError: (err: unknown) =>
      setServiceError(errorText(err, 'Could not start that session.')),
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
  const overruns = useMemo(() => overrunMinutes(sessions), [sessions])
  const startable = useMemo(() => startableSession(sessions, now), [sessions, now])
  // What the running order adds up to, and what has nobody on it — the two
  // things a planner is actually managing, neither of which a table showed.
  const totalMinutes = sessions.reduce((n, session) => n + session.duration_minutes, 0)
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
  const finished = serviceStanding(sessions, clock).state === 'done'

  /*
   * Editing stops when the service does.
   *
   * Once the last session's end has passed, the running order is no longer
   * a plan — it is what happened. Changing it then is almost always a
   * mistake (the wrong service opened, a stray tap on a phone in a
   * pocket), and the cost of the mistake is a record of a Sunday that
   * quietly stops matching the Sunday.
   *
   * The database refuses these writes too, so this is not the lock — it
   * only saves someone the round trip and an error message about a button
   * that should not have been there.
   */
  const canEdit = canManage && !finished

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

  const unassignedSessions = sessions.filter(
    (session) => !session.assigned_user_id && !session.guest_id,
  )
  const endsAt =
    sessions.length > 0
      ? formatTime(addMinutesIso(sessions[0].start_time, totalMinutes))
      : null

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
                <input
                  key={serviceQuery.data?.service_type}
                  defaultValue={serviceQuery.data?.service_type}
                  aria-label="Service name"
                  onBlur={(e) => {
                    const value = e.target.value.trim()
                    if (!value || value === serviceQuery.data?.service_type) return
                    updateService.mutate({ service_type: value })
                  }}
                  /* Block, not inline: two inline inputs sat on one line and
                     the name ran straight into the date. */
                  className="block w-full max-w-xl rounded-[var(--radius-chip)] border-0 bg-transparent px-2 py-1 -ml-2 text-headline-lg text-on-surface transition-colors duration-300 ease-[var(--ease-glide)] hover:bg-raised focus:bg-raised focus:outline-none sm:text-headline-xl"
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
          {isAdmin && (
            /* Four buttons come to 517px, and `shrink-0` meant they ran
               off the side of a phone rather than wrapping. They wrap
               here and stay one row from `sm`, where they fit. */
            <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
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
            </div>
          )}
        </div>

        {/* A page with its controls quietly missing reads as broken. Say
            what happened and that nothing is lost. */}
        {finished && (
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-card)] bg-[color-mix(in_oklab,var(--color-accent-green)_8%,var(--color-surface-lowest))] px-4 py-3 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent-green)_24%,transparent)]">
            <span className="font-mono text-label-sm uppercase tracking-wide text-accent-green">
              Finished
            </span>
            <span className="text-body-sm text-on-surface-variant">
              This service is over, so the running order is now a record of it and can&rsquo;t be
              changed.
            </span>
            {isAdmin && (
              <span className="text-label-md text-on-surface-faint">
                Attendance and checklists can still be filled in.
              </span>
            )}
          </div>
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
                  {sessions.map((session, idx) => {
                    const isFirst = idx === 0
                    const unassigned = !session.assigned_user_id && !session.guest_id
                    const timing = progress.byId.get(session.id)
                    const running = progress.runningId === session.id
                    const over = overruns.get(session.id)
                    // Only an Admin can say a service has slipped, and only
                    // on the session the service is waiting to begin.
                    const canStart = canEdit && isAdmin && startable === session.id
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
                        className="w-full rounded-full bg-raised-strong px-2 py-1 text-right font-mono text-label-md text-on-surface hairline [color-scheme:dark]"
                      />
                    )
                    return (
                      <TimelineRow
                        key={`${session.id}-${session.updated_at}`}
                        last={idx === sessions.length - 1}
                        fill={timing?.fill}
                        running={running}
                        tone={unassigned ? 'warning' : isFirst ? 'now' : 'plain'}
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
                              <input
                                type="number"
                                min={0}
                                aria-label={`${session.session_name} duration in minutes`}
                                defaultValue={session.duration_minutes}
                                onBlur={(e) => {
                                  const value = Number(e.target.value)
                                  if (Number.isNaN(value) || value === session.duration_minutes) return
                                  updateField.mutate({
                                    id: session.id,
                                    patch: { duration_minutes: value },
                                  })
                                }}
                                className="w-14 rounded-full bg-raised px-1.5 py-0.5 text-right font-mono text-label-sm text-on-surface-variant"
                              />
                              {/* The unit stays outside the field: a number
                                  input with "min" in it is a number input
                                  people try to type "min" into. */}
                              <span className="font-mono text-label-sm text-on-surface-faint">min</span>
                            </span>
                          ) : (
                            `${session.duration_minutes} min`
                          )
                        }
                        over={over}
                      >
                        {/* Nobody on it still outranks "on now": an empty
                            session is the thing that needs a person. */}
                        <TimelineCard tone={unassigned ? 'warning' : running ? 'running' : 'plain'}>
                          {canStart && (
                            <div className="mb-3">
                              <button
                                type="button"
                                onClick={() => startSessionNow.mutate(session.id)}
                                disabled={startSessionNow.isPending}
                                className="tap rounded-full bg-accent-green px-3.5 py-1.5 text-label-md font-medium text-accent-green-ink transition-transform duration-500 ease-[var(--ease-glide)] active:scale-[0.98] disabled:opacity-50"
                              >
                                {startSessionNow.isPending ? 'Starting…' : 'Session started'}
                              </button>
                              <span className="mt-1.5 block text-label-sm text-on-surface-faint sm:ml-2.5 sm:mt-0 sm:inline">
                                Sets this to now and moves everything after it.
                              </span>
                            </div>
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
                              {canEdit ? (
                                <input
                                  defaultValue={session.session_name}
                                  aria-label="Session name"
                                  onBlur={(e) => {
                                    if (!e.target.value.trim() || e.target.value === session.session_name)
                                      return
                                    updateField.mutate({
                                      id: session.id,
                                      patch: { session_name: e.target.value.trim() },
                                    })
                                  }}
                                  className="w-full rounded-[var(--radius-chip)] bg-transparent px-2 py-1 -ml-2 text-headline-sm text-on-surface transition-shadow duration-300 ease-[var(--ease-glide)] hover:bg-raised focus:bg-raised focus:outline-none"
                                />
                              ) : (
                                <div className="text-headline-sm">{session.session_name}</div>
                              )}
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
              </div>
            </Tile>

            {/* What the running order adds up to — the number a planner is
                actually managing, and the only one the table never showed. */}
            <div className="flex flex-col gap-5 lg:col-span-4">
              <Tile tone="accent">
                <Eyebrow>Service window</Eyebrow>
                <div className="mt-3 flex flex-wrap items-baseline gap-x-3">
                  <span className="font-mono text-headline-lg tabular">
                    {formatDuration(totalMinutes)}
                  </span>
                  <span className="text-label-md text-on-surface-variant">end to end</span>
                </div>
                <p className="mt-3 text-body-sm text-on-surface-variant">
                  {sessions.length > 0
                    ? `Doors at ${formatTime(sessions[0].start_time)}, closing around ${endsAt}.`
                    : 'Add a session to start the clock.'}
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
                        <span className="min-w-0 flex-1 truncate text-body-sm">
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
