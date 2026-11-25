import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Overlay } from './Surface'
import { PersonForm } from './FamilyCard'
import { PersonPicker } from './PersonPicker'
import { QueryState } from './QueryState'
import { Select, reachPickerClasses } from './Select'
import { useErrorText } from '../lib/useErrorText'
import { GUESTS_KEY, fetchGuests } from '../lib/guests'
import { guestLine, guestMatches, personJoined } from '../lib/personJoined'
import { EMPTY_PERSON, type PersonDraft, type Suggestion } from '../lib/family'
import {
  FAMILY_RELATIONS,
  FAMILY_WORDS,
  FAMILY_WORD_LIST,
  LIST_OF,
  WORDS_OF,
  WORD_MEANS,
  draftOf,
  familyOfKey,
  fetchFamilyOf,
  fullName,
  linkAlso,
  linkFamily,
  linkedWords,
  removeFamilyPerson,
  saveFamilyPerson,
  sayFamilyWord,
  unlinkFamily,
  unlinkWords,
  wordFor,
  wordLabel,
  wordOf,
  writtenDetails,
  type FamilyOf,
  type FamilyPart,
  type FamilyWord,
  type LinkedPerson,
  type WrittenPerson,
} from '../lib/familyLinks'

/**
 * One person's family, and adding somebody to it (0319, 0320).
 *
 * For whoever holds `people.family`: the Owner asked to be able to link
 * members himself — "husband and wife. Or kids to their parents" — where
 * until now only the family could, one asking and the other saying yes.
 * This is that link made directly: nobody is asked, and everybody whose
 * household changes is told.
 *
 * Somebody who is not on the app is written in by hand (0320: "For those
 * who aren't in the app, give the ability to add the details manually
 * (until they come as a member in future)"): the name box offers it as
 * soon as a name is typed, with the form the family's own profile uses.
 * When that person joins, linking their account takes the entry's place.
 *
 * It shows who is linked and who is written in, with what is written
 * about them, and never a family's address (lib/familyLinks).
 *
 * Somebody is added by a word (0328: "separate options as husband, wife,
 * son, sister"), and the word is chosen before the name: with eight of
 * them a list that started on one would be wrong seven times in eight.
 * Each person already there has their word beside them, to be said or
 * put right without unlinking: the families linked before the words
 * have none.
 *
 * Nothing here is one tap. Choosing a name shows what is about to be
 * linked and asks; Unlink and Remove say what they take away and ask. A
 * change tells a family something about itself, so a slip of the thumb
 * must not be one.
 */
export function FamilyLinksDialog({
  person,
  onClose,
  marksGuests = false,
}: {
  person: { id: string; first_name: string; last_name: string }
  onClose: () => void
  /** Whether the reader may change the guest list (svc.guests): see FamilyLinksPanel. */
  marksGuests?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const name = fullName(person)
  const first = person.first_name || 'them'
  return (
    <Overlay closable={!busy} onDismiss={onClose} label={`${name}’s family`}>
      <div className="w-full max-w-md rounded-[var(--radius-shell)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12">
        <h2 className="break-words pr-8 text-headline-md">{name}’s family</h2>
        <p className="mt-2 text-body-sm text-on-surface-variant">
          Link {first} to the people on the app who are their family: they are linked straight away, with nobody having to
          confirm. Somebody who is not on the app yet can be written in by hand. The family is told of each change.
        </p>

        <FamilyLinksPanel person={person} onBusyChange={setBusy} marksGuests={marksGuests} />

        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onClose} disabled={busy} className={quietButton}>
            Done
          </button>
        </div>
      </div>
    </Overlay>
  )
}

/**
 * The family itself and the box that adds to it, without the dialog round
 * them: the Families page (0326) has the same thing under a family's picture.
 * `onBusyChange` tells whoever holds it that a change is on its way, so a
 * dialog does not shut under one.
 *
 * `marksGuests` is whether the reader holds svc.guests. The account being
 * linked may also be on the guest list, from before they joined; for a
 * reader who may change that list, the question that confirms the link
 * offers to mark the guest a member in the same step (0332,
 * lib/personJoined).
 */
export function FamilyLinksPanel({
  person,
  onBusyChange,
  marksGuests = false,
}: {
  person: { id: string; first_name: string; last_name: string }
  onBusyChange?: (busy: boolean) => void
  marksGuests?: boolean
}) {
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  // What the person being added is to this one. Nothing until it is chosen.
  const [word, setWord] = useState<FamilyWord | ''>('')
  // What is being added: an account that was chosen, or somebody being written in.
  const [adding, setAdding] = useState<{ account: Suggestion } | { draft: PersonDraft } | null>(null)
  // The one row that is open: asked about, or being changed.
  const [open, setOpen] = useState<{ id: string; mode: 'unlink' | 'edit' | 'remove' } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  // The guest ticked to be marked a member along with the link; null for none.
  const [alsoGuest, setAlsoGuest] = useState<string | null>(null)

  const first = person.first_name || 'them'

  const query = useQuery({ queryKey: familyOfKey(person.id), queryFn: () => fetchFamilyOf(person.id) })
  const guestsQuery = useQuery({ queryKey: GUESTS_KEY, queryFn: fetchGuests, enabled: marksGuests })
  const chosenAccount = adding && 'account' in adding ? adding.account : null
  const onTheRoll = chosenAccount && marksGuests ? guestMatches(guestsQuery.data ?? [], fullName(chosenAccount)) : []

  const settled = (words: string) => {
    setAdding(null)
    setOpen(null)
    setError(null)
    setSaid(words)
    // The household, and the diary's couples, wherever they are shown.
    void queryClient.invalidateQueries({ queryKey: ['family'] })
    void queryClient.invalidateQueries({ queryKey: ['married-couples'] })
  }
  const failed = (fallback: string) => (err: unknown) => {
    setSaid(null)
    setError(errorText(err, fallback))
  }
  /** Starting something new clears what the last thing said. */
  const begin = () => {
    setError(null)
    setSaid(null)
  }

  const link = useMutation({
    mutationFn: async (v: { to: Suggestion; word: FamilyWord; guest: { id: string } | null }) => {
      const answer = await linkFamily(person.id, v.to.id, v.word)
      if (!v.guest) return { answer, guest: null as string | null }
      // The family is linked by now; the guest list is a second thing, and says so if it would not go.
      try {
        await personJoined(v.to.id, v.guest.id, [])
        return { answer, guest: ` ${fullName(v.to)} is also marked as a member on the guest list.` }
      } catch (err) {
        return { answer, guest: ` The guest list was not changed: ${errorText(err, 'it could not be saved')}` }
      }
    },
    onSuccess: (got, v) => {
      settled(linkedWords(person, v.to, v.word, got.answer) + (got.guest ?? ''))
      if (v.guest) void queryClient.invalidateQueries({ queryKey: GUESTS_KEY })
    },
    onError: failed('Could not link them.'),
  })
  const unlink = useMutation({
    mutationFn: (v: { who: LinkedPerson }) => unlinkFamily(person.id, v.who.id),
    onSuccess: (_d, v) => settled(`${fullName(v.who)} is no longer linked to ${first}. They have both been told.`),
    onError: failed('Could not unlink them.'),
  })
  const save = useMutation({
    mutationFn: (v: { id: string | null; word: FamilyWord | null; draft: PersonDraft }) =>
      saveFamilyPerson({ personId: person.id, word: v.word, id: v.id, draft: v.draft }),
    onSuccess: (_d, v) =>
      settled(
        v.id || !v.word
          ? `${fullName(v.draft)}’s details are saved.`
          : // A child's form asks boy or girl, and what it says is what is kept.
            `${fullName(v.draft)} is written in as ${first}’s ${wordFor(WORD_MEANS[v.word].part, v.draft.gender || WORD_MEANS[v.word].gender)}. The family has been told.`,
      ),
    onError: failed('Could not save their details.'),
  })
  const remove = useMutation({
    mutationFn: (v: { who: WrittenPerson }) => removeFamilyPerson(person.id, v.who.id),
    onSuccess: (_d, v) => settled(`${fullName(v.who)} is taken off ${first}’s family.`),
    onError: failed('Could not remove them.'),
  })
  const say = useMutation({
    mutationFn: (v: { who: { account: string } | { written: string }; name: string; word: FamilyWord }) =>
      sayFamilyWord(person.id, v.who, v.word),
    onSuccess: (_d, v) => settled(`${v.name} is down as ${first}’s ${v.word}.`),
    onError: failed('Could not save that.'),
  })
  const busy = link.isPending || unlink.isPending || save.isPending || remove.isPending || say.isPending

  const family = query.data
  const anyWritten = !!family && FAMILY_RELATIONS.some((r) => family.written_people[LIST_OF[r]].length > 0)


  useEffect(() => {
    onBusyChange?.(busy)
  }, [busy, onBusyChange])

  return (
    <div>
    <QueryState isLoading={query.isLoading} error={query.error}>
      {family && (
        <div className="mt-4 flex flex-col gap-4">
          {FAMILY_RELATIONS.map((part) => (
            <FamilyList
              key={part}
              relation={part}
              linked={family[LIST_OF[part]]}
              written={family.written_people[LIST_OF[part]]}
              person={person}
              family={family}
              open={open}
              busy={busy}
              onOpen={(id, mode) => {
                begin()
                setAdding(null)
                setOpen({ id, mode })
              }}
              onShut={() => setOpen(null)}
              onUnlink={(who) => unlink.mutate({ who })}
              onSave={(who, draft) => save.mutate({ id: who.id, word: null, draft })}
              onRemove={(who) => remove.mutate({ who })}
              onSay={(who, name, said) => {
                begin()
                setAdding(null)
                setOpen(null)
                say.mutate({ who, name, word: said })
              }}
            />
          ))}
          {anyWritten && (
            <p className="text-label-md text-on-surface-faint">
              When somebody written in joins the app, link their account here and it takes their place.
            </p>
          )}
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
      <section aria-label="Add somebody" className="mt-5 border-t border-black/8 pt-4 dark:border-white/10">
        <h3 className="text-label-md font-medium text-on-surface-variant">Add somebody</h3>
        <div className="mt-2 flex flex-col gap-2">
          <Select
            value={word}
            onChange={(next) => {
              setWord(next as FamilyWord)
              setError(null)
              // A form that is open starts again from the new word: a child's asks more than an adult's.
              if (adding && 'draft' in adding) setAdding({ draft: { ...adding.draft, gender: '' } })
            }}
            aria-label={`What they are to ${first}`}
            // Short: the field is as wide as a phone, and the label already names the person.
            placeholder="Choose what they are"
            options={FAMILY_WORD_LIST.map((w) => ({ value: w, label: `${first}’s ${w}` }))}
          />
          {!word ? (
            <p className="text-body-sm text-on-surface-variant">Then give their name: somebody on the app, or somebody to write in.</p>
          ) : adding && 'account' in adding ? (
            <div role="group" aria-label="Confirm the link" className="rounded-[var(--radius-row)] bg-raised p-3 hairline">
              <p className="text-body-sm text-on-surface [overflow-wrap:anywhere]">
                Link <span className="font-semibold">{fullName(adding.account)}</span> as {first}’s {word}?
              </p>
              {family && linkAlso(person, adding.account, word, family) && (
                <p className="mt-1.5 text-body-sm text-on-surface-variant [overflow-wrap:anywhere]">
                  {linkAlso(person, adding.account, word, family)}
                </p>
              )}
              {onTheRoll.length > 0 && (
                <ul aria-label="Also on the guest list" className="mt-2.5 flex flex-col gap-1.5">
                  {onTheRoll.map((m) => (
                    <li key={m.guest.id}>
                      <label className="tap flex items-start gap-2.5 text-body-sm text-on-surface">
                        <input
                          type="checkbox"
                          id={`guest-${m.guest.id}`}
                          className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
                          // One account is one guest: ticking another moves the tick.
                          checked={alsoGuest === m.guest.id}
                          disabled={busy}
                          onChange={(e) => setAlsoGuest(e.target.checked ? m.guest.id : null)}
                        />
                        <span className="min-w-0 [overflow-wrap:anywhere]">
                          {guestLine(m)}. Mark them as a member too, so their teams and rota move to the account.
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => setAdding(null)} disabled={busy} className={quietButton}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError(null)
                    const also = onTheRoll.find((m) => m.guest.id === alsoGuest)
                    link.mutate({ to: adding.account, word, guest: also ? { id: also.guest.id } : null })
                  }}
                  disabled={busy}
                  className={primaryButton}
                >
                  {link.isPending ? 'Linking…' : 'Link'}
                </button>
              </div>
            </div>
          ) : adding ? (
            <div role="group" aria-label={`Write in ${first}’s ${word}`}>
              <p className="mb-2 text-body-sm text-on-surface-variant">
                Not on the app: written in as {first}’s {word}, until they join.
              </p>
              <PersonForm
                // The form is the word's: a child's asks a little more, and starts on what the word says.
                key={word}
                kind={formKind(WORD_MEANS[word].part)}
                initial={{
                  ...adding.draft,
                  gender: formKind(WORD_MEANS[word].part) === 'child' ? adding.draft.gender || WORD_MEANS[word].gender : '',
                }}
                busy={busy}
                onCancel={() => setAdding(null)}
                onSave={(draft) => {
                  setError(null)
                  // Kept as typed, so a refusal leaves the form as it was.
                  setAdding({ draft })
                  save.mutate({ id: null, word, draft })
                }}
              />
            </div>
          ) : (
            <PersonPicker
              label="Name of the person to add"
              myId={person.id}
              onPick={(p) => {
                begin()
                setOpen(null)
                setAdding({ account: p })
                // Ticked to begin with only where the whole name is the same and there is one of them.
                const found = marksGuests ? guestMatches(guestsQuery.data ?? [], fullName(p)) : []
                setAlsoGuest(found.length === 1 && found[0].exact ? found[0].guest.id : null)
              }}
              onWriteIn={(typed) => {
                begin()
                setOpen(null)
                const [given, ...rest] = typed.split(/\s+/)
                setAdding({ draft: { ...EMPTY_PERSON, first_name: given ?? '', last_name: rest.join(' ') } })
              }}
            />
          )}
        </div>
      </section>
    )}
    </div>
  )
}

const quietButton =
  'tap rounded-full px-4 py-2.5 text-body-sm font-medium text-on-surface ring-1 ring-black/8 transition-[background-color,color,box-shadow,opacity,transform] duration-200 ease-[var(--ease-glide)] hover:ring-black/20 disabled:opacity-50 dark:ring-white/10'
const primaryButton =
  'tap rounded-full bg-primary px-5 py-2.5 text-body-sm font-semibold text-on-primary transition-transform duration-300 ease-[var(--ease-glide)] active:scale-[0.97] active:duration-[80ms] disabled:opacity-50'
const dangerButton =
  'tap rounded-full bg-error px-5 py-2.5 text-body-sm font-semibold text-on-error transition-transform duration-300 ease-[var(--ease-glide)] active:scale-[0.97] active:duration-[80ms] disabled:opacity-50'
const rowButton =
  'tap shrink-0 rounded-full px-3 py-1.5 text-label-md font-medium ring-1 ring-black/8 disabled:opacity-50 dark:ring-white/10'

/** A child of a household is asked a little more than an adult of it; a brother or sister is a child of theirs. */
const formKind = (part: FamilyPart): 'adult' | 'child' => (part === 'child' || part === 'sibling' ? 'child' : 'adult')

/**
 * The word beside somebody already in the family: which of the list's two
 * they are, to be said or put right. Until somebody says, it shows the
 * pair ("Husband or wife") and holds neither.
 */
function WordPicker({
  part,
  gender,
  name,
  first,
  busy,
  onSay,
}: {
  part: FamilyPart
  gender: 'male' | 'female' | null | undefined
  name: string
  first: string
  busy: boolean
  onSay: (word: FamilyWord) => void
}) {
  return (
    <Select
      value={wordOf(part, gender) ?? ''}
      onChange={(next) => onSay(next as FamilyWord)}
      aria-label={`What ${name} is to ${first}`}
      placeholder={wordLabel(part, null)}
      options={WORDS_OF[part].map((w) => ({ value: w, label: wordLabel(part, WORD_MEANS[w].gender) }))}
      disabled={busy}
      className={`${reachPickerClasses} mt-1 max-w-full`}
    />
  )
}

/**
 * One of the four lists: the accounts linked that way, then the people
 * written in by hand. An account is unlinked; somebody written in is
 * changed or removed; either has their word beside them.
 */
function FamilyList({
  relation,
  linked,
  written,
  person,
  family,
  open,
  busy,
  onOpen,
  onShut,
  onUnlink,
  onSave,
  onRemove,
  onSay,
}: {
  relation: FamilyPart
  linked: LinkedPerson[]
  written: WrittenPerson[]
  person: { first_name: string }
  family: FamilyOf
  open: { id: string; mode: 'unlink' | 'edit' | 'remove' } | null
  busy: boolean
  onOpen: (id: string, mode: 'unlink' | 'edit' | 'remove') => void
  onShut: () => void
  onUnlink: (who: LinkedPerson) => void
  onSave: (who: WrittenPerson, draft: PersonDraft) => void
  onRemove: (who: WrittenPerson) => void
  onSay: (who: { account: string } | { written: string }, name: string, word: FamilyWord) => void
}) {
  const words = FAMILY_WORDS[relation]
  const first = person.first_name || 'them'
  return (
    <section aria-label={words.heading}>
      <h3 className="text-label-md font-medium text-on-surface-variant">{words.heading}</h3>
      {linked.length + written.length === 0 ? (
        <p className="mt-1 text-body-sm text-on-surface-variant">Nobody listed.</p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {linked.map((p) => {
            const asking = open?.id === p.id && open.mode === 'unlink'
            return (
              <li key={p.id} className="rounded-[var(--radius-row)] bg-raised px-3 py-2 hairline">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-body-md text-on-surface [overflow-wrap:anywhere]">{fullName(p)}</p>
                    <WordPicker
                      part={relation}
                      gender={p.gender}
                      name={fullName(p)}
                      first={first}
                      busy={busy}
                      onSay={(said) => onSay({ account: p.id }, fullName(p), said)}
                    />
                  </div>
                  {!asking && (
                    <button
                      type="button"
                      onClick={() => onOpen(p.id, 'unlink')}
                      disabled={busy}
                      aria-label={`Unlink ${fullName(p)}`}
                      className={`${rowButton} text-error hover:ring-error/40`}
                    >
                      Unlink
                    </button>
                  )}
                </div>
                {asking && (
                  <div role="group" aria-label={`Unlink ${fullName(p)}?`} className="mt-2">
                    <p className="text-body-sm text-on-surface-variant [overflow-wrap:anywhere]">{unlinkWords(person, p, relation, family)}</p>
                    <div className="mt-2 flex flex-wrap justify-end gap-2">
                      <button type="button" onClick={onShut} disabled={busy} className={quietButton}>
                        Keep the link
                      </button>
                      <button type="button" onClick={() => onUnlink(p)} disabled={busy} className={dangerButton}>
                        Unlink
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
          {written.map((p) => {
            const mode = open?.id === p.id ? open.mode : null
            const details = writtenDetails(p)
            if (mode === 'edit') {
              return (
                <li key={p.id} aria-label={`Change ${fullName(p)}`}>
                  <PersonForm
                    kind={formKind(relation)}
                    initial={draftOf(p)}
                    busy={busy}
                    onCancel={onShut}
                    onSave={(draft) => onSave(p, draft)}
                  />
                </li>
              )
            }
            return (
              <li key={p.id} className="rounded-[var(--radius-row)] bg-raised px-3 py-2 hairline">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <div className="min-w-0">
                    <p className="text-body-md text-on-surface [overflow-wrap:anywhere]">
                      {fullName(p)}{' '}
                      <span className="whitespace-nowrap font-mono text-label-sm text-on-surface-faint">No account</span>
                    </p>
                    {details && <p className="text-label-md text-on-surface-variant [overflow-wrap:anywhere]">{details}</p>}
                    <WordPicker
                      part={relation}
                      gender={p.gender}
                      name={fullName(p)}
                      first={first}
                      busy={busy}
                      onSay={(said) => onSay({ written: p.id }, fullName(p), said)}
                    />
                  </div>
                  {mode !== 'remove' && (
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => onOpen(p.id, 'edit')}
                        disabled={busy}
                        aria-label={`Change ${fullName(p)}`}
                        className={`${rowButton} text-on-surface hover:ring-black/20`}
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpen(p.id, 'remove')}
                        disabled={busy}
                        aria-label={`Remove ${fullName(p)}`}
                        className={`${rowButton} text-error hover:ring-error/40`}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
                {mode === 'remove' && (
                  <div role="group" aria-label={`Remove ${fullName(p)}?`} className="mt-2">
                    <p className="text-body-sm text-on-surface-variant [overflow-wrap:anywhere]">
                      {p.first_name || 'They'} is written in by hand, so this takes what is written about them off {first}’s family.
                      It cannot be undone.
                    </p>
                    <div className="mt-2 flex flex-wrap justify-end gap-2">
                      <button type="button" onClick={onShut} disabled={busy} className={quietButton}>
                        Keep them
                      </button>
                      <button type="button" onClick={() => onRemove(p)} disabled={busy} className={dangerButton}>
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
