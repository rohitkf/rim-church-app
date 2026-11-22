import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Overlay } from './Surface'
import { PersonPicker } from './PersonPicker'
import { QueryState } from './QueryState'
import { Select } from './Select'
import { useErrorText } from '../lib/useErrorText'
import type { Relation, Suggestion } from '../lib/family'
import {
  FAMILY_RELATIONS,
  FAMILY_WORDS,
  familyOfKey,
  fetchFamilyOf,
  fullName,
  linkFamily,
  unlinkFamily,
  unlinkWords,
  writtenWords,
  type FamilyOf,
  type LinkedPerson,
} from '../lib/familyLinks'

/**
 * One person's family, and linking somebody to it (0319).
 *
 * For whoever holds `people.family`: the Owner asked to be able to link
 * members himself — "husband and wife. Or kids to their parents" — where
 * until now only the family could, one asking and the other saying yes.
 * This is that link made directly: nobody is asked, and everybody whose
 * household changes is told.
 *
 * It shows the accounts linked to the person and how many people are
 * written in by hand, never who those are: a household's own details are
 * the family's (lib/familyLinks).
 *
 * Nothing here is one tap. Choosing a name shows what is about to be
 * linked and asks; Unlink says what it takes away and asks. A link tells
 * two people something about their family, so a slip of the thumb must
 * not be one.
 */
export function FamilyLinksDialog({
  person,
  onClose,
}: {
  person: { id: string; first_name: string; last_name: string }
  onClose: () => void
}) {
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [relation, setRelation] = useState<Relation>('spouse')
  const [chosen, setChosen] = useState<Suggestion | null>(null)
  const [unlinking, setUnlinking] = useState<{ who: LinkedPerson; relation: Relation } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)

  const name = fullName(person)
  const first = person.first_name || 'them'

  const query = useQuery({ queryKey: familyOfKey(person.id), queryFn: () => fetchFamilyOf(person.id) })

  const settled = (words: string) => {
    setChosen(null)
    setUnlinking(null)
    setError(null)
    setSaid(words)
    // The household, and the diary's couples, wherever they are shown.
    void queryClient.invalidateQueries({ queryKey: ['family'] })
    void queryClient.invalidateQueries({ queryKey: ['married-couples'] })
  }

  const link = useMutation({
    mutationFn: (v: { to: Suggestion; relation: Relation }) => linkFamily(person.id, v.to.id, v.relation),
    onSuccess: (_d, v) => settled(`${fullName(v.to)} is now linked as ${first}’s ${FAMILY_WORDS[v.relation].one}. They have both been told.`),
    onError: (err: unknown) => {
      setSaid(null)
      setError(errorText(err, 'Could not link them.'))
    },
  })
  const unlink = useMutation({
    mutationFn: (v: { who: LinkedPerson }) => unlinkFamily(person.id, v.who.id),
    onSuccess: (_d, v) => settled(`${fullName(v.who)} is no longer linked to ${first}. They have both been told.`),
    onError: (err: unknown) => {
      setSaid(null)
      setError(errorText(err, 'Could not unlink them.'))
    },
  })
  const busy = link.isPending || unlink.isPending

  const family = query.data

  return (
    <Overlay closable={!busy} onDismiss={onClose} label={`${name}’s family`}>
      <div className="w-full max-w-md rounded-[var(--radius-shell)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12">
        <h2 className="break-words pr-8 text-headline-md">{name}’s family</h2>
        <p className="mt-2 text-body-sm text-on-surface-variant">
          Link {first} to the people on the app who are their family. They are linked straight away, with nobody having to
          confirm, and each of them is told.
        </p>

        <QueryState isLoading={query.isLoading} error={query.error}>
          {family && (
            <div className="mt-4 flex flex-col gap-4">
              {FAMILY_RELATIONS.map((part) => (
                <LinkedList
                  key={part}
                  relation={part}
                  people={part === 'spouse' ? family.spouse : part === 'child' ? family.children : family.parents}
                  written={part === 'spouse' ? family.written.spouse : part === 'child' ? family.written.children : family.written.parents}
                  person={person}
                  family={family}
                  unlinking={unlinking}
                  busy={busy}
                  onAsk={(who) => {
                    setError(null)
                    setSaid(null)
                    setUnlinking({ who, relation: part })
                  }}
                  onCancel={() => setUnlinking(null)}
                  onUnlink={(who) => unlink.mutate({ who })}
                  pending={unlink.isPending}
                />
              ))}
            </div>
          )}
        </QueryState>

        {said && (
          <p role="status" className="mt-4 rounded-[var(--radius-chip)] bg-raised px-3 py-2 text-body-sm text-on-surface hairline [overflow-wrap:anywhere]">
            {said}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container [overflow-wrap:anywhere]">
            {error}
          </p>
        )}

        {family && (
          <section aria-label="Link somebody" className="mt-5 border-t border-black/8 pt-4 dark:border-white/10">
            <h3 className="text-label-md font-medium uppercase tracking-wide text-on-surface-faint">Link somebody</h3>
            <div className="mt-2 flex flex-col gap-2">
              <Select
                value={relation}
                onChange={(next) => {
                  setRelation(next as Relation)
                  setError(null)
                }}
                aria-label={`What they are to ${first}`}
                options={FAMILY_RELATIONS.map((r) => ({ value: r, label: `${first}’s ${FAMILY_WORDS[r].one}` }))}
              />
              {chosen ? (
                <div role="group" aria-label="Confirm the link" className="rounded-[var(--radius-row)] bg-raised p-3 hairline">
                  <p className="text-body-sm text-on-surface [overflow-wrap:anywhere]">
                    Link <span className="font-semibold">{fullName(chosen)}</span> as {first}’s {FAMILY_WORDS[relation].one}?
                  </p>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={() => setChosen(null)} disabled={busy} className={quietButton}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null)
                        link.mutate({ to: chosen, relation })
                      }}
                      disabled={busy}
                      className={primaryButton}
                    >
                      {link.isPending ? 'Linking…' : 'Link'}
                    </button>
                  </div>
                </div>
              ) : (
                <PersonPicker
                  label="Name of the person to link"
                  myId={person.id}
                  onPick={(p) => {
                    setError(null)
                    setSaid(null)
                    setChosen(p)
                  }}
                />
              )}
            </div>
          </section>
        )}

        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onClose} disabled={busy} className={quietButton}>
            Done
          </button>
        </div>
      </div>
    </Overlay>
  )
}

const quietButton =
  'tap rounded-full px-4 py-2.5 text-body-sm font-medium text-on-surface ring-1 ring-black/8 transition-[background-color,color,box-shadow,opacity,transform] duration-200 ease-[var(--ease-glide)] hover:ring-black/20 disabled:opacity-50 dark:ring-white/10'
const primaryButton =
  'tap rounded-full bg-primary px-5 py-2.5 text-body-sm font-semibold text-on-primary transition-transform duration-300 ease-[var(--ease-glide)] active:scale-[0.97] active:duration-[80ms] disabled:opacity-50'
const dangerButton =
  'tap rounded-full bg-error px-5 py-2.5 text-body-sm font-semibold text-on-error transition-transform duration-300 ease-[var(--ease-glide)] active:scale-[0.97] active:duration-[80ms] disabled:opacity-50'

/** One of the three lists: who is linked that way, each with a way to unlink them. */
function LinkedList({
  relation,
  people,
  written,
  person,
  family,
  unlinking,
  busy,
  pending,
  onAsk,
  onCancel,
  onUnlink,
}: {
  relation: Relation
  people: LinkedPerson[]
  written: number
  person: { first_name: string }
  family: FamilyOf
  unlinking: { who: LinkedPerson; relation: Relation } | null
  busy: boolean
  pending: boolean
  onAsk: (who: LinkedPerson) => void
  onCancel: () => void
  onUnlink: (who: LinkedPerson) => void
}) {
  const words = FAMILY_WORDS[relation]
  const note = writtenWords(relation, written)
  return (
    <section aria-label={words.heading}>
      <h3 className="text-label-md font-medium uppercase tracking-wide text-on-surface-faint">{words.heading}</h3>
      {people.length === 0 ? (
        <p className="mt-1 text-body-sm text-on-surface-variant">Nobody linked.</p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {people.map((p) => {
            const asking = unlinking?.who.id === p.id && unlinking.relation === relation
            return (
              <li key={p.id} className="rounded-[var(--radius-row)] bg-raised px-3 py-2 hairline">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 text-body-md text-on-surface [overflow-wrap:anywhere]">{fullName(p)}</span>
                  {!asking && (
                    <button
                      type="button"
                      onClick={() => onAsk(p)}
                      disabled={busy}
                      aria-label={`Unlink ${fullName(p)}`}
                      className="tap shrink-0 rounded-full px-3 py-1.5 text-label-md font-medium text-error ring-1 ring-black/8 hover:ring-error/40 disabled:opacity-50 dark:ring-white/10"
                    >
                      Unlink
                    </button>
                  )}
                </div>
                {asking && (
                  <div role="group" aria-label={`Unlink ${fullName(p)}?`} className="mt-2">
                    <p className="text-body-sm text-on-surface-variant [overflow-wrap:anywhere]">{unlinkWords(person, p, relation, family)}</p>
                    <div className="mt-2 flex flex-wrap justify-end gap-2">
                      <button type="button" onClick={onCancel} disabled={busy} className={quietButton}>
                        Keep the link
                      </button>
                      <button type="button" onClick={() => onUnlink(p)} disabled={busy} className={dangerButton}>
                        {pending ? 'Unlinking…' : 'Unlink'}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {note && <p className="mt-1 text-label-md text-on-surface-faint">{note}</p>}
    </section>
  )
}
