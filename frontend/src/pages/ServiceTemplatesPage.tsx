import { type FormEvent, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { PageHeader } from '../components/Surface'
import { fetchServiceTemplates, fetchTemplateSessions } from '../lib/queries'
import { isTemplateFormDirty, type TemplateFormState } from '../lib/formDirty'
import { UnsavedChangesDialog, useUnsavedChangesGuard } from '../components/UnsavedChangesGuard'
import type { ServiceTemplate } from '../lib/types'
import { useErrorText } from '../lib/useErrorText'

interface SessionDraft {
  session_name: string
  duration_minutes: number
}

const emptyDraft: SessionDraft = { session_name: '', duration_minutes: 5 }

function formatTotal(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function ServiceTemplatesPage() {
  const { isAdmin } = useAuth()
  const errorText = useErrorText()
  const queryClient = useQueryClient()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [startTime, setStartTime] = useState('10:00')
  const [drafts, setDrafts] = useState<SessionDraft[]>([{ ...emptyDraft }])
  const [formError, setFormError] = useState<string | null>(null)
  // What the form looked like when it was last loaded or saved — anything
  // that differs from this is an unsaved edit worth warning about.
  const [baseline, setBaseline] = useState<TemplateFormState>({ name: '', startTime: '10:00', sessions: [] })

  const templatesQuery = useQuery({ queryKey: ['service-templates'], queryFn: fetchServiceTemplates })

  const isDirty = isTemplateFormDirty({ name, startTime, sessions: drafts }, baseline)
  const { blocker } = useUnsavedChangesGuard(isDirty)

  function resetForm() {
    setEditingId(null)
    setName('')
    setStartTime('10:00')
    setDrafts([{ ...emptyDraft }])
    setFormError(null)
    setBaseline({ name: '', startTime: '10:00', sessions: [] })
  }

  const saveTemplate = useMutation({
    mutationFn: async () => {
      const sessions = drafts.filter((d) => d.session_name.trim())
      let templateId = editingId
      if (templateId) {
        const { error } = await supabase
          .from('service_templates')
          .update({ name: name.trim(), start_time: startTime })
          .eq('id', templateId)
        if (error) throw error
        // Replace the whole session list — simpler and safer than diffing.
        const { error: clearError } = await supabase
          .from('service_template_sessions')
          .delete()
          .eq('template_id', templateId)
        if (clearError) throw clearError
      } else {
        const { data, error } = await supabase
          .from('service_templates')
          .insert({ name: name.trim(), start_time: startTime })
          .select()
          .single()
        if (error) throw error
        templateId = z.object({ id: z.string() }).parse(data).id
      }
      const { error: sessionsError } = await supabase.from('service_template_sessions').insert(
        sessions.map((d, i) => ({
          template_id: templateId,
          order_index: i + 1,
          session_name: d.session_name.trim(),
          duration_minutes: d.duration_minutes,
        })),
      )
      if (sessionsError) throw sessionsError
    },
    onSuccess: () => {
      resetForm()
      queryClient.invalidateQueries({ queryKey: ['service-templates'] })
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
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || drafts.every((d) => !d.session_name.trim())) {
      setFormError('Give the template a name and at least one session.')
      return
    }
    setFormError(null)
    saveTemplate.mutate()
  }

  if (!isAdmin) return <Navigate to="/service-planner" replace />

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/service-planner" className="tap inline-flex items-center text-body-sm text-secondary">
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
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="tap rounded-full hairline px-3 py-2 text-body-md text-on-surface"
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
              <input
                type="number"
                min={0}
                value={d.duration_minutes}
                onChange={(e) =>
                  setDrafts(
                    drafts.map((x, j) => (j === i ? { ...x, duration_minutes: Number(e.target.value) || 0 } : x)),
                  )
                }
                aria-label="Duration in minutes"
                className="tap w-20 rounded-full hairline px-3 py-2 text-body-md text-on-surface"
              />
              <span className="text-body-sm text-on-surface-variant">min</span>
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
            className="tap inline-flex items-center text-body-sm font-medium text-secondary hover:underline"
          >
            + Add session
          </button>
          <span className="font-mono text-label-sm text-on-surface-variant">
            Total: {formatTotal(drafts.reduce((sum, d) => sum + (d.session_name.trim() ? d.duration_minutes : 0), 0))}
          </span>
        </div>

        {formError && (
          <p className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
            {formError}
          </p>
        )}
        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={saveTemplate.isPending}
            className="rounded-full bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
          >
            {saveTemplate.isPending ? 'Saving…' : editingId ? 'Save changes' : 'Create template'}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="text-body-sm text-on-surface-variant hover:underline">
              Cancel editing
            </button>
          )}
        </div>
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
                  className="shrink-0 text-body-sm font-medium text-secondary hover:underline"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => deleteTemplate.mutate(t.id)}
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
    </div>
  )
}
