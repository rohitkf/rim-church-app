import { type FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ActionButton, Field, PageHeader, inputClasses } from '../components/Surface'
import { QueryState } from '../components/QueryState'
import { Select } from '../components/Select'
import { useConfirmAction } from '../components/ConfirmAction'
import { SONG_KEYS, safeSongLink } from '../lib/setList'
import { usePermissions } from '../lib/usePermissions'
import { useMyTeams } from '../lib/useMyTeams'
import { useAuth } from '../auth/AuthContext'
import { useErrorText } from '../lib/useErrorText'
import { showToast } from '../lib/toast'
import {
  SONG_LIBRARY_KEY,
  addLibrarySong,
  fetchSongLibrary,
  isDuplicateSong,
  removeLibrarySong,
  updateLibrarySong,
  type LibraryFields,
  type LibrarySong,
} from '../lib/songLibrary'

/**
 * Songs: every song the church sings, kept for good (0241, 0243).
 *
 * Set lists fill it on their own; this is where a song goes in before
 * anybody sings it — its key, a link to learn it from, the words — so the
 * set list's song box finds it the first time. Everybody may read it.
 * Who may add, change and remove songs is `songs.edit`, chosen team by team
 * in Settings › Page by Page › Songs (the worship team out of the box).
 */

const EMPTY: LibraryFields = { title: '', song_key: null, link: null, lyrics: null }

const plain = (t: string) => t.trim().replace(/\s+/g, ' ').toLowerCase()

function sungLine(song: LibrarySong): string | null {
  if (song.times_sung === 0) return 'Not sung yet'
  const when = song.last_sung_on
    ? new Date(`${song.last_sung_on}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null
  return `Sung ${song.times_sung === 1 ? 'once' : `${song.times_sung} times`}${when ? ` · last ${when}` : ''}`
}

export function SongsPage() {
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const { can } = usePermissions()
  const { teamIds } = useMyTeams()
  const { ledDepartmentIds } = useAuth()
  const { ask, dialog } = useConfirmAction()
  const [filter, setFilter] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // songs.edit, church-wide or for any team this person is on (0243's may_edit_songs).
  const mayEdit =
    can('songs.edit') ||
    [...(teamIds ?? []), ...(ledDepartmentIds ?? [])].some((departmentId) => can('songs.edit', { departmentId }))

  const library = useQuery({ queryKey: SONG_LIBRARY_KEY, queryFn: fetchSongLibrary })
  const refresh = () => queryClient.invalidateQueries({ queryKey: SONG_LIBRARY_KEY })
  const failed = (fallback: string) => (err: unknown) =>
    setError(isDuplicateSong(err) ? 'A song by that name is already in the library.' : errorText(err, fallback))

  const add = useMutation({
    mutationFn: addLibrarySong,
    onSuccess: () => {
      setError(null)
      setAdding(false)
      showToast('Song added')
      return refresh()
    },
    onError: failed('Could not add that song.'),
  })
  const save = useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: LibraryFields }) => updateLibrarySong(id, fields),
    onSuccess: () => {
      setError(null)
      return refresh()
    },
    onError: failed('Could not save that song.'),
  })
  const remove = useMutation({
    mutationFn: removeLibrarySong,
    onSuccess: () => {
      setError(null)
      return refresh()
    },
    onError: failed('Could not remove that song.'),
  })

  const shown = useMemo(() => {
    const q = plain(filter)
    return (library.data ?? []).filter((s) => !q || plain(s.title).includes(q) || plain(s.lyrics ?? '').includes(q))
  }, [library.data, filter])

  return (
    <div>
      <PageHeader
        eyebrow="What we sing"
        title="Songs"
        description="Every song the church sings, kept for good. Start typing one on a set list and it is found here."
        action={
          mayEdit &&
          !adding && (
            <ActionButton onClick={() => setAdding(true)} glyph={<span aria-hidden="true">+</span>}>
              Add a song
            </ActionButton>
          )
        }
      />

      {error && (
        <p role="alert" className="mb-4 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      {adding && (
        <SongForm
          initial={EMPTY}
          busy={add.isPending}
          submitLabel="Add song"
          onSubmit={(fields) => add.mutate(fields)}
          onCancel={() => setAdding(false)}
        />
      )}

      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        aria-label="Find a song"
        placeholder="Find a song, or a line of it"
        className={`${inputClasses} mt-2`}
      />

      <QueryState
        isLoading={library.isLoading}
        error={library.error}
        isEmpty={shown.length === 0}
        emptyMessage={filter.trim() ? 'No song matches that.' : 'No songs yet. Add one, or put one on a set list.'}
      >
        <p className="mt-4 font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
          {shown.length} {shown.length === 1 ? 'song' : 'songs'}
        </p>
        <ul aria-label="Songs" className="mt-2 flex flex-col gap-2">
          {shown.map((song) => (
            <SongCard
              key={song.id}
              song={song}
              mayEdit={mayEdit}
              saving={save.isPending}
              onSave={(fields) => save.mutate({ id: song.id, fields })}
              onRemove={() =>
                ask({
                  title: `Remove ${song.title} from the library?`,
                  body: 'Set lists that already have it keep it. It stops being suggested, until it is put on a set list again.',
                  confirmLabel: 'Remove',
                  onConfirm: () => remove.mutate(song.id),
                })
              }
            />
          ))}
        </ul>
      </QueryState>
      {dialog}
    </div>
  )
}

function SongCard({
  song,
  mayEdit,
  saving,
  onSave,
  onRemove,
}: {
  song: LibrarySong
  mayEdit: boolean
  saving: boolean
  onSave: (fields: LibraryFields) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const link = safeSongLink(song.link)

  if (editing) {
    return (
      <li>
        <SongForm
          initial={{ title: song.title, song_key: song.song_key, link: song.link, lyrics: song.lyrics }}
          busy={saving}
          submitLabel="Save"
          onSubmit={(fields) => {
            onSave(fields)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    )
  }

  return (
    <li aria-label={song.title} className="rounded-[var(--radius-row)] bg-surface-lowest p-3.5 hairline">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="min-w-0 break-words text-body-md font-medium text-on-surface">{song.title}</span>
        {song.song_key && (
          <span className="shrink-0 rounded-full bg-raised-strong px-2 py-0.5 font-mono text-label-sm text-on-surface-variant">
            {song.song_key}
          </span>
        )}
      </div>
      <p className="mt-1 font-mono text-label-sm text-on-surface-faint">{sungLine(song)}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3">
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="tap inline-flex items-center text-label-md font-medium text-accent-blue-soft hover:underline"
          >
            Listen <span aria-hidden="true">&nbsp;↗</span>
          </a>
        )}
        {song.lyrics && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="tap text-label-md text-on-surface-variant hover:text-on-surface hover:underline"
          >
            {open ? 'Hide lyrics' : 'Lyrics'}
          </button>
        )}
        {mayEdit && (
          <span className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="tap text-label-md text-on-surface-faint hover:text-accent-blue-soft hover:underline"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="tap text-label-md text-on-surface-faint hover:text-error hover:underline"
            >
              Remove
            </button>
          </span>
        )}
      </div>
      {open && song.lyrics && (
        <p className="mt-2 whitespace-pre-line break-words rounded-[var(--radius-chip)] bg-raised p-3 text-body-sm text-on-surface">
          {song.lyrics}
        </p>
      )}
    </li>
  )
}

function SongForm({
  initial,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: LibraryFields
  busy: boolean
  submitLabel: string
  onSubmit: (fields: LibraryFields) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<LibraryFields>(initial)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!draft.title.trim()) return
    onSubmit(draft)
  }
  return (
    <form onSubmit={submit} className="mb-4 rounded-[var(--radius-panel)] bg-raised p-4 sm:p-5">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Song" className="min-w-48 flex-1">
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="Goodness of God"
            maxLength={200}
            autoFocus
            className={inputClasses}
          />
        </Field>
        <Field label="Key" className="min-w-36">
          <Select
            value={draft.song_key ?? ''}
            onChange={(k) => setDraft({ ...draft, song_key: k || null })}
            aria-label="Key"
            options={[
              { value: '', label: 'Not set' },
              ...(draft.song_key && !SONG_KEYS.includes(draft.song_key) ? [{ value: draft.song_key, label: draft.song_key }] : []),
              { label: 'Major', options: SONG_KEYS.filter((k) => k.endsWith('major')).map((k) => ({ value: k, label: k })) },
              { label: 'Minor', options: SONG_KEYS.filter((k) => k.endsWith('minor')).map((k) => ({ value: k, label: k })) },
            ]}
          />
        </Field>
      </div>
      <div className="mt-3 flex flex-col gap-3">
        <Field label="Link (optional)">
          <input
            value={draft.link ?? ''}
            onChange={(e) => setDraft({ ...draft, link: e.target.value })}
            placeholder="youtube.com/watch?v=…"
            inputMode="url"
            autoCapitalize="off"
            className={inputClasses}
          />
        </Field>
        <Field label="Lyrics (optional)">
          <textarea
            value={draft.lyrics ?? ''}
            onChange={(e) => setDraft({ ...draft, lyrics: e.target.value })}
            rows={6}
            placeholder="Paste the words here…"
            className={inputClasses}
          />
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ActionButton type="submit" size="sm" disabled={busy || !draft.title.trim()}>
          {busy ? 'Saving…' : submitLabel}
        </ActionButton>
        <ActionButton size="sm" tone="ghost" onClick={onCancel}>
          Cancel
        </ActionButton>
      </div>
    </form>
  )
}
