import { type FormEvent, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { usePermissions } from '../lib/usePermissions'
import { QueryState } from '../components/QueryState'
import { NumberDialField } from '../components/NumberDial'
import { TimeField } from '../components/DateTimeFields'
import { PageHeader } from '../components/Surface'
import { fetchServiceTemplates, fetchTemplateSessions } from '../lib/queries'
import { isTemplateFormDirty, type TemplateFormState } from '../lib/formDirty'
import { UnsavedChangesDialog, useUnsavedChangesGuard } from '../components/UnsavedChangesGuard'
import type { ServiceTemplate } from '../lib/types'
import { useErrorText } from '../lib/useErrorText'
import { useConfirmAction } from '../components/ConfirmAction'
import { Select } from '../components/Select'
import { todayIso } from '../lib/monthGrid'

interface SessionDraft {
  session_name: string
  duration_minutes: number
}

const emptyDraft: SessionDraft = { session_name: '', duration_minutes: 5 }

/** What saving does to the services a repeat already made from this template (0222). */
type Upcoming = 'keep' | 'all' | 'none'
const UPCOMING_CHOICES: { value: Upcoming; label: string }[] = [
  { value: 'keep', label: 'Update them, keeping changes made to one by hand' },
  { value: 'all', label: 'Update them all to match exactly' },
  { value: 'none', label: 'Leave them as they are' },
]

const saveResult = z.object({ id: z.string(), updated: z.number(), kept: z.number(), untouched: z.number() })

/** How many services still to come were made from this template by a repeat. */
async function countUpcomingFromTemplate(templateId: string): Promise<number> {
  const series = await supabase.from('service_series').select('id').eq('template_id', templateId)
  if (series.error) throw series.error
  const ids = (series.data ?? []).map((r) => r.id as string)
  if (ids.length === 0) return 0
  const { count, error } = await supabase
    .from('services')
    .select('id', { count: 'exact', head: true })
    .in('series_id', ids)
    .gte('date', todayIso())
  if (error) throw error
  return count ?? 0
}

function savedText(r: z.infer<typeof saveResult>): string {
  const services = (n: number) => `${n} upcoming ${n === 1 ? 'service' : 'services'}`
  const parts = [`Saved. ${r.updated > 0 ? `${services(r.updated)} updated.` : 'No upcoming service needed changing.'}`]
  if (r.kept > 0) parts.push(`${r.kept === 1 ? 'One' : r.kept} kept ${r.kept === 1 ? 'its' : 'their'} own changes where ${r.kept === 1 ? 'it was' : 'they were'} edited by hand.`)
  if (r.untouched > 0) parts.push(`${services(r.untouched)} already under way or not yours to plan ${r.untouched === 1 ? 'was' : 'were'} left alone.`)
  return parts.join(' ')
}

function formatTotal(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function ServiceTemplatesPage() {
  // Building templates is the church's to grant (Settings › Access & Privileges).
  const mayTemplates = usePermissions().can('svc.templates')
  const errorText = useErrorText()
  const queryClient = useQueryClient()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [startTime, setStartTime] = useState('10:00')
  const [drafts, setDrafts] = useState<SessionDraft[]>([{ ...emptyDraft }])
  const [formError, setFormError] = useState<string | null>(null)
  const [upcoming, setUpcoming] = useState<Upcoming>('keep')
  const [savedNote, setSavedNote] = useState<string | null>(null)
  // What the form looked like when it was last loaded or saved — anything
  // that differs from this is an unsaved edit worth warning about.
  const [baseline, setBaseline] = useState<TemplateFormState>({ name: '', startTime: '10:00', sessions: [] })

  const templatesQuery = useQuery({ queryKey: ['service-templates'], queryFn: fetchServiceTemplates })
  const upcomingQuery = useQuery({
    queryKey: ['template-upcoming', editingId],
    queryFn: () => countUpcomingFromTemplate(editingId!),
    enabled: !!editingId,
  })
  const upcomingCount = editingId ? (upcomingQuery.data ?? 0) : 0

  const isDirty = isTemplateFormDirty({ name, startTime, sessions: drafts }, baseline)
  const { blocker } = useUnsavedChangesGuard(isDirty)

  function resetForm() {
    setEditingId(null)
    setName('')
    setStartTime('10:00')
    setDrafts([{ ...emptyDraft }])
    setFormError(null)
    setBaseline({ name: '', startTime: '10:00', sessions: [] })
    setUpcoming('keep')
  }

  const saveTemplate = useMutation({
    // One call (0222): the template, its sessions, and the upcoming
    // services a repeat made from it, as the choice below says.
    mutationFn: async () => {
      const sessions = drafts
        .filter((d) => d.session_name.trim())
        .map((d) => ({ session_name: d.session_name.trim(), duration_minutes: d.duration_minutes }))
      const { data, error } = await supabase.rpc('save_service_template', {
        p_id: editingId,
        p_name: name.trim(),
        p_start: startTime,
        p_sessions: sessions,
        p_upcoming: upcomingCount > 0 ? upcoming : 'none',
      })
      if (error) throw error
      return { result: saveResult.parse(data), edited: !!editingId && upcomingCount > 0 && upcoming !== 'none' }
    },
    onSuccess: ({ result, edited }) => {
      resetForm()
      setSavedNote(edited ? savedText(result) : null)
      queryClient.invalidateQueries({ queryKey: ['service-templates'] })
      if (edited) queryClient.invalidateQueries()
    },
    onError: (err: unknown) => setFormError(errorText(err, 'Could not save template.')),
  })

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('service_templates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, id) => {
      if (id === editingId) resetForm()
      queryClient.invalidateQueries({ queryKey: ['service-templates'] })
    },
  })

  async function startEditing(template: ServiceTemplate) {
    const sessions = await fetchTemplateSessions(template.id)
    const loaded = sessions.map((s) => ({
      session_name: s.session_name,
      duration_minutes: s.duration_minutes,
    }))
    setEditingId(template.id)
    setName(template.name)
    setStartTime(template.start_time.slice(0, 5))
    setDrafts(loaded.length > 0 ? loaded : [{ ...emptyDraft }])
    setBaseline({ name: template.name, startTime: template.start_time.slice(0, 5), sessions: loaded })
    setFormError(null)
    setSavedNote(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const { ask, dialog } = useConfirmAction()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || drafts.every((d) => !d.session_name.trim())) {
      setFormError('Give the template a name and at least one session.')
      return
    }
    setFormError(null)
    saveTemplate.mutate()
  }

  if (!mayTemplates) return <Navigate to="/service-planner" replace />

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/service-planner" className="tap inline-flex items-center text-body-sm text-accent-blue-soft">
        ← Back to Service Planner
      </Link>
      <PageHeader
        eyebrow="Reusable running orders"
        title="Service Templates"
        description="A template is the usual shape of a service — its start time and the sessions that always happen. Pick one when creating a service and the whole running order is pre-filled, ready to tweak."
      />

      <form onSubmit={handleSubmit} className="mt-6 rounded-[var(--radius-card)] bg-surface-lowest hairline p-6">
        <h2 className="text-headline-md">{editingId ? 'Edit template' : 'Create template'}</h2>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-1 flex-col gap-1 text-body-sm text-on-surface-variant">
            Template name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="English Sunday service"
              className="rounded-full hairline px-3 py-2 text-body-md text-on-surface focus:border-2 focus:border-secondary focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-body-sm text-on-surface-variant">
            First session starts
            <TimeField
              value={startTime}
              onChange={setStartTime}
              label="First session starts"
              className="tap inline-flex items-center gap-2 rounded-full hairline px-3 py-2 text-body-md text-on-surface"
            />
          </label>
        </div>

        <div className="mt-5 font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">Sessions</div>
        <ul className="mt-2 flex flex-col gap-2">
          {drafts.map((d, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-right font-mono text-label-sm text-on-surface-variant">{i + 1}.</span>
              <input
                value={d.session_name}
                onChange={(e) =>
                  setDrafts(drafts.map((x, j) => (j === i ? { ...x, session_name: e.target.value } : x)))
                }
                placeholder="Worship, Sermon, Announcements…"
                className="min-w-0 flex-1 rounded-full hairline px-3 py-2 text-body-md text-on-surface focus:border-2 focus:border-secondary focus:outline-none"
              />
              <NumberDialField
                value={d.duration_minutes}
                onChange={(next) =>
                  setDrafts(drafts.map((x, j) => (j === i ? { ...x, duration_minutes: next } : x)))
                }
                min={0}
                max={180}
                majorEvery={5}
                unit="min"
                label={`Duration of session ${i + 1} in minutes`}
              />
              <button
                type="button"
                onClick={() => setDrafts(drafts.length > 1 ? drafts.filter((_, j) => j !== i) : [{ ...emptyDraft }])}
                aria-label={`Remove session ${i + 1}`}
                className="tap-square shrink-0 px-1 text-body-sm text-error hover:underline"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setDrafts([...drafts, { ...emptyDraft }])}
            className="tap inline-flex items-center text-body-sm font-medium text-accent-blue-soft hover:underline"
          >
            + Add session
          </button>
          <span className="font-mono text-label-sm text-on-surface-variant">
            Total: {formatTotal(drafts.reduce((sum, d) => sum + (d.session_name.trim() ? d.duration_minutes : 0), 0))}
          </span>
        </div>

        {upcomingCount > 0 && (
          <div className="mt-4">
            <p className="text-body-sm font-medium text-on-surface">
              {upcomingCount === 1 ? 'One upcoming service was' : `${upcomingCount} upcoming services were`} made from this
              template by a repeat
            </p>
            <Select
              aria-label="What saving does to the upcoming services"
              value={upcoming}
              onChange={(v) => setUpcoming(v as Upcoming)}
              options={UPCOMING_CHOICES}
              className="mt-1.5 sm:max-w-md"
            />
            <p className="mt-1 text-label-md text-on-surface-faint">
              A service already under way is never changed. People assigned to a session stay assigned.
            </p>
          </div>
        )}

        {formError && (
          <p className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
            {formError}
          </p>
        )}
        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={saveTemplate.isPending}
            className="rounded-full bg-primary px-4 py-2.5 text-body-sm font-semibold text-on-primary hover:opacity-90 disabled:opacity-50"
          >
            {saveTemplate.isPending ? 'Saving…' : editingId ? 'Save changes' : 'Create template'}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="text-body-sm text-on-surface-variant hover:underline">
              Cancel editing
            </button>
          )}
        </div>
        {savedNote && (
          <p role="status" className="mt-3 text-body-sm text-on-surface-variant">
            {savedNote}
          </p>
        )}
      </form>

      <section className="mt-8">
        <h2 className="text-headline-md">Your templates</h2>
        <QueryState
          isLoading={templatesQuery.isLoading}
          error={templatesQuery.error}
          isEmpty={templatesQuery.data?.length === 0}
          emptyMessage="No templates yet — create your first one above."
        >
          <ul className="mt-3 flex flex-col gap-3">
            {templatesQuery.data?.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-4 rounded-[var(--radius-card)] bg-surface-lowest hairline p-4"
              >
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-medium text-on-surface">{t.name}</span>
                  <span className="block text-body-sm text-on-surface-variant">
                    First session at {t.start_time.slice(0, 5)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => startEditing(t)}
                  className="shrink-0 text-body-sm font-medium text-accent-blue-soft hover:underline"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() =>
                    ask({
                      title: `Delete the template ${t.name}?`,
                      body: 'Services already built from it are untouched — only the template goes.',
                      onConfirm: () => deleteTemplate.mutate(t.id),
                    })
                  }
                  disabled={deleteTemplate.isPending}
                  className="shrink-0 text-body-sm text-error hover:underline disabled:opacity-50"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </QueryState>
      </section>

      <UnsavedChangesDialog
        blocker={blocker}
        message="This template hasn’t been saved yet. Leaving now discards it."
      />

      {dialog}
    </div>
  )
}
