import { type FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { PageHeader } from '../components/Surface'
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
      <PageHeader title="Set Lists" description="What we are singing, and who is leading it." />

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
            return (
              <li
                key={service.id}
                className="rounded-[var(--radius-card)] bg-surface-lowest hairline"
              >
                <button
                  type="button"
                  onClick={() => toggle(service.id)}
                  aria-expanded={open}
                  className="tap flex w-full items-center gap-3 px-5 py-4 text-left"
                >
                  <Chevron open={open} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-headline-md text-on-surface">
                      {formatServiceDay(service.date)}
                    </span>
                    <span className="block text-label-sm text-on-surface-variant">
                      {service.service_type}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
                    {songs.length === 0
                      ? 'No songs yet'
                      : `${songs.length} ${songs.length === 1 ? 'song' : 'songs'}`}
                  </span>
                </button>

                {open && (
                  <div className="border-t border-border-subtle px-5 pb-5 pt-4">
                    {songs.length === 0 ? (
                      <p className="text-body-sm text-on-surface-variant">
                        Nothing listed yet.
                        {!canEdit && ' The worship team will add the songs before the service.'}
                      </p>
                    ) : (
                      <ol className="flex flex-col gap-2">
                        {songs.map((song, index) => (
                          <SongRow
                            key={song.id}
                            song={song}
                            index={index}
                            canEdit={canEdit}
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
                )}
              </li>
            )
          })}
        </ul>
      </QueryState>
    </div>
  )
}

/** One song: its place in the order, who leads it, and what is attached. */
function SongRow({
  song,
  index,
  canEdit,
  onRemove,
  removing,
}: {
  song: SetListItem
  index: number
  canEdit: boolean
  onRemove: () => void
  removing: boolean
}) {
  const [showLyrics, setShowLyrics] = useState(false)
  const href = safeSongLink(song.link)

  return (
    <li className="rounded-[var(--radius-chip)] bg-raised px-3.5 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="shrink-0 font-mono text-label-sm text-on-surface-faint">{index + 1}</span>
        <span className="min-w-0 flex-1 break-words text-body-md font-medium text-on-surface">
          {song.title}
        </span>
        {song.leader ? (
          <span className="shrink-0 text-body-sm text-on-surface-variant">
            {song.leader.first_name} {song.leader.last_name}
          </span>
        ) : (
          <span className="shrink-0 text-label-sm text-on-surface-faint">Nobody yet</span>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-label-sm text-secondary hover:underline"
          >
            Open the song
          </a>
        )}
        {song.lyrics && (
          <button
            type="button"
            onClick={() => setShowLyrics((was) => !was)}
            aria-expanded={showLyrics}
            className="tap text-label-sm text-secondary hover:underline"
          >
            {showLyrics ? 'Hide lyrics' : 'Lyrics'}
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={onRemove}
            disabled={removing}
            className="tap ml-auto text-label-sm text-error hover:underline disabled:opacity-50"
          >
            Remove
          </button>
        )}
      </div>

      {showLyrics && song.lyrics && (
        // Kept as typed: verses, blank lines and all. A lyric sheet
        // reflowed into a paragraph is no use to anybody on a stage.
        <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-[var(--radius-chip)] bg-surface-lowest p-3 font-sans text-body-sm text-on-surface">
          {song.lyrics}
        </pre>
      )}
    </li>
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
  onAdd: (song: {
    title: string
    led_by: string | null
    link: string | null
    lyrics: string | null
  }) => void
}) {
  const [title, setTitle] = useState('')
  const [ledBy, setLedBy] = useState('')
  const [link, setLink] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [showExtras, setShowExtras] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    onAdd({
      title: title.trim(),
      led_by: ledBy || null,
      link: link.trim() || null,
      lyrics: lyrics.trim() || null,
    })
    setTitle('')
    setLedBy('')
    setLink('')
    setLyrics('')
    setShowExtras(false)
  }

  return (
    <form onSubmit={submit} className="mt-4 border-t border-border-subtle pt-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-label-sm text-on-surface-variant">
          Song
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Goodness of God"
            className="rounded-full hairline px-3 py-2 text-body-md text-on-surface focus:border-2 focus:border-secondary focus:outline-none"
          />
        </label>

        <label className="flex min-w-40 flex-col gap-1 text-label-sm text-on-surface-variant">
          Led by
          <select
            value={ledBy}
            onChange={(e) => setLedBy(e.target.value)}
            className="rounded-full hairline bg-transparent px-3 py-2 text-body-md text-on-surface"
          >
            <option value="">Nobody yet</option>
            {leaders.map((leader) => (
              <option key={leader.id} value={leader.id}>
                {leader.name} — {leader.role}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="rounded-full bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Adding…' : 'Add song'}
        </button>
      </div>

      {/* The worship team is nobody's idea of a list of people who enjoy
          filling in forms. A title and a name is the whole job most weeks;
          the link and the words are there when somebody wants them. */}
      <button
        type="button"
        onClick={() => setShowExtras((was) => !was)}
        aria-expanded={showExtras}
        className="tap mt-2 text-label-sm text-secondary hover:underline"
      >
        {showExtras ? 'Hide link and lyrics' : 'Add a link or lyrics'}
      </button>

      {showExtras && (
        <div className="mt-2 flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-label-sm text-on-surface-variant">
            Link
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="youtube.com/watch?v=…"
              className="rounded-full hairline px-3 py-2 text-body-md text-on-surface focus:border-2 focus:border-secondary focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-label-sm text-on-surface-variant">
            Lyrics
            <textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              rows={6}
              placeholder="Paste the words here…"
              className="rounded-[var(--radius-chip)] hairline px-3 py-2 text-body-sm text-on-surface focus:border-2 focus:border-secondary focus:outline-none"
            />
          </label>
        </div>
      )}

      {leaders.length === 0 && (
        <p className="mt-2 text-label-sm text-on-surface-faint">
          Nobody from the worship team is on this service&rsquo;s rota yet, so there is nobody to
          put against a song. Assign them on the Team Rota and they will appear here.
        </p>
      )}
    </form>
  )
}
