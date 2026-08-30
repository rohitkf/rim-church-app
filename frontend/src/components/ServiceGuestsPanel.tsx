import { type FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { ActionButton, Eyebrow, Tile } from './Surface'
import { useErrorText } from '../lib/useErrorText'

export const serviceGuestSchema = z.object({
  id: z.string(),
  service_id: z.string(),
  name: z.string(),
  note: z.string().nullable(),
})
export type ServiceGuest = z.infer<typeof serviceGuestSchema>

export async function fetchServiceGuests(serviceId: string): Promise<ServiceGuest[]> {
  const { data, error } = await supabase
    .from('service_guests')
    .select('id, service_id, name, note')
    .eq('service_id', serviceId)
    .order('name')
  if (error) throw error
  return z.array(serviceGuestSchema).parse(data)
}

/**
 * The people taking part who don't have an account.
 *
 * A visiting speaker shouldn't need a login to be named against the
 * session they are taking, and whoever prints the running order should not
 * have to remember who "Unassigned" really meant. Guests are added here
 * and then appear in every session's picker for this service.
 *
 * The list belongs to this service, not to the church: next month's
 * visitor is a different person, and an address book of every guest ever
 * would be a worse thing to search than the roster beside it.
 */
const guestInputClasses =
  'w-full rounded-[var(--radius-chip)] bg-surface-lowest px-3.5 py-2 text-body-sm text-on-surface hairline placeholder:text-on-surface-faint focus:outline-none focus:ring-1 focus:ring-secondary'

export function ServiceGuestsPanel({
  serviceId,
  canManage,
}: {
  serviceId: string
  canManage: boolean
}) {
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  // The guest currently open for correction, and the values being typed.
  const [editing, setEditing] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftNote, setDraftNote] = useState('')

  const guestsQuery = useQuery({
    queryKey: ['service-guests', serviceId],
    queryFn: () => fetchServiceGuests(serviceId),
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['service-guests', serviceId] })
    // A removed guest leaves the sessions they led unassigned, so the
    // running order has to be re-read too.
    queryClient.invalidateQueries({ queryKey: ['service-sessions', serviceId] })
  }

  const add = useMutation({
    mutationFn: async () => {
      const { error: insertError } = await supabase.from('service_guests').insert({
        service_id: serviceId,
        name: name.trim(),
        note: note.trim() || null,
      })
      if (insertError) throw insertError
    },
    onSuccess: () => {
      setName('')
      setNote('')
      setError(null)
      refresh()
    },
    onError: (err: unknown) =>
      setError(errorText(err, 'Could not add that guest — is the name already on the list?')),
  })

  /*
   * Correcting a guest in place.
   *
   * Without this the only way to fix a misspelt name was to remove the
   * guest and add them again — and removing one nulls the guest_id on
   * every session they were leading, so a typo cost you the running order
   * as well. An update touches the name and nothing else.
   */
  const save = useMutation({
    mutationFn: async () => {
      const { error: updateError } = await supabase
        .from('service_guests')
        .update({ name: draftName.trim(), note: draftNote.trim() || null })
        .eq('id', editing!)
      if (updateError) throw updateError
    },
    onSuccess: () => {
      setEditing(null)
      setError(null)
      refresh()
    },
    onError: (err: unknown) =>
      setError(errorText(err, 'Could not save that guest — is the name already on the list?')),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error: deleteError } = await supabase.from('service_guests').delete().eq('id', id)
      if (deleteError) throw deleteError
    },
    onSuccess: () => {
      setError(null)
      refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not remove that guest.')),
  })

  const guests = guestsQuery.data ?? []
  if (!canManage && guests.length === 0) return null

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (name.trim()) add.mutate()
  }

  return (
    <Tile>
      <div className="flex items-baseline justify-between gap-4">
        <Eyebrow>Guests</Eyebrow>
        {guests.length > 0 && (
          <span className="font-mono text-label-sm text-on-surface-faint">{guests.length}</span>
        )}
      </div>
      <p className="mt-2 text-label-md text-on-surface-variant">
        People without an account — a visiting speaker, a musician sitting in. They show up in
        every session&rsquo;s picker for this service.
      </p>

      {guests.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {guests.map((guest) => (
            <li
              key={guest.id}
              className="rounded-[var(--radius-row)] bg-raised px-3.5 py-2.5"
            >
              {editing === guest.id ? (
                <form
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault()
                    if (draftName.trim()) save.mutate()
                  }}
                  className="flex flex-col gap-2"
                >
                  <input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    aria-label={`Name for ${guest.name}`}
                    className={guestInputClasses}
                  />
                  <input
                    value={draftNote}
                    onChange={(e) => setDraftNote(e.target.value)}
                    placeholder="Guest speaker, visiting worship lead…"
                    aria-label={`What ${guest.name} is here for`}
                    className={guestInputClasses}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <ActionButton
                      size="sm"
                      type="submit"
                      disabled={save.isPending || draftName.trim().length === 0}
                    >
                      {save.isPending ? 'Saving…' : 'Save'}
                    </ActionButton>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="tap text-label-md font-medium text-on-surface-variant hover:text-on-surface"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-start gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-sm text-on-surface">{guest.name}</span>
                    {guest.note && (
                      <span className="block truncate text-label-sm text-on-surface-faint">
                        {guest.note}
                      </span>
                    )}
                  </span>
                  {canManage && (
                    <span className="flex shrink-0 items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(guest.id)
                          setDraftName(guest.name)
                          setDraftNote(guest.note ?? '')
                          setError(null)
                        }}
                        className="tap text-label-md font-medium text-on-surface-variant hover:text-secondary"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => remove.mutate(guest.id)}
                        className="tap text-label-md font-medium text-on-surface-variant hover:text-error"
                      >
                        Remove
                      </button>
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            aria-label="Guest name"
            className="w-full rounded-[var(--radius-chip)] bg-raised px-3.5 py-2 text-body-sm text-on-surface hairline placeholder:text-on-surface-faint focus:outline-none focus:ring-1 focus:ring-secondary"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Guest speaker, visiting worship lead…"
            aria-label="What they are here for"
            className="w-full rounded-[var(--radius-chip)] bg-raised px-3.5 py-2 text-body-sm text-on-surface hairline placeholder:text-on-surface-faint focus:outline-none focus:ring-1 focus:ring-secondary"
          />
          <ActionButton
            size="sm"
            type="submit"
            disabled={add.isPending || name.trim().length === 0}
            className="self-start"
          >
            {add.isPending ? 'Adding…' : 'Add guest'}
          </ActionButton>
        </form>
      )}

      {error && (
        <p className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}
    </Tile>
  )
}
