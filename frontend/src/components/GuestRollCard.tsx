import { type FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useErrorText } from '../lib/useErrorText'
import { QueryState } from './QueryState'
import { Chevron, useExpanded } from './Collapsible'
import { useConfirmAction } from './ConfirmAction'
import { GUESTS_KEY, addGuest, alreadyOnTheRoll, fetchGuests, guestLabel, type Guest } from '../lib/guests'

/** The designations this church actually uses, as a starting point. It is
    free text underneath — a list of the ones we thought of is a list
    somebody's minister is missing from. */
const TITLES = ['Pastor', 'Ps', 'Apostle', 'Evangelist', 'Bishop', 'Rev', 'Br', 'Sr']

const fieldClasses =
  'w-full rounded-[var(--radius-chip)] bg-surface-lowest px-3.5 py-2 text-body-sm text-on-surface hairline placeholder:text-on-surface-faint focus:outline-none focus:ring-1 focus:ring-secondary'

const profileSchema = z.object({ id: z.string(), first_name: z.string(), last_name: z.string() })

async function fetchPeople() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .order('first_name')
  if (error) throw error
  return z.array(profileSchema).parse(data)
}

/**
 * The church's guest roll.
 *
 * Guests used to belong to a service: next month's visitor was assumed to
 * be a different person, so every planner started with an empty box and
 * whoever was planning it typed the name in again. This church's own data
 * said how that ends — "Godlee Cherian" and "Ps Godlee Cherian", "Sam"
 * and "Ps Sam", the same few people spelled however the hurry of the
 * moment spelled them.
 *
 * So they are people the church knows, kept in one place, picked from
 * wherever a name is needed. They sit on this page because this is the
 * page about who helps; they are simply the ones without an account yet.
 */
export function GuestRollCard() {
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const { ask, dialog } = useConfirmAction()
  const { isExpanded, toggle } = useExpanded()
  const open = isExpanded('guest-roll')

  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState({ name: '', title: '', note: '' })
  /** The guest being pointed at the account they now have. */
  const [linking, setLinking] = useState<Guest | null>(null)

  const guestsQuery = useQuery({ queryKey: GUESTS_KEY, queryFn: fetchGuests })
  const guests = useMemo(() => guestsQuery.data ?? [], [guestsQuery.data])
  const [waiting, joined] = useMemo(
    () => [guests.filter((g) => !g.became_member), guests.filter((g) => g.became_member)],
    [guests],
  )

  const refresh = () => {
    setError(null)
    queryClient.invalidateQueries({ queryKey: GUESTS_KEY })
  }

  const add = useMutation({
    mutationFn: () => addGuest({ name, title, note }),
    onSuccess: () => {
      setName('')
      setTitle('')
      setNote('')
      refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not add that guest.')),
  })

  const save = useMutation({
    mutationFn: async (id: string) => {
      const { error: err } = await supabase
        .from('guests')
        .update({
          name: draft.name.trim(),
          title: draft.title.trim() || null,
          note: draft.note.trim() || null,
        })
        .eq('id', id)
      if (err) throw err
    },
    onSuccess: () => {
      setEditing(null)
      refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not save that change.')),
  })

  const link = useMutation({
    mutationFn: async ({ id, member }: { id: string; member: string | null }) => {
      const { error: err } = await supabase.from('guests').update({ became_member: member }).eq('id', id)
      if (err) throw err
    },
    onSuccess: () => {
      setLinking(null)
      refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not link that guest.')),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error: err } = await supabase.from('guests').delete().eq('id', id)
      if (err) throw err
    },
    onSuccess: refresh,
    onError: (err: unknown) =>
      setError(errorText(err, 'Could not remove that guest — they may still be named on a service.')),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    const typed = name.trim()
    if (!typed) return
    // The whole point of the roll is that there is one of each person.
    const existing = alreadyOnTheRoll(guests, typed)
    if (existing) {
      setError(`${guestLabel(existing)} is already on the list.`)
      return
    }
    add.mutate()
  }

  function startEditing(guest: Guest) {
    setEditing(guest.id)
    setDraft({ name: guest.name, title: guest.title ?? '', note: guest.note ?? '' })
  }

  return (
    <section className="rounded-[var(--radius-card)] bg-surface-lowest hairline p-6">
      <button
        type="button"
        onClick={() => toggle('guest-roll')}
        aria-expanded={open}
        aria-controls="guest-roll"
        className="tap flex w-full items-center gap-2 text-left"
      >
        <h2 className="text-headline-md">Guests</h2>
        <span className="font-mono text-label-sm text-on-surface-variant">{waiting.length}</span>
        <span className="ml-auto">
          <Chevron open={open} />
        </span>
      </button>
      <p className="mt-1.5 text-body-sm text-on-surface-variant">
        People who take part without an account — a visiting preacher, somebody&rsquo;s guest
        musician. Added once and offered everywhere a name is needed, until they have an account of
        their own.
      </p>

      <div id="guest-roll" hidden={!open}>
        <QueryState
          isLoading={guestsQuery.isLoading}
          error={guestsQuery.error}
          isEmpty={guests.length === 0}
          emptyMessage="Nobody on the list yet."
        >
          <ul className="mt-5 flex flex-col gap-2.5">
            {waiting.map((guest) => (
              <li key={guest.id} className="rounded-[var(--radius-row)] bg-raised p-3.5 hairline">
                {editing === guest.id ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap gap-2">
                      <input
                        value={draft.title}
                        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                        list="guest-titles"
                        placeholder="Pastor"
                        aria-label="Designation"
                        className={`${fieldClasses} sm:w-32`}
                      />
                      <input
                        value={draft.name}
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                        placeholder="Name"
                        aria-label="Name"
                        className={`${fieldClasses} sm:flex-1`}
                      />
                    </div>
                    <input
                      value={draft.note}
                      onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                      placeholder="Visiting from Kochi"
                      aria-label="Note"
                      className={fieldClasses}
                    />
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="tap rounded-full px-3 py-1.5 text-label-md text-on-surface-variant hover:text-on-surface"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => save.mutate(guest.id)}
                        disabled={!draft.name.trim() || save.isPending}
                        className="tap rounded-full bg-primary px-4 py-1.5 text-label-md font-medium text-on-primary disabled:opacity-40"
                      >
                        {save.isPending ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
                    <span className="min-w-0">
                      <span className="block break-words text-body-md font-medium text-on-surface">
                        {guestLabel(guest)}
                      </span>
                      {guest.note && (
                        <span className="block break-words text-body-sm text-on-surface-variant">
                          {guest.note}
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => startEditing(guest)}
                        className="tap text-label-md text-on-surface-variant hover:text-on-surface hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setLinking(guest)}
                        className="tap text-label-md text-secondary hover:underline"
                      >
                        Now a member
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          ask({
                            title: `Remove ${guestLabel(guest)} from the guest list?`,
                            body: 'Any service that named them goes back to nobody. If they have simply joined the app, use “Now a member” instead — that keeps the record.',
                            confirmLabel: 'Remove',
                            onConfirm: () => remove.mutate(guest.id),
                          })
                        }
                        className="tap text-label-md text-on-surface-faint hover:text-error hover:underline"
                      >
                        Remove
                      </button>
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {/*
            The ones who joined.
            
            Kept rather than deleted: a running order from March still says
            a guest took the message, and that name has to resolve to
            somebody. They are out of the pickers, which is the part that
            mattered.
          */}
          {joined.length > 0 && (
            <div className="mt-5 border-t border-border-subtle pt-4">
              <p className="font-mono text-label-sm uppercase tracking-[0.14em] text-on-surface-faint">
                Now members
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {joined.map((guest) => (
                  <li
                    key={guest.id}
                    className="flex items-center gap-2 rounded-full bg-surface-container px-3 py-1.5 text-label-md text-on-surface-variant"
                  >
                    {guestLabel(guest)}
                    <button
                      type="button"
                      onClick={() => link.mutate({ id: guest.id, member: null })}
                      className="tap text-label-sm text-on-surface-faint hover:text-on-surface hover:underline"
                    >
                      Undo
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </QueryState>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-2 border-t border-border-subtle pt-5">
          <div className="flex flex-wrap gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              list="guest-titles"
              placeholder="Pastor"
              aria-label="Designation"
              className={`${fieldClasses} sm:w-32`}
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              aria-label="Guest name"
              className={`${fieldClasses} sm:flex-1`}
            />
          </div>
          <datalist id="guest-titles">
            {TITLES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <div className="flex flex-wrap gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Visiting from Kochi"
              aria-label="Note"
              className={`${fieldClasses} sm:flex-1`}
            />
            <button
              type="submit"
              disabled={!name.trim() || add.isPending}
              className="tap shrink-0 rounded-full bg-primary px-5 py-2 text-body-sm font-medium text-on-primary disabled:opacity-40"
            >
              {add.isPending ? 'Adding…' : 'Add'}
            </button>
          </div>
        </form>

        {error && (
          <p className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
            {error}
          </p>
        )}
      </div>

      {linking && (
        <LinkToMemberDialog
          guest={linking}
          onClose={() => setLinking(null)}
          onPick={(member) => link.mutate({ id: linking.id, member })}
          saving={link.isPending}
        />
      )}

      {dialog}
    </section>
  )
}

/** Which account this guest turned out to be. */
function LinkToMemberDialog({
  guest,
  onClose,
  onPick,
  saving,
}: {
  guest: Guest
  onClose: () => void
  onPick: (memberId: string) => void
  saving: boolean
}) {
  const [query, setQuery] = useState(guest.name)
  const peopleQuery = useQuery({ queryKey: ['guest-link-people'], queryFn: fetchPeople })

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const all = peopleQuery.data ?? []
    if (!needle) return all.slice(0, 8)
    return all
      .filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(needle))
      .slice(0, 8)
  }, [peopleQuery.data, query])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Link ${guestLabel(guest)} to an account`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-[2px]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm rounded-[var(--radius-shell)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12">
        <h3 className="text-headline-md">{guestLabel(guest)} has an account?</h3>
        <p className="mt-1.5 text-body-sm text-on-surface-variant">
          Point the guest at it and they stop being offered as one. Services that already name them
          go on naming them — that is what happened.
        </p>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          placeholder="Search people…"
          aria-label="Search people"
          className={`${fieldClasses} mt-4`}
        />

        <QueryState isLoading={peopleQuery.isLoading} error={peopleQuery.error}>
          <ul className="mt-2 max-h-64 overflow-y-auto">
            {matches.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onPick(person.id)}
                  className="tap w-full rounded-[var(--radius-row)] px-3 py-2 text-left text-body-sm text-on-surface hover:bg-raised disabled:opacity-50"
                >
                  {person.first_name} {person.last_name}
                </button>
              </li>
            ))}
            {matches.length === 0 && (
              <li className="px-3 py-2 text-body-sm text-on-surface-variant">Nobody by that name.</li>
            )}
          </ul>
        </QueryState>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="tap rounded-full px-4 py-2 text-body-sm text-on-surface-variant hover:text-on-surface"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
