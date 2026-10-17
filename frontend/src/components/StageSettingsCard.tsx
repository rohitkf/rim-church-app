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
  addStageArea,
  decideStageTemplateRequest,
  deleteStageArea,
  fetchStageAreas,
  updateStageArea,
  deleteStageTemplate,
  fetchStageTeamAccess,
  fetchStageTemplateRequests,
  fetchStageTemplates,
  personName,
  setStageTeamAccess,
  type AreaDraft,
  type StageArea,
  type StageTeamAccess,
} from '../lib/stage'
import { ActionButton, SectionTile, inputClasses } from './Surface'
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
  const areas = useQuery({ queryKey: [...STAGE_KEY, 'areas'], queryFn: fetchStageAreas })
  const areaName = (id: string) => areas.data?.find((a) => a.id === id)?.name ?? 'an area'

  const areaWrite = useMutation({
    mutationFn: (op: { kind: 'add'; area: AreaDraft } | { kind: 'update'; id: string; patch: Partial<AreaDraft> } | { kind: 'delete'; id: string }) =>
      op.kind === 'add'
        ? addStageArea(op.area, (areas.data ?? []).length)
        : op.kind === 'update'
          ? updateStageArea(op.id, op.patch)
          : deleteStageArea(op.id),
    onSuccess: () => {
      setError(null)
      return queryClient.invalidateQueries({ queryKey: STAGE_KEY })
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not change the areas.')),
  })

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

      <SectionTile title="Areas" hint="The places a session can carry a layout for. Each has its own size and edge labels.">
        <QueryState isLoading={areas.isLoading} error={areas.error}>
          <ul className="flex flex-col gap-2">
            {(areas.data ?? []).map((a) => (
              <AreaRow
                key={a.id}
                area={a}
                busy={areaWrite.isPending}
                onSave={(patch) => areaWrite.mutate({ kind: 'update', id: a.id, patch })}
                onDelete={() =>
                  ask({
                    title: `Delete the area ${a.name}?`,
                    body: 'Every layout and template drawn for it goes too.',
                    onConfirm: () => areaWrite.mutate({ kind: 'delete', id: a.id }),
                  })
                }
              />
            ))}
          </ul>
          <NewArea busy={areaWrite.isPending} onAdd={(area) => areaWrite.mutate({ kind: 'add', area })} />
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
                    {areaName(r.area_id)} · {r.blocks.length} {r.blocks.length === 1 ? 'block' : 'blocks'} · {personName(r.requester)} · {formatRelativeTime(r.requested_at)}
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
                    {areaName(t.area_id)} · {t.blocks.length} {t.blocks.length === 1 ? 'block' : 'blocks'} · {formatRelativeTime(t.updated_at)}
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

/** One area, editable in place: its name, size and the two edge labels. */
function AreaRow({
  area,
  busy,
  onSave,
  onDelete,
}: {
  area: StageArea
  busy: boolean
  onSave: (patch: Partial<AreaDraft>) => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState<AreaDraft>({
    name: area.name,
    width: area.width,
    height: area.height,
    top_label: area.top_label,
    bottom_label: area.bottom_label,
  })
  const changed =
    draft.name !== area.name ||
    draft.width !== area.width ||
    draft.height !== area.height ||
    draft.top_label !== area.top_label ||
    draft.bottom_label !== area.bottom_label
  const field = (key: keyof AreaDraft, label: string, extra: Record<string, unknown> = {}) => (
    <label className="flex flex-col gap-1 text-label-md text-on-surface-variant">
      {label}
      <input
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: typeof draft[key] === 'number' ? Number(e.target.value) || 0 : e.target.value })}
        aria-label={`${area.name}: ${label}`}
        className={`${inputClasses} py-2 text-body-sm`}
        {...extra}
      />
    </label>
  )
  return (
    <li className="rounded-[var(--radius-row)] bg-raised px-4 py-3">
      <div className="grid gap-3 sm:grid-cols-[1.4fr_0.8fr_0.8fr]">
        {field('name', 'Name', { maxLength: 40 })}
        {field('width', 'Width', { type: 'number', min: 400, max: 4000, step: 100 })}
        {field('height', 'Height', { type: 'number', min: 300, max: 4000, step: 100 })}
        {field('top_label', 'Far edge says', { maxLength: 40 })}
        {field('bottom_label', 'Near edge says', { maxLength: 40 })}
        <div className="flex items-end justify-end gap-2">
          <ActionButton size="sm" tone="danger-quiet" onClick={onDelete} disabled={busy}>
            Delete
          </ActionButton>
          <ActionButton size="sm" onClick={() => onSave(draft)} disabled={busy || !changed || !draft.name.trim()}>
            Save
          </ActionButton>
        </div>
      </div>
    </li>
  )
}

function NewArea({ busy, onAdd }: { busy: boolean; onAdd: (area: AreaDraft) => void }) {
  const [name, setName] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return
        onAdd({ name: name.trim(), width: 1200, height: 700, top_label: 'Back', bottom_label: 'Front' })
        setName('')
      }}
      className="mt-3 flex gap-2"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        placeholder="New area, e.g. Foyer"
        aria-label="New area name"
        className={`${inputClasses} min-w-0 flex-1`}
      />
      <ActionButton type="submit" disabled={busy || !name.trim()}>
        Add area
      </ActionButton>
    </form>
  )
}
