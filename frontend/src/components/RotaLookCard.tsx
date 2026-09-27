import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { useErrorText } from '../lib/useErrorText'
import { SETTINGS_KEY, fetchAppSettings } from '../lib/appSettings'
import {
  ROTA_TAGS_KEY,
  deleteRotaTag,
  reorderRotaTags,
  saveRotaTag,
  tagStyle,
  useRotaTags,
  type RotaTag,
} from '../lib/rotaTags'
import { skyStyle } from '../lib/coordinatorSky'
import { TEAM_COLORS, normaliseHex } from '../lib/teamColors'
import { useConfirmAction } from './ConfirmAction'
import { QueryState } from './QueryState'
import { ActionButton, inputClasses } from './Surface'

/**
 * How the Team Rota looks, in the church's own words and colours: the tags
 * an assignment can carry, and the colour of the Coordinator's row.
 *
 * Everything here is drawn as it will appear before it is saved — a tag's
 * badge on a rota row, the Coordinator's row with its stars — so an Admin
 * picks by looking rather than by imagining a hex code.
 *
 * Colours come from the teams' palette (lib/teamColors.ts): eighteen
 * chosen because they stay legible washed over a dark tile, which a free
 * colour dialog cannot promise.
 */
export function RotaLookCard() {
  const { isAdmin } = useAuth()
  if (!isAdmin) return null
  return (
    <section className="w-full rounded-[var(--radius-card)] bg-surface-lowest hairline p-6">
      <h2 className="text-headline-md">Team Rota</h2>
      <p className="mt-1 text-body-sm text-on-surface-variant">
        The tags a role can carry, and how the Team Coordinator stands out. Everyone sees these on
        the rota; only an Admin changes them.
      </p>
      <div className="mt-6 flex flex-col gap-8">
        <TagsSection />
        <CoordinatorSection />
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ *
 * Tags
 * ------------------------------------------------------------------ */

type Draft = { id?: string; name: string; color: string; shown: boolean; sort_order: number }

function TagsSection() {
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const tagsQuery = useRotaTags()
  const tags = tagsQuery.data ?? []
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { ask, dialog } = useConfirmAction()

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ROTA_TAGS_KEY })
    // The rota embeds each assignment's tags.
    queryClient.invalidateQueries({ queryKey: ['rota'] })
  }

  const save = useMutation({
    mutationFn: saveRotaTag,
    onSuccess: () => {
      setDraft(null)
      setError(null)
      refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not save that tag.')),
  })
  const remove = useMutation({
    mutationFn: deleteRotaTag,
    onSuccess: () => {
      setError(null)
      refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not delete that tag.')),
  })
  const reorder = useMutation({
    mutationFn: reorderRotaTags,
    onSuccess: refresh,
    onError: (err: unknown) => setError(errorText(err, 'Could not move that tag.')),
  })
  const toggleShown = useMutation({
    mutationFn: (tag: RotaTag) => saveRotaTag({ ...tag, shown: !tag.shown }),
    onSuccess: refresh,
    onError: (err: unknown) => setError(errorText(err, 'Could not change that tag.')),
  })

  const move = (index: number, by: -1 | 1) => {
    const ids = tags.map((t) => t.id)
    const [id] = ids.splice(index, 1)
    ids.splice(index + by, 0, id)
    reorder.mutate(ids)
  }

  const clash =
    draft &&
    tags.some(
      (t) => t.id !== draft.id && t.name.trim().toLowerCase() === draft.name.trim().toLowerCase(),
    )

  return (
    <div>
      <div className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
        Tags
      </div>
      <p className="mt-1 text-label-md text-on-surface-faint">
        Offered as chips when a Head assigns a role — “Shadow” for somebody learning it,
        and whatever else your church needs. A role can carry several. A tag is a label, not a
        rule: a shadow is still that person’s one role at the service.
      </p>

      <QueryState isLoading={tagsQuery.isLoading} error={tagsQuery.error}>
        <ul className="mt-4 flex flex-col gap-2" aria-label="Rota tags">
          {tags.length === 0 && (
            <li className="rounded-[var(--radius-chip)] bg-surface-container px-4 py-3 text-body-sm text-on-surface-variant">
              No tags yet. Add the first below.
            </li>
          )}
          {tags.map((tag, i) =>
            draft?.id === tag.id ? (
              <li key={tag.id}>
                <TagEditor
                  draft={draft}
                  onChange={setDraft}
                  onCancel={() => setDraft(null)}
                  onSave={() => save.mutate(draft)}
                  saving={save.isPending}
                  clash={!!clash}
                />
              </li>
            ) : (
              <li
                key={tag.id}
                className={`flex flex-wrap items-center gap-2 rounded-[var(--radius-chip)] bg-surface-container px-3 py-2.5 ${
                  tag.shown ? '' : 'opacity-60'
                }`}
              >
                <TagBadge tag={tag} />
                {!tag.shown && (
                  <span className="font-mono text-label-sm uppercase text-on-surface-faint">Hidden</span>
                )}
                <span className="ml-auto flex flex-wrap items-center gap-1">
                  <IconButton
                    label={`Move ${tag.name} up`}
                    disabled={i === 0 || reorder.isPending}
                    onClick={() => move(i, -1)}
                  >
                    ↑
                  </IconButton>
                  <IconButton
                    label={`Move ${tag.name} down`}
                    disabled={i === tags.length - 1 || reorder.isPending}
                    onClick={() => move(i, 1)}
                  >
                    ↓
                  </IconButton>
                  <ActionButton
                    size="sm"
                    tone="quiet"
                    onClick={() => toggleShown.mutate(tag)}
                    disabled={toggleShown.isPending}
                    aria-label={tag.shown ? `Hide ${tag.name}` : `Show ${tag.name}`}
                  >
                    {tag.shown ? 'Hide' : 'Show'}
                  </ActionButton>
                  <ActionButton
                    size="sm"
                    tone="quiet"
                    onClick={() => setDraft({ ...tag })}
                    aria-label={`Edit ${tag.name}`}
                  >
                    Edit
                  </ActionButton>
                  <ActionButton
                    size="sm"
                    tone="danger-quiet"
                    aria-label={`Delete ${tag.name}`}
                    onClick={() =>
                      ask({
                        title: `Delete the ${tag.name} tag?`,
                        body: 'It comes off every role that carries it, on every service. The roles themselves stay assigned. To keep the record but stop using it, hide it instead.',
                        confirmLabel: 'Delete',
                        onConfirm: () => remove.mutate(tag.id),
                      })
                    }
                  >
                    Delete
                  </ActionButton>
                </span>
              </li>
            ),
          )}
        </ul>

        {draft && !draft.id ? (
          <div className="mt-3">
            <TagEditor
              draft={draft}
              onChange={setDraft}
              onCancel={() => setDraft(null)}
              onSave={() => save.mutate(draft)}
              saving={save.isPending}
              clash={!!clash}
            />
          </div>
        ) : (
          <div className="mt-3">
            <ActionButton
              size="sm"
              tone="quiet"
              glyph="+"
              onClick={() =>
                setDraft({
                  name: '',
                  color: TEAM_COLORS[(tags.length * 5) % TEAM_COLORS.length].hex,
                  shown: true,
                  sort_order: tags.length,
                })
              }
            >
              Add a tag
            </ActionButton>
          </div>
        )}
      </QueryState>

      {error && (
        <p role="alert" className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}
      {dialog}
    </div>
  )
}

function TagEditor({
  draft,
  onChange,
  onCancel,
  onSave,
  saving,
  clash,
}: {
  draft: Draft
  onChange: (d: Draft) => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
  clash: boolean
}) {
  const name = draft.name.trim()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (name && !clash) onSave()
      }}
      className="flex flex-col gap-4 rounded-[var(--radius-chip)] bg-surface-container p-4"
      aria-label={draft.id ? 'Edit tag' : 'New tag'}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-body-sm font-medium text-on-surface">Name</span>
        <input
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value.slice(0, 24) })}
          placeholder="Shadow"
          className={inputClasses}
          autoFocus
        />
        {clash && (
          <span className="text-label-md text-error">There is already a tag called that.</span>
        )}
      </label>

      <ColorSwatches
        label="Colour"
        value={draft.color}
        onChange={(color) => onChange({ ...draft, color: color ?? draft.color })}
      />

      <Preview>
        <PreviewRow role="Camera Operator 2" person="Aswin Vipin">
          <TagBadge tag={{ name: name || 'Tag', color: draft.color }} />
        </PreviewRow>
      </Preview>

      <div className="flex flex-wrap justify-end gap-2">
        <ActionButton size="sm" tone="quiet" onClick={onCancel}>
          Cancel
        </ActionButton>
        <ActionButton size="sm" type="submit" disabled={!name || clash || saving}>
          {saving ? 'Saving…' : draft.id ? 'Save tag' : 'Add tag'}
        </ActionButton>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------------ *
 * The Coordinator's colour
 * ------------------------------------------------------------------ */

function CoordinatorSection() {
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const settingsQuery = useQuery({ queryKey: SETTINGS_KEY, queryFn: fetchAppSettings })
  const saved = settingsQuery.data?.coordinator_color ?? null
  const [chosen, setChosen] = useState<string | null>(saved)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    setChosen(saved)
  }, [saved])

  const save = useMutation({
    mutationFn: async (color: string | null) => {
      const { error } = await supabase
        .from('app_settings')
        .update({ coordinator_color: color })
        .eq('id', true)
      if (error) throw error
    },
    onSuccess: () => {
      setError(null)
      setDone(true)
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not save that colour.')),
  })

  const changed = (chosen ?? null) !== (saved ?? null)

  return (
    <div>
      <div className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
        Team Coordinator
      </div>
      <p className="mt-1 text-label-md text-on-surface-faint">
        The Coordinator’s row is a starry sky with a glisten across it, so the team can see at a
        glance who to look to. Keep the night sky, or give it your own colour.
      </p>

      <div className="mt-4 flex flex-col gap-4 rounded-[var(--radius-chip)] bg-surface-container p-4">
        <ColorSwatches
          label="Sky colour"
          value={chosen}
          onChange={(color) => {
            setDone(false)
            setChosen(color)
          }}
          allowNone="Night sky"
        />

        <Preview>
          <CoordinatorPreview color={chosen} />
        </Preview>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {done && !changed && (
            <span role="status" className="mr-auto text-label-md text-on-surface-variant">
              Saved.
            </span>
          )}
          <ActionButton
            size="sm"
            tone="quiet"
            onClick={() => setChosen(saved)}
            disabled={!changed || save.isPending}
          >
            Undo
          </ActionButton>
          <ActionButton
            size="sm"
            onClick={() => save.mutate(chosen)}
            disabled={!changed || save.isPending}
          >
            {save.isPending ? 'Saving…' : 'Save colour'}
          </ActionButton>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}
    </div>
  )
}

/** The Coordinator's rota row exactly as the rota draws it. */
export function CoordinatorPreview({ color, name = 'Santhi Chennamsetti' }: { color: string | null; name?: string }) {
  return (
    <div
      className="galaxy glisten flex flex-col gap-0.5 rounded-[var(--radius-chip)] px-3.5 py-2.5 text-body-sm sm:flex-row sm:items-center sm:gap-3"
      style={skyStyle(color)}
      data-testid="coordinator-preview"
    >
      <span aria-hidden="true" className="galaxy-glow" />
      <span aria-hidden="true" className="galaxy-stars" />
      <span aria-hidden="true" className="galaxy-stars galaxy-stars-far" />
      <span className="relative text-white/70">Team Coordinator</span>
      <span className="relative text-white sm:ml-auto">{name}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

export function TagBadge({ tag }: { tag: { name: string; color: string } }) {
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 font-mono text-label-sm font-medium uppercase"
      style={tagStyle(tag.color)}
    >
      {tag.name}
    </span>
  )
}

function Preview({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
        Preview — how it looks on the rota
      </div>
      <div className="mt-2 rounded-[var(--radius-chip)] bg-surface-lowest p-3 hairline">{children}</div>
    </div>
  )
}

function PreviewRow({
  role,
  person,
  children,
}: {
  role: string
  person: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-start gap-0.5 rounded-[var(--radius-chip)] bg-inset px-3.5 py-2.5 text-body-sm sm:flex-row sm:items-center sm:gap-3">
      <span className="flex flex-wrap items-center gap-2 text-on-surface-variant">
        {role}
        {children}
      </span>
      <span className="text-on-surface sm:ml-auto">{person}</span>
    </div>
  )
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="tap flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hairline hover:text-on-surface disabled:opacity-30"
    >
      {children}
    </button>
  )
}

/**
 * The palette as a row of swatches. `allowNone` adds a first choice that
 * means "the default" and sets the value to null.
 */
function ColorSwatches({
  label,
  value,
  onChange,
  allowNone,
}: {
  label: string
  value: string | null
  onChange: (hex: string | null) => void
  allowNone?: string
}) {
  const current = normaliseHex(value)
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-2">
      <span className="text-body-sm font-medium text-on-surface">{label}</span>
      <div className="flex flex-wrap gap-2">
        {allowNone && (
          <button
            type="button"
            role="radio"
            aria-checked={current === null}
            aria-label={allowNone}
            title={allowNone}
            onClick={() => onChange(null)}
            className={`galaxy tap h-9 w-9 rounded-full ${
              current === null ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface-container' : ''
            }`}
          >
            <span aria-hidden="true" className="galaxy-stars" />
          </button>
        )}
        {TEAM_COLORS.map((c) => {
          const on = current === normaliseHex(c.hex)
          return (
            <button
              key={c.hex}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={c.name}
              title={c.name}
              onClick={() => onChange(c.hex)}
              className={`tap h-9 w-9 rounded-full ${
                on ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface-container' : ''
              }`}
              style={{ background: c.hex }}
            />
          )
        })}
      </div>
    </div>
  )
}
