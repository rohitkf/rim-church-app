import { type FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import {
  ActionButton,
  Field,
  PageHeader,
  Pill,
  Row,
  Tile,
  inputClasses,
} from '../components/Surface'
import { Chevron } from '../components/Collapsible'
import {
  fetchCanEditSetList,
  fetchDepartments,
  fetchRotaAssignments,
  fetchServices,
  fetchSetListItems,
} from '../lib/queries'
import { todayIso } from '../lib/monthGrid'
import { servicesToShow } from '../lib/rotaWindow'
import { useAppSettings } from '../lib/appSettings'
import { formatServiceDay } from '../lib/sunday'
import { useFinishedServices } from '../lib/useFinishedServices'
import { useErrorText } from '../lib/useErrorText'
import { nextSongOrder, safeSongLink, songLeaders, songsFor } from '../lib/setList'
import type { SetListItem } from '../lib/types'
import { Select } from '../components/Select'

/**
 * What we are singing, and who is leading it.
 *
 * One list per service, in the order the songs come. Everybody can read
 * it — knowing the songs before Sunday is most of the point — and the
 * worship team keeps it, along with the Admins.
 *
 * Who leads a song is chosen from that service's worship rota rather than
 * typed, so the set list and the rota cannot end up disagreeing about who
 * is even in the building.
 */
export function SetListsPage() {
  const { session } = useAuth()
  const myId = session?.user.id
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const today = todayIso()
  const settings = useAppSettings()
  const [error, setError] = useState<string | null>(null)

  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: fetchServices })
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  const canEditQuery = useQuery({
    queryKey: ['can-edit-set-list', myId],
    queryFn: () => fetchCanEditSetList(myId!),
    enabled: !!myId,
  })
  const canEdit = canEditQuery.data === true

  const worshipId = (departmentsQuery.data ?? []).find((d) => d.is_worship)?.id ?? null

  const allServiceIds = useMemo(
    () => (servicesQuery.data ?? []).map((s) => s.id),
    [servicesQuery.data],
  )
  const { isFinished } = useFinishedServices(allServiceIds)
  // The same window every other page works to, and set in the same place.
  const services = useMemo(
    () =>
      servicesToShow(servicesQuery.data ?? [], today, {
        days: settings.rota_window_days,
        isFinished,
      }),
    [servicesQuery.data, today, settings.rota_window_days, isFinished],
  )
  const serviceIds = useMemo(() => services.map((s) => s.id), [services])

  const itemsQuery = useQuery({
    queryKey: ['set-list-items', serviceIds],
    queryFn: () => fetchSetListItems(serviceIds),
    enabled: serviceIds.length > 0,
  })
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data])

  const assignmentsQuery = useQuery({
    queryKey: ['rota-assignments', serviceIds],
    queryFn: () => fetchRotaAssignments(serviceIds),
    enabled: serviceIds.length > 0,
  })
  const assignments = useMemo(() => assignmentsQuery.data ?? [], [assignmentsQuery.data])

  // Open unless the service is over. A finished set list is a record, and
  // this week's is the question — so the page opens on the question and
  // still lets somebody look back at what was sung last Sunday.
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const isExpanded = (id: string) => toggled[id] ?? !isFinished(id)
  const toggle = (id: string) =>
    setToggled((s) => ({ ...s, [id]: !(s[id] ?? !isFinished(id)) }))

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['set-list-items'] })

  const addSong = useMutation({
    mutationFn: async (song: {
      service_id: string
      title: string
      led_by: string | null
      link: string | null
      lyrics: string | null
    }) => {
      const { error: insertError } = await supabase.from('set_list_items').insert({
        ...song,
        sort_order: nextSongOrder(items, song.service_id),
        created_by: myId ?? null,
      })
      if (insertError) throw insertError
    },
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not add that song.')),
  })

  const editSong = useMutation({
    mutationFn: async ({
      id,
      ...song
    }: {
      id: string
      title: string
      led_by: string | null
      link: string | null
      lyrics: string | null
    }) => {
      const { error: updateError } = await supabase
        .from('set_list_items')
        .update({ ...song, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (updateError) throw updateError
    },
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not save that song.')),
  })

  const removeSong = useMutation({
    mutationFn: async (id: string) => {
      const { error: deleteError } = await supabase.from('set_list_items').delete().eq('id', id)
      if (deleteError) throw deleteError
    },
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not remove that song.')),
  })

  return (
    <div>
      <PageHeader
        eyebrow="What we are singing"
        title="Set Lists"
        description="One list per service, in the order the songs come. The worship team keeps it, and everybody can read it."
      />

      {error && (
        <p className="mt-4 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      <QueryState
        isLoading={servicesQuery.isLoading}
        error={servicesQuery.error}
        isEmpty={services.length === 0}
        emptyMessage="No services in the next week or so."
      >
        <ul className="mt-6 flex flex-col gap-4">
          {services.map((service) => {
            const songs = songsFor(items, service.id)
            const leaders = songLeaders(assignments, service.id, worshipId)
            const open = isExpanded(service.id)
            const finished = isFinished(service.id)
            return (
              /* The same tile the Team Rota gives a service, because it is
                 the same service: name, then when, then how it stands, and
                 the chevron at the end of that line rather than in front of
                 the name. Two pages about one Sunday should not disagree
                 about what a Sunday looks like. */
              <Tile
                key={service.id}
                as="li"
                padded={false}
                className={finished ? 'opacity-70' : ''}
              >
                <header className="px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
                  <button
                    type="button"
                    onClick={() => toggle(service.id)}
                    aria-expanded={open}
                    aria-controls={`set-list-${service.id}`}
                    className="tap flex w-full text-left"
                  >
                    <span className="w-full">
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <h2 className="min-w-0 break-words text-headline-md leading-tight">
                          {service.service_type}
                        </h2>
                        {finished && <Pill tone="green">Finished</Pill>}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-label-sm text-on-surface-variant">
                        <span>
                          {service.date === today ? 'Today' : formatServiceDay(service.date)}
                        </span>
                        <span aria-hidden="true" className="text-on-surface-faint">
                          ·
                        </span>
                        <span>
                          {songs.length === 0
                            ? 'no songs yet'
                            : `${songs.length} ${songs.length === 1 ? 'song' : 'songs'}`}
                        </span>
                        <Chevron open={open} />
                      </span>
                    </span>
                  </button>
                </header>

                <div
                  id={`set-list-${service.id}`}
                  hidden={!open}
                  className="px-5 pb-5 sm:px-7 sm:pb-7"
                >
                  {songs.length === 0 ? (
                    <Row variant="dashed" className="text-body-sm">
                      Nothing listed yet.
                      {!canEdit && ' The worship team will add the songs before the service.'}
                    </Row>
                  ) : (
                    <ol className="flex flex-col gap-2">
                      {songs.map((song, index) => (
                        <SongRow
                          key={song.id}
                          song={song}
                          index={index}
                          canEdit={canEdit}
                          leaders={leaders}
                          onSave={(fields) => editSong.mutateAsync({ id: song.id, ...fields })}
                          onRemove={() => removeSong.mutate(song.id)}
                          removing={removeSong.isPending}
                        />
                      ))}
                    </ol>
                  )}

                  {canEdit && (
                    <AddSongForm
                      leaders={leaders}
                      busy={addSong.isPending}
                      onAdd={(song) => addSong.mutate({ ...song, service_id: service.id })}
                    />
                  )}
                </div>
              </Tile>
            )
          })}
        </ul>
      </QueryState>
    </div>
  )
}

/** What a song is made of. The same fields whether adding or correcting. */
export interface SongFields {
  title: string
  led_by: string | null
  link: string | null
  lyrics: string | null
}

/**
 * The fields, shared by adding and editing.
 *
 * One set of inputs rather than two nearly-identical ones: a set list
 * mostly gets written in a hurry and corrected later — a leader arrives,
 * a key changes, somebody finds the lyrics — and the two jobs should not
 * be able to drift apart in what they let you type.
 */
function SongInputs({
  value,
  onChange,
  leaders,
  showExtras,
  onToggleExtras,
  titlePlaceholder,
}: {
  value: SongFields
  onChange: (next: SongFields) => void
  leaders: ReturnType<typeof songLeaders>
  showExtras: boolean
  onToggleExtras: () => void
  titlePlaceholder?: string
}) {
  return (
    <>
      {/* Field and inputClasses, like every other form in the app: a mono
          eyebrow over a chip-shaped box that lights from the inside when
          it takes focus. This page used to draw pill inputs with a blue
          border on focus, which is the one thing here that looked like a
          different product. */}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Song" className="min-w-48 flex-1">
          <input
            value={value.title}
            onChange={(e) => onChange({ ...value, title: e.target.value })}
            placeholder={titlePlaceholder}
            className={inputClasses}
          />
        </Field>

        <Field label="Led by" className="min-w-44">
          <Select
            value={value.led_by ?? ''}
            onChange={(id) => onChange({ ...value, led_by: id || null })}
            aria-label="Led by"
            options={[
              { value: '', label: 'Nobody yet' },
              ...leaders.map((leader) => ({
                value: leader.id,
                label: `${leader.name} — ${leader.role}`,
              })),
            ]}
          />
        </Field>
      </div>

      <div className="mt-3">
        <ActionButton
          size="sm"
          tone="ghost"
          onClick={onToggleExtras}
          aria-expanded={showExtras}
        >
          {showExtras ? 'Hide link and lyrics' : 'Add a link or lyrics'}
        </ActionButton>
      </div>

      {showExtras && (
        <div className="mt-3 flex flex-col gap-3">
          <Field label="Link">
            <input
              value={value.link ?? ''}
              onChange={(e) => onChange({ ...value, link: e.target.value })}
              placeholder="youtube.com/watch?v=…"
              className={inputClasses}
            />
          </Field>
          <Field label="Lyrics">
            <textarea
              value={value.lyrics ?? ''}
              onChange={(e) => onChange({ ...value, lyrics: e.target.value })}
              rows={6}
              placeholder="Paste the words here…"
              className={inputClasses}
            />
          </Field>
        </div>
      )}

      {leaders.length === 0 && (
        <p className="mt-3 text-label-sm text-on-surface-faint">
          Nobody from the worship team is on this service&rsquo;s rota yet, so there is nobody to
          put against a song. Assign them on the Team Rota and they will appear here.
        </p>
      )}
    </>
  )
}

/** Trimmed, with the empty strings turned back into nothing. */
function tidy(fields: SongFields): SongFields {
  return {
    title: fields.title.trim(),
    led_by: fields.led_by || null,
    link: fields.link?.trim() || null,
    lyrics: fields.lyrics?.trim() || null,
  }
}

/** One song: its place in the order, who leads it, and what is attached. */
function SongRow({
  song,
  index,
  canEdit,
  leaders,
  onSave,
  onRemove,
  removing,
}: {
  song: SetListItem
  index: number
  canEdit: boolean
  leaders: ReturnType<typeof songLeaders>
  onSave: (fields: SongFields) => Promise<unknown>
  onRemove: () => void
  removing: boolean
}) {
  const [showLyrics, setShowLyrics] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<SongFields>(() => ({
    title: song.title,
    led_by: song.led_by,
    link: song.link,
    lyrics: song.lyrics,
  }))
  // Open on whichever of them already has something in it, so correcting a
  // link does not begin with hunting for where the link went.
  const [showExtras, setShowExtras] = useState(!!song.link || !!song.lyrics)
  const [saving, setSaving] = useState(false)
  const href = safeSongLink(song.link)

  const startEditing = () => {
    setDraft({ title: song.title, led_by: song.led_by, link: song.link, lyrics: song.lyrics })
    setShowExtras(!!song.link || !!song.lyrics)
    setEditing(true)
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const fields = tidy(draft)
    if (!fields.title) return
    setSaving(true)
    try {
      await onSave(fields)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <Row as="li" variant="raised" stack>
        <form onSubmit={save}>
          <SongInputs
            value={draft}
            onChange={setDraft}
            leaders={leaders}
            showExtras={showExtras}
            onToggleExtras={() => setShowExtras((was) => !was)}
          />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ActionButton type="submit" size="sm" disabled={saving || !draft.title.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </ActionButton>
            <ActionButton size="sm" tone="ghost" onClick={() => setEditing(false)}>
              Cancel
            </ActionButton>
          </div>
        </form>
      </Row>
    )
  }

  return (
    <Row as="li" variant="raised" stack>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="shrink-0 font-mono text-label-sm tabular text-on-surface-faint">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1 break-words text-body-md font-medium text-on-surface">
          {song.title}
        </span>
        {song.leader ? (
          <span className="shrink-0 text-body-sm text-on-surface-variant">
            {song.leader.first_name} {song.leader.last_name}
          </span>
        ) : canEdit ? (
          // Not a shrug: the commonest reason a song has nobody against it
          // is that the rota was not filled when it was added, and this is
          // the moment somebody can fix it.
          <ActionButton size="sm" tone="quiet" onClick={startEditing}>
            Add who leads it
          </ActionButton>
        ) : (
          <span className="shrink-0 font-mono text-label-sm text-on-surface-faint">Nobody yet</span>
        )}
      </div>

      {/* Every one of these was a blue underlined word in a row of blue
          underlined words. They are buttons — the same pill every other
          page uses for a row's actions — so the song is the thing being
          read and these are the things being pressed. */}
      {(href || song.lyrics || canEdit) && (
        <div className="flex flex-wrap items-center gap-2">
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="tap inline-flex items-center justify-center gap-2 rounded-full px-3.5 py-1.5 text-label-md text-on-surface-variant transition-colors duration-300 ease-[var(--ease-glide)] hover:text-on-surface"
            >
              Open the song
            </a>
          )}
          {song.lyrics && (
            <ActionButton
              size="sm"
              tone="ghost"
              onClick={() => setShowLyrics((was) => !was)}
              aria-expanded={showLyrics}
            >
              {showLyrics ? 'Hide lyrics' : 'Lyrics'}
            </ActionButton>
          )}
          {canEdit && (
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <ActionButton size="sm" tone="quiet" onClick={startEditing}>
                Edit
              </ActionButton>
              <ActionButton size="sm" tone="danger-quiet" onClick={onRemove} disabled={removing}>
                Remove
              </ActionButton>
            </span>
          )}
        </div>
      )}

      {showLyrics && song.lyrics && (
        // Kept as typed: verses, blank lines and all. A lyric sheet
        // reflowed into a paragraph is no use to anybody on a stage.
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-[var(--radius-chip)] bg-surface-lowest p-4 font-sans text-body-sm text-on-surface">
          {song.lyrics}
        </pre>
      )}
    </Row>
  )
}

/** Adding a song: a title, optionally who leads it, a link and the words. */
function AddSongForm({
  leaders,
  busy,
  onAdd,
}: {
  leaders: ReturnType<typeof songLeaders>
  busy: boolean
  onAdd: (song: SongFields) => void
}) {
  const empty: SongFields = { title: '', led_by: null, link: null, lyrics: null }
  const [draft, setDraft] = useState<SongFields>(empty)
  const [showExtras, setShowExtras] = useState(false)
  // Shut until asked for. Open, it made a page of set lists read as a page
  // of forms: two services meant two permanently-expanded forms stacked
  // above the fold, and the songs — the thing anybody came to read — sat
  // between them.
  const [adding, setAdding] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const fields = tidy(draft)
    if (!fields.title) return
    onAdd(fields)
    setDraft(empty)
    setShowExtras(false)
    setAdding(false)
  }

  if (!adding) {
    return (
      <div className="mt-3">
        <ActionButton
          size="sm"
          tone="quiet"
          onClick={() => setAdding(true)}
          glyph={<span aria-hidden="true">+</span>}
        >
          Add a song
        </ActionButton>
      </div>
    )
  }

  return (
    <form
      onSubmit={submit}
      className="mt-3 rounded-[var(--radius-panel)] bg-raised p-4 sm:p-5"
    >
      <SongInputs
        value={draft}
        onChange={setDraft}
        leaders={leaders}
        showExtras={showExtras}
        onToggleExtras={() => setShowExtras((was) => !was)}
        titlePlaceholder="Goodness of God"
      />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ActionButton type="submit" size="sm" disabled={busy || !draft.title.trim()}>
          {busy ? 'Adding…' : 'Add song'}
        </ActionButton>
        <ActionButton
          size="sm"
          tone="ghost"
          onClick={() => {
            setDraft(empty)
            setShowExtras(false)
            setAdding(false)
          }}
        >
          Cancel
        </ActionButton>
      </div>
    </form>
  )
}
