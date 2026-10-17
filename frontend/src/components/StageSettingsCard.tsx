import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchDepartments } from '../lib/queries'
import { useErrorText } from '../lib/useErrorText'
import { useSettingsDraft } from '../lib/useSettingsDraft'
import { DEFAULT_SETTINGS, WEEKDAY_NAMES } from '../lib/appSettings'
import { showToast } from '../lib/toast'
import {
  PRIVILEGES,
  STAGE_KEY,
  decideStageTemplateRequest,
  deleteStageTemplate,
  fetchStageTeamAccess,
  fetchStageTemplateRequests,
  fetchStageTemplates,
  personName,
  setStageTeamAccess,
  type StageTeamAccess,
} from '../lib/stage'
import { ActionButton, SectionTile } from './Surface'
import { Select } from './Select'
import { QueryState } from './QueryState'
import { InlineRow, SaveBar, SettingList } from './SettingRows'
import { TeamMark } from './TeamMark'
import { useConfirmAction } from './ConfirmAction'
import { formatRelativeTime } from '../lib/relativeTime'

/**
 * Settings › Stage layout.
 *
 * Three things, in the order an Admin wants them: which teams may work
 * on the stage and what each may do (a tick per privilege per team), the
 * template asks waiting for an answer, and when layouts clear.
 *
 * Privileges are per team rather than per profile because that is how
 * the question is asked — "can the worship team move things?" — and the
 * database reads the same rows (`stage_may`, 0155).
 */

const KEYS = ['stage_clear_dow', 'stage_clear_hour'] as const

const blank = (department_id: string): StageTeamAccess => ({
  department_id,
  can_add: false,
  can_edit: false,
  can_delete: false,
  can_comment: false,
  can_templates: false,
})

export function StageSettingsCard() {
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const { ask, dialog } = useConfirmAction()
  const room = useSettingsDraft(KEYS)
  const [error, setError] = useState<string | null>(null)

  const teams = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  const access = useQuery({ queryKey: [...STAGE_KEY, 'team-access'], queryFn: fetchStageTeamAccess })
  const requests = useQuery({ queryKey: [...STAGE_KEY, 'requests'], queryFn: fetchStageTemplateRequests })
  const templates = useQuery({ queryKey: [...STAGE_KEY, 'templates'], queryFn: fetchStageTemplates })

  // The grid as drawn: what is stored, with every team present.
  const [draft, setDraft] = useState<Record<string, StageTeamAccess> | null>(null)
  useEffect(() => {
    if (!access.data) return
    setDraft(Object.fromEntries(access.data.map((a) => [a.department_id, a])))
  }, [access.data])

  const rowFor = (id: string) => draft?.[id] ?? blank(id)
  const stored = useMemo(() => Object.fromEntries((access.data ?? []).map((a) => [a.department_id, a])), [access.data])
  const gridChanged = useMemo(() => {
    if (!draft) return false
    const ids = new Set([...Object.keys(draft), ...Object.keys(stored)])
    return [...ids].some((id) => JSON.stringify(draft[id] ?? blank(id)) !== JSON.stringify(stored[id] ?? blank(id)))
  }, [draft, stored])

  const toggle = (id: string, column: keyof StageTeamAccess) =>
    setDraft((d) => {
      const row = { ...(d?.[id] ?? blank(id)) }
      ;(row as Record<string, unknown>)[column] = !row[column]
      return { ...(d ?? {}), [id]: row }
    })

  const saveGrid = useMutation({
    mutationFn: async () => {
      if (!draft) return
      const any = (r: StageTeamAccess) => PRIVILEGES.some((p) => r[p.column] === true)
      const rows = Object.values(draft).filter(any)
      const remove = Object.keys(stored).filter((id) => !draft[id] || !any(draft[id]))
      await setStageTeamAccess(rows, remove)
    },
    onSuccess: () => {
      setError(null)
      showToast('Stage access saved')
      return queryClient.invalidateQueries({ queryKey: STAGE_KEY })
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not save who may draw.')),
  })

  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => decideStageTemplateRequest(id, approve),
    onSuccess: (_r, { approve }) => {
      showToast(approve ? 'Template added' : 'Request declined')
      return queryClient.invalidateQueries({ queryKey: STAGE_KEY })
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not answer that request.')),
  })

  const removeTemplate = useMutation({
    mutationFn: deleteStageTemplate,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STAGE_KEY }),
    onError: (err: unknown) => setError(errorText(err, 'Could not delete the template.')),
  })

  const pending = (requests.data ?? []).filter((r) => r.status === 'pending')
  const weekdayOptions = [{ value: 'never', label: 'Never' }, ...WEEKDAY_NAMES.map((name, dow) => ({ value: String(dow), label: name }))]
  const hourOptions = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, '0')}:00` }))

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      <SectionTile
        title="Who may draw"
        hint="Everybody signed in can look. Tick what each team may do. Admins and the Owner always may."
      >
        <QueryState isLoading={teams.isLoading || access.isLoading} error={teams.error ?? access.error} isEmpty={(teams.data ?? []).length === 0} emptyMessage="No teams yet.">
          <ul className="flex flex-col gap-2">
            {(teams.data ?? []).map((team) => {
              const row = rowFor(team.id)
              return (
                <li key={team.id} className="rounded-[var(--radius-row)] bg-raised px-4 py-3">
                  <span className="flex items-center gap-2 text-body-sm font-medium text-on-surface">
                    <TeamMark color={team.color} />
                    {team.name}
                  </span>
                  <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-2">
                    {PRIVILEGES.map((p) => (
                      <label key={p.key} className="flex items-center gap-2 text-body-sm text-on-surface" title={p.blurb}>
                        <input
                          type="checkbox"
                          checked={row[p.column] === true}
                          onChange={() => toggle(team.id, p.column)}
                          aria-label={`${team.name}: ${p.label}`}
                        />
                        {p.label}
                      </label>
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
          <ul className="mt-3 flex flex-col gap-1 text-label-md text-on-surface-variant">
            {PRIVILEGES.map((p) => (
              <li key={p.key}>
                <span className="font-medium text-on-surface">{p.label}</span> — {p.blurb}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center gap-3">
            <ActionButton onClick={() => saveGrid.mutate()} disabled={!gridChanged || saveGrid.isPending}>
              {saveGrid.isPending ? 'Saving…' : 'Save who may draw'}
            </ActionButton>
            {gridChanged && <span className="text-label-md text-on-surface-faint">Unsaved changes</span>}
          </div>
        </QueryState>
      </SectionTile>

      <SectionTile
        title="Template requests"
        hint="A layout somebody asked to keep. Yes puts it in the library; the asker is told either way."
        aside={pending.length > 0 ? <span className="rounded-full bg-accent-orange/15 px-2.5 py-1 font-mono text-label-sm text-accent-orange">{pending.length} waiting</span> : undefined}
      >
        <QueryState isLoading={requests.isLoading} error={requests.error} isEmpty={pending.length === 0} emptyMessage="Nothing waiting.">
          <ul className="flex flex-col gap-2">
            {pending.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-[var(--radius-row)] bg-raised px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-body-sm font-medium text-on-surface">{r.name}</span>
                  <span className="block font-mono text-label-sm text-on-surface-faint">
                    {r.blocks.length} {r.blocks.length === 1 ? 'block' : 'blocks'} · {personName(r.requester)} · {formatRelativeTime(r.requested_at)}
                  </span>
                </span>
                <ActionButton size="sm" onClick={() => decide.mutate({ id: r.id, approve: true })} disabled={decide.isPending}>
                  Approve
                </ActionButton>
                <ActionButton size="sm" tone="quiet" onClick={() => decide.mutate({ id: r.id, approve: false })} disabled={decide.isPending}>
                  Decline
                </ActionButton>
              </li>
            ))}
          </ul>
        </QueryState>
      </SectionTile>

      <SectionTile title="Template library" hint="Kept until somebody deletes them. They are never cleared with the layouts.">
        <QueryState isLoading={templates.isLoading} error={templates.error} isEmpty={(templates.data ?? []).length === 0} emptyMessage="No templates yet. Keep one from any stage layout.">
          <ul className="flex flex-col gap-2">
            {(templates.data ?? []).map((t) => (
              <li key={t.id} className="flex items-center gap-3 rounded-[var(--radius-row)] bg-raised px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-body-sm font-medium text-on-surface">{t.name}</span>
                  <span className="block font-mono text-label-sm text-on-surface-faint">
                    {t.blocks.length} {t.blocks.length === 1 ? 'block' : 'blocks'} · {formatRelativeTime(t.updated_at)}
                  </span>
                </span>
                <ActionButton
                  size="sm"
                  tone="danger-quiet"
                  onClick={() =>
                    ask({
                      title: `Delete the template ${t.name}?`,
                      body: 'Layouts already drawn from it are not touched.',
                      onConfirm: () => removeTemplate.mutate(t.id),
                    })
                  }
                >
                  Delete
                </ActionButton>
              </li>
            ))}
          </ul>
        </QueryState>
      </SectionTile>

      <SectionTile title="When layouts clear" hint="In the church’s own time. Only layouts of services already held; templates stay.">
        <QueryState isLoading={room.query.isLoading} error={room.query.error}>
          {room.draft && (
            <>
              <SettingList>
                <InlineRow
                  label="Layouts clear every"
                  summary="The day the stages of held services are wiped."
                  changed={room.differs('stage_clear_dow')}
                  help="On this day, at the hour below, every stage layout whose service date has passed is deleted with its comments and its history. Layouts for services still to come are never touched, and templates never are. Never leaves them to go with their service on the Services clock."
                  affects={['Stage Layout']}
                  defaultText={WEEKDAY_NAMES[DEFAULT_SETTINGS.stage_clear_dow ?? 2]}
                >
                  <Select
                    value={room.draft.stage_clear_dow === null ? 'never' : String(room.draft.stage_clear_dow)}
                    onChange={(v) => room.set('stage_clear_dow', v === 'never' ? null : Number(v))}
                    aria-label="Day stage layouts clear"
                    options={weekdayOptions}
                  />
                </InlineRow>
                {room.draft.stage_clear_dow !== null && (
                  <InlineRow
                    label="At"
                    summary="The hour, in the church’s timezone."
                    changed={room.differs('stage_clear_hour')}
                    help="The job runs once an hour and acts in this one. Early morning keeps it clear of anybody still drawing late on the day before."
                    affects={['Stage Layout']}
                    defaultText={`${String(DEFAULT_SETTINGS.stage_clear_hour).padStart(2, '0')}:00`}
                  >
                    <Select
                      value={String(room.draft.stage_clear_hour)}
                      onChange={(v) => room.set('stage_clear_hour', Number(v))}
                      aria-label="Hour stage layouts clear"
                      options={hourOptions}
                    />
                  </InlineRow>
                )}
              </SettingList>
              <SaveBar
                changed={room.changed}
                saving={room.saving}
                saved={room.saved}
                error={room.error}
                onSave={room.save}
                onRestore={room.restoreDefaults}
              />
            </>
          )}
        </QueryState>
      </SectionTile>
      {dialog}
    </div>
  )
}
