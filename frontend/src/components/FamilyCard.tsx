import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { useErrorText } from '../lib/useErrorText'
import { todayIso } from '../lib/monthGrid'
import {
  EMPTY_PERSON,
  FAMILY_KEY,
  answerLink,
  cancelLink,
  dobOf,
  dobWithAge,
  fetchHouseholds,
  fetchLinkRequests,
  myFamily,
  nameOf,
  removePerson,
  requestLink,
  saveAddress,
  saveHasChildren,
  savePerson,
  type Household,
  type HouseholdMember,
  type LinkRequest,
  type PersonDraft,
  type Relation,
  type Suggestion,
} from '../lib/family'
import { ActionButton, Pill, SectionTile, inputClasses } from './Surface'
import { DateField } from './DateTimeFields'
import { Select } from './Select'
import { PersonPicker } from './PersonPicker'
import { YesNoSwitch } from './YesNoSwitch'
import { showToast } from '../lib/toast'

const labelClasses = 'flex flex-col gap-2 text-body-sm text-on-surface-variant'

/**
 * Who you live with, and where.
 *
 * One household (0149): the address is shared with a linked spouse, and
 * so are the children — either of you adds one and it is on both
 * profiles. Somebody already on the app is chosen from suggestions and
 * asked to confirm; anybody else is written in by hand, and can be swapped
 * for their account later if they join.
 */
export function FamilyCard() {
  const { session } = useAuth()
  const myId = session?.user.id
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const [error, setError] = useState<string | null>(null)

  const familyQuery = useQuery({
    queryKey: [...FAMILY_KEY, 'households'],
    queryFn: fetchHouseholds,
    enabled: !!myId,
  })
  const requestsQuery = useQuery({
    queryKey: [...FAMILY_KEY, 'requests'],
    queryFn: fetchLinkRequests,
    enabled: !!myId,
  })
  const { home, spouse, children, parents } = myFamily(familyQuery.data, myId)
  const outgoing = (requestsQuery.data ?? []).filter((r) => r.from_user === myId)

  const change = useMutation({
    mutationFn: ({ fn }: { fn: () => Promise<void>; said: string }) => fn(),
    onSuccess: (_data, { said }) => {
      setError(null)
      showToast(said)
      // The diary pairs couples' anniversaries from the same links.
      void queryClient.invalidateQueries({ queryKey: ['married-couples'] })
      return queryClient.invalidateQueries({ queryKey: FAMILY_KEY })
    },
    onError: (err: unknown) => {
      const text = errorText(err, 'Could not save that.')
      setError(text)
      showToast(text, 'error')
    },
  })
  const run = (fn: () => Promise<void>, said = 'Family details saved') => change.mutate({ fn, said })
  const busy = change.isPending

  // Answered on the household (0150), so it stays answered — and a linked
  // couple share it. Shown at once while the save is on its way.
  const [answered, setAnswered] = useState<boolean | null>(null)
  const hasKids = answered ?? home?.has_children ?? null
  const showKids = children.length > 0 || hasKids === true

  if (!myId) return null

  return (
    <SectionTile
      title="Family & home"
      hint="Only you, your family on the app and the Owner can see these."
    >
      <div className="flex flex-col gap-6">
        {error && (
          <p role="alert" className="rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
            {error}
          </p>
        )}

        <AddressBlock key={home?.id ?? 'none'} home={home} onSave={(a) => run(() => saveAddress(a), 'Address saved')} />

        <Group title="Spouse">
          {spouse ? (
            <MemberRow
              member={spouse}
              busy={busy}
              unlinkWord={spouse.user_id ? 'Unlink' : 'Remove'}
              onRemove={() => run(() => removePerson(spouse.id), 'Removed')}
              onEdit={(draft) => run(() => savePerson({ id: spouse.id, where: 'home', kind: 'adult', draft }))}
              onLink={(p) => run(() => requestLink(p.id, 'spouse', spouse.id), 'Request sent')}
              myId={myId}
            />
          ) : (
            <Adder
              relation="spouse"
              kind="adult"
              where="home"
              addLabel="Add your spouse"
              busy={busy}
              myId={myId}
              onRequest={(p) => run(() => requestLink(p.id, 'spouse', null), 'Request sent')}
              onWrite={(draft) => run(() => savePerson({ id: null, where: 'home', kind: 'adult', draft }))}
            />
          )}
          <Pending requests={outgoing.filter((r) => r.relation === 'spouse')} busy={busy} onCancel={(id) => run(() => cancelLink(id), 'Request cancelled')} />
        </Group>

        <Group title="Children">
          {children.length === 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-body-sm text-on-surface-variant">Do you have children?</span>
              <YesNoSwitch
                value={hasKids}
                onChange={(next) => {
                  setAnswered(next)
                  run(() => saveHasChildren(next), 'Saved')
                }}
                label="Do you have children?"
              />
            </div>
          )}
          {showKids && (
            <>
              {children.map((child) => (
                <MemberRow
                  key={child.id}
                  member={child}
                  busy={busy}
                  unlinkWord={child.user_id ? 'Unlink' : 'Remove'}
                  onRemove={() => run(() => removePerson(child.id), 'Removed')}
                  onEdit={(draft) => run(() => savePerson({ id: child.id, where: 'home', kind: 'child', draft }))}
                  onLink={(p) => run(() => requestLink(p.id, 'child', child.id), 'Request sent')}
                  myId={myId}
                />
              ))}
              <Adder
                relation="child"
                kind="child"
                where="home"
                addLabel={children.length === 0 ? 'Add a child' : 'Add another child'}
                busy={busy}
                myId={myId}
                onRequest={(p) => run(() => requestLink(p.id, 'child', null), 'Request sent')}
                onWrite={(draft) => run(() => savePerson({ id: null, where: 'home', kind: 'child', draft }))}
              />
              <Pending requests={outgoing.filter((r) => r.relation === 'child')} busy={busy} onCancel={(id) => run(() => cancelLink(id), 'Request cancelled')} />
            </>
          )}
        </Group>

        <Group title="Parents">
          {parents.map((parent) => (
            <MemberRow
              key={parent.id}
              member={parent}
              busy={busy}
              unlinkWord={parent.user_id ? 'Unlink' : 'Remove'}
              onRemove={() => run(() => removePerson(parent.id), 'Removed')}
              onEdit={(draft) => run(() => savePerson({ id: parent.id, where: 'parents', kind: 'adult', draft }))}
              onLink={(p) => run(() => requestLink(p.id, 'parent', parent.id), 'Request sent')}
              myId={myId}
            />
          ))}
          {parents.length < 2 && (
            <Adder
              relation="parent"
              kind="adult"
              where="parents"
              addLabel={parents.length === 0 ? 'Add a parent' : 'Add your other parent'}
              busy={busy}
              myId={myId}
              onRequest={(p) => run(() => requestLink(p.id, 'parent', null), 'Request sent')}
              onWrite={(draft) => run(() => savePerson({ id: null, where: 'parents', kind: 'adult', draft }))}
            />
          )}
          <Pending requests={outgoing.filter((r) => r.relation === 'parent')} busy={busy} onCancel={(id) => run(() => cancelLink(id), 'Request cancelled')} />
        </Group>
      </div>
    </SectionTile>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 border-t border-border-subtle pt-5 first:border-t-0 first:pt-0">
      <h3 className="font-mono text-label-md font-semibold uppercase tracking-[0.12em] text-on-surface-variant">{title}</h3>
      {children}
    </section>
  )
}

function AddressBlock({
  home,
  onSave,
}: {
  home: Household | null
  onSave: (a: { line1: string; line2: string; town: string; postcode: string }) => void
}) {
  const [line1, setLine1] = useState(home?.address_line1 ?? '')
  const [line2, setLine2] = useState(home?.address_line2 ?? '')
  const [town, setTown] = useState(home?.town ?? '')
  const [postcode, setPostcode] = useState(home?.postcode ?? '')
  const changed =
    line1 !== (home?.address_line1 ?? '') ||
    line2 !== (home?.address_line2 ?? '') ||
    town !== (home?.town ?? '') ||
    postcode !== (home?.postcode ?? '')

  // Saves itself a moment after the last keystroke, like the rest of the
  // profile. `onSave` is a new function every render, so it is held in a
  // ref rather than restarting the timer.
  const save = useRef(onSave)
  useEffect(() => {
    save.current = onSave
  })
  useEffect(() => {
    if (!changed) return
    const timer = window.setTimeout(() => save.current({ line1, line2, town, postcode }), 1000)
    return () => window.clearTimeout(timer)
  }, [changed, line1, line2, town, postcode])

  return (
    <Group title="Address">
      <p className="-mt-1 text-label-sm text-on-surface-faint">Shared with your spouse once you are linked.</p>
      <label className={labelClasses}>
        Address line 1
        <input value={line1} onChange={(e) => setLine1(e.target.value)} maxLength={120} autoComplete="address-line1" className={inputClasses} />
      </label>
      <label className={labelClasses}>
        Address line 2 <span className="sr-only">(optional)</span>
        <input value={line2} onChange={(e) => setLine2(e.target.value)} maxLength={120} autoComplete="address-line2" className={inputClasses} />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem]">
        <label className={labelClasses}>
          Town or city
          <input value={town} onChange={(e) => setTown(e.target.value)} maxLength={80} autoComplete="address-level2" className={inputClasses} />
        </label>
        <label className={labelClasses}>
          Postcode
          <input
            value={postcode}
            onChange={(e) => setPostcode(e.target.value)}
            maxLength={12}
            autoComplete="postal-code"
            className={`${inputClasses} uppercase`}
          />
        </label>
      </div>
    </Group>
  )
}

function MemberRow({
  member,
  busy,
  unlinkWord,
  onRemove,
  onEdit,
  onLink,
  myId,
}: {
  member: HouseholdMember
  busy: boolean
  unlinkWord: string
  onRemove: () => void
  onEdit: (draft: PersonDraft) => void
  onLink: (person: Suggestion) => void
  myId: string
}) {
  const [mode, setMode] = useState<'view' | 'edit' | 'link' | 'confirm-remove'>('view')
  const linked = !!member.user_id
  const dob = dobOf(member)
  const extras = [
    member.kind === 'child' && member.gender ? (member.gender === 'male' ? 'Boy' : 'Girl') : null,
    member.year_group,
    member.school,
  ].filter(Boolean)

  if (mode === 'edit') {
    return (
      <PersonForm
        kind={member.kind}
        initial={{
          first_name: member.first_name ?? '',
          last_name: member.last_name ?? '',
          dob: member.dob ?? '',
          gender: member.gender ?? '',
          school: member.school ?? '',
          year_group: member.year_group ?? '',
        }}
        busy={busy}
        onCancel={() => setMode('view')}
        onSave={(draft) => {
          onEdit(draft)
          setMode('view')
        }}
      />
    )
  }

  return (
    <div className="rounded-[var(--radius-row)] bg-raised px-4 py-3 hairline">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 break-words text-body-md font-medium text-on-surface">{nameOf(member)}</span>
        <Pill tone={linked ? 'green' : 'neutral'}>{linked ? 'Linked' : 'Added by hand'}</Pill>
      </div>
      {(dob || extras.length > 0) && (
        <p className="mt-1 text-label-md text-on-surface-variant">
          {[dob ? dobWithAge(dob) : null, ...extras].filter(Boolean).join(' · ')}
        </p>
      )}

      {mode === 'link' && (
        <div className="mt-3">
          <PersonPicker
            label={`Find ${nameOf(member)} on the app`}
            myId={myId}
            onPick={(p) => {
              onLink(p)
              setMode('view')
            }}
            onWriteIn={() => setMode('view')}
          />
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {mode === 'confirm-remove' ? (
          <>
            <span className="text-label-md text-on-surface-variant">
              {linked ? `Unlink ${nameOf(member)}?` : `Remove ${nameOf(member)}?`}
            </span>
            <button type="button" disabled={busy} onClick={onRemove} className="tap text-label-md font-medium text-error hover:underline">
              Yes, {unlinkWord.toLowerCase()}
            </button>
            <button type="button" onClick={() => setMode('view')} className="tap text-label-md text-on-surface-faint hover:underline">
              Cancel
            </button>
          </>
        ) : (
          <>
            {!linked && (
              <>
                <button type="button" onClick={() => setMode('edit')} className="tap text-label-md text-accent-blue-soft hover:underline">
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setMode(mode === 'link' ? 'view' : 'link')}
                  className="tap text-label-md text-accent-blue-soft hover:underline"
                >
                  {mode === 'link' ? 'Close' : 'On the app now? Link their account'}
                </button>
              </>
            )}
            <button type="button" onClick={() => setMode('confirm-remove')} className="tap text-label-md text-on-surface-faint hover:text-error hover:underline">
              {unlinkWord}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Adding somebody: find their account, or write them in.
 */
function Adder({
  relation,
  kind,
  addLabel,
  busy,
  myId,
  onRequest,
  onWrite,
}: {
  relation: Relation
  kind: 'adult' | 'child'
  where: 'home' | 'parents'
  addLabel: string
  busy: boolean
  myId: string
  onRequest: (person: Suggestion) => void
  onWrite: (draft: PersonDraft) => void
}) {
  const [mode, setMode] = useState<'idle' | 'search' | 'confirm' | 'write'>('idle')
  const [picked, setPicked] = useState<Suggestion | null>(null)
  const [draft, setDraft] = useState<PersonDraft>(EMPTY_PERSON)

  if (mode === 'idle') {
    return (
      <ActionButton size="sm" tone="ghost" glyph="+" onClick={() => setMode('search')} className="self-start">
        {addLabel}
      </ActionButton>
    )
  }

  if (mode === 'confirm' && picked) {
    return (
      <div className="flex flex-col gap-2 rounded-[var(--radius-row)] bg-raised px-4 py-3 hairline">
        <p className="text-body-sm text-on-surface">
          Send {picked.first_name} {picked.last_name} a request? They will be asked to confirm they are your {relation},
          and nothing is linked until they do.
        </p>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            size="sm"
            disabled={busy}
            onClick={() => {
              onRequest(picked)
              setMode('idle')
              setPicked(null)
            }}
          >
            Send request
          </ActionButton>
          <ActionButton size="sm" tone="ghost" onClick={() => setMode('search')}>
            Back
          </ActionButton>
        </div>
      </div>
    )
  }

  if (mode === 'write') {
    return (
      <PersonForm
        kind={kind}
        initial={draft}
        busy={busy}
        onCancel={() => setMode('idle')}
        onSave={(next) => {
          onWrite(next)
          setMode('idle')
          setDraft(EMPTY_PERSON)
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <PersonPicker
        label={addLabel}
        myId={myId}
        onPick={(p) => {
          setPicked(p)
          setMode('confirm')
        }}
        onWriteIn={(typed) => {
          const [first, ...rest] = typed.split(/\s+/)
          setDraft({ ...EMPTY_PERSON, first_name: first ?? '', last_name: rest.join(' ') })
          setMode('write')
        }}
      />
      <button type="button" onClick={() => setMode('idle')} className="tap self-start text-label-md text-on-surface-faint hover:underline">
        Cancel
      </button>
    </div>
  )
}

/** A person written in by hand. A child carries a little more. */
function PersonForm({
  kind,
  initial,
  busy,
  onSave,
  onCancel,
}: {
  kind: 'adult' | 'child'
  initial: PersonDraft
  busy: boolean
  onSave: (draft: PersonDraft) => void
  onCancel: () => void
}) {
  const [d, setD] = useState<PersonDraft>(initial)
  const set = <K extends keyof PersonDraft>(k: K, v: PersonDraft[K]) => setD((cur) => ({ ...cur, [k]: v }))
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-row)] bg-raised px-4 py-4 hairline">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={labelClasses}>
          First name
          <input value={d.first_name} onChange={(e) => set('first_name', e.target.value)} maxLength={60} className={inputClasses} />
        </label>
        <label className={labelClasses}>
          Last name
          <input value={d.last_name} onChange={(e) => set('last_name', e.target.value)} maxLength={60} className={inputClasses} />
        </label>
      </div>
      <label className={labelClasses}>
        Date of birth
        <DateField value={d.dob} onChange={(v) => set('dob', v)} label="Date of birth" max={todayIso()} clearable />
      </label>
      {kind === 'child' && (
        <>
          <label className={labelClasses}>
            Gender
            <Select
              value={d.gender}
              onChange={(v) => set('gender', v as PersonDraft['gender'])}
              placeholder="Choose one"
              aria-label="Gender"
              options={[
                { value: 'male', label: 'Boy' },
                { value: 'female', label: 'Girl' },
              ]}
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className={labelClasses}>
              School
              <input value={d.school} onChange={(e) => set('school', e.target.value)} maxLength={120} className={inputClasses} />
            </label>
            <label className={labelClasses}>
              Year group
              <input
                value={d.year_group}
                onChange={(e) => set('year_group', e.target.value)}
                maxLength={40}
                placeholder="e.g. Year 6"
                className={inputClasses}
              />
            </label>
          </div>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <ActionButton size="sm" disabled={busy || !d.first_name.trim()} onClick={() => onSave(d)}>
          Save
        </ActionButton>
        <ActionButton size="sm" tone="ghost" onClick={onCancel}>
          Cancel
        </ActionButton>
      </div>
    </div>
  )
}

function Pending({
  requests,
  busy,
  onCancel,
}: {
  requests: LinkRequest[]
  busy: boolean
  onCancel: (id: string) => void
}) {
  if (requests.length === 0) return null
  return (
    <ul className="flex flex-col gap-1.5">
      {requests.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label-md text-on-surface-variant">
          <span>
            Waiting for {r.to ? `${r.to.first_name} ${r.to.last_name}` : 'them'} to confirm.
          </span>
          <button type="button" disabled={busy} onClick={() => onCancel(r.id)} className="tap text-on-surface-faint hover:underline">
            Cancel request
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * Requests waiting on me, for the dashboard: somebody has said I am their
 * spouse, child or parent, and nothing is linked until I answer.
 */
export function FamilyRequests() {
  const { session } = useAuth()
  const myId = session?.user.id
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const [error, setError] = useState<string | null>(null)
  const requestsQuery = useQuery({
    queryKey: [...FAMILY_KEY, 'requests'],
    queryFn: fetchLinkRequests,
    enabled: !!myId,
  })
  const answer = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) => answerLink(id, accept),
    onSuccess: (_data, { accept }) => {
      setError(null)
      showToast(accept ? 'Linked — your family is updated' : 'Request declined')
      // The diary pairs couples' anniversaries from the same links.
      void queryClient.invalidateQueries({ queryKey: ['married-couples'] })
      return queryClient.invalidateQueries({ queryKey: FAMILY_KEY })
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not answer that.')),
  })
  const mine = (requestsQuery.data ?? []).filter((r) => r.to_user === myId)
  if (mine.length === 0) return null

  return (
    <SectionTile title="Family requests" hint="Somebody has added you to their family. Nothing is shared until you confirm." tone="accent" className="mb-6">
      <ul className="flex flex-col gap-3">
        {mine.map((r) => {
          const who = r.from ? `${r.from.first_name} ${r.from.last_name}` : 'Somebody'
          return (
            <li key={r.id} className="flex flex-col gap-2 rounded-[var(--radius-row)] bg-raised px-4 py-3 hairline sm:flex-row sm:items-center sm:justify-between">
              <span className="text-body-sm text-on-surface">
                <span className="font-medium">{who}</span> says you are their {r.relation}.
              </span>
              <span className="flex flex-wrap gap-2">
                <ActionButton size="sm" disabled={answer.isPending} onClick={() => answer.mutate({ id: r.id, accept: true })}>
                  Confirm
                </ActionButton>
                <ActionButton size="sm" tone="ghost" disabled={answer.isPending} onClick={() => answer.mutate({ id: r.id, accept: false })}>
                  Not me
                </ActionButton>
              </span>
            </li>
          )
        })}
      </ul>
      {error && <p role="alert" className="mt-3 text-body-sm text-error">{error}</p>}
    </SectionTile>
  )
}
