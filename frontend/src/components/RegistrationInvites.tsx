import { type FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ActionButton, Field, FieldGroup, Overlay, Pill, SegmentedControl, inputClasses, type PillTone } from './Surface'
import { DateField } from './DateTimeFields'
import { useConfirmAction } from './ConfirmAction'
import { WarningIcon } from './icons'
import { REGISTRATIONS_KEY, type OrderRow, type TicketType } from '../lib/registrations'
import {
  FREE_GROUP_MAX,
  INVITE_LABEL_MAX,
  createInvite,
  deleteInvite,
  fetchInvites,
  inviteGives,
  inviteProblems,
  inviteState,
  inviteUses,
  invitesKey,
  newInviteDraft,
  setInviteActive,
  todayText,
  usesWords,
  type Invite,
  type InviteDraft,
  type InviteField,
  type InviteState,
} from '../lib/registrationInvites'
import { inviteUrl } from '../lib/registrationLinks'
import { downloadBlob, qrPngBlob } from '../lib/qrPng'
import { showToast } from '../lib/toast'
import { useErrorText } from '../lib/useErrorText'

/**
 * An event's invitation links (0295), on the event's own page.
 *
 * A promo code has to be told, and a told code travels. A link made here
 * takes its discount off by itself when it is opened — the person types
 * nothing and is shown no code — and it can be kept to one person (their
 * email address, once) or to a number of uses, and turned off on its own
 * when it gets loose. Each row says what the link gives, how much of it
 * has been used and by whom, counted from the registrations themselves.
 *
 * Whoever may make and edit events makes, turns off and deletes them;
 * any other office right reads the list. With nothing made and no right
 * to make one, nothing is drawn.
 */
export function RegistrationInvites({
  eventId,
  slug,
  eventTitle,
  published,
  ticketTypes,
  orders,
  canEdit,
}: {
  eventId: string
  slug: string
  eventTitle: string
  /** A link opens the event's page, which takes registrations only once published. */
  published: boolean
  ticketTypes: TicketType[]
  /** The event's registrations: a link's uses are counted from them. */
  orders: OrderRow[]
  canEdit: boolean
}) {
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const { ask, dialog } = useConfirmAction()
  const [making, setMaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const invites = useQuery({ queryKey: invitesKey(eventId), queryFn: () => fetchInvites(eventId) })
  const refresh = () => queryClient.invalidateQueries({ queryKey: REGISTRATIONS_KEY })

  const turn = useMutation({
    mutationFn: ({ invite, active }: { invite: Invite; active: boolean }) => setInviteActive(invite.id, active),
    onSuccess: (_r, { active }) => {
      setError(null)
      showToast(active ? 'Link turned back on' : 'Link turned off')
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not change that link.')),
    onSettled: refresh,
  })
  const remove = useMutation({
    mutationFn: (invite: Invite) => deleteInvite(invite.id),
    onSuccess: () => {
      setError(null)
      showToast('Link deleted')
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not delete that link.')),
    onSettled: refresh,
  })
  const qr = useMutation({
    mutationFn: async (invite: Invite) => downloadBlob(await qrPngBlob(inviteUrl(slug, invite.token), eventTitle), `${slug}-invite-qr.png`),
    onSuccess: () => showToast('QR code downloaded'),
    onError: (err: unknown) => setError(errorText(err, 'Could not make the QR code.')),
  })

  const list = invites.data ?? []
  if (list.length === 0 && !canEdit) return null

  const uses = inviteUses(orders)
  const cameBy = (id: string) => orders.filter((o) => o.invite_id === id && o.status === 'confirmed').map((o) => o.name)

  return (
    <section id="invites" aria-labelledby="invites-heading" className="mt-8 scroll-mt-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="invites-heading" className="text-headline-md text-on-surface">
          Invite links
        </h2>
        {canEdit && (
          <ActionButton size="sm" tone="quiet" onClick={() => setMaking(true)} glyph={<span aria-hidden="true">+</span>}>
            New invite link
          </ActionButton>
        )}
      </div>
      <p className="mt-1 max-w-prose text-body-sm text-on-surface-variant">
        A link that takes its discount off by itself: whoever opens it types nothing and sees no code, so there is none to pass on. A personal link works for one
        email address, once; a group link for a set number of people.
      </p>
      {!published && list.length > 0 && <p className="mt-1 text-label-md text-on-surface-faint">The links open the event’s page, which takes registrations once it is published.</p>}
      {(error || invites.error) && (
        <p role="alert" className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error ?? errorText(invites.error, 'The invite links could not be loaded.')}
        </p>
      )}
      {list.length === 0 ? (
        !invites.isLoading && !invites.error && <p className="mt-3 text-body-sm text-on-surface-faint">None yet.</p>
      ) : (
        <ul aria-label="Invite links" className="mt-3 flex flex-col gap-2">
          {list.map((invite) => (
            <InviteRow
              key={invite.id}
              invite={invite}
              link={inviteUrl(slug, invite.token)}
              uses={uses[invite.id] ?? 0}
              names={cameBy(invite.id)}
              canEdit={canEdit}
              busy={(turn.isPending && turn.variables?.invite.id === invite.id) || (remove.isPending && remove.variables?.id === invite.id)}
              onTurn={(active) => turn.mutate({ invite, active })}
              onQr={() => qr.mutate(invite)}
              onDelete={() =>
                ask({
                  title: `Delete the link for ${invite.label}?`,
                  body: 'The link stops working and leaves this list. Nobody has registered with it.',
                  onConfirm: () => remove.mutate(invite),
                })
              }
            />
          ))}
        </ul>
      )}
      {making && <InviteForm eventId={eventId} slug={slug} ticketTypes={ticketTypes} onClose={() => setMaking(false)} onMade={refresh} />}
      {dialog}
    </section>
  )
}

const STATE_PILL: Record<Exclude<InviteState, 'live'>, { label: string; tone: PillTone }> = {
  off: { label: 'Turned off', tone: 'red' },
  ended: { label: 'Ended', tone: 'orange' },
  used: { label: 'Used up', tone: 'neutral' },
  removed: { label: 'Details removed', tone: 'neutral' },
}

const dayWords = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

/** "Sarah Lee, Tom Brown and 3 more". */
function namesWords(names: string[]): string {
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`
}

function InviteRow({
  invite,
  link,
  uses,
  names,
  canEdit,
  busy,
  onTurn,
  onQr,
  onDelete,
}: {
  invite: Invite
  link: string
  uses: number
  names: string[]
  canEdit: boolean
  busy: boolean
  onTurn: (active: boolean) => void
  onQr: () => void
  onDelete: () => void
}) {
  const [copied, setCopied] = useState(false)
  const state = inviteState(invite, uses)
  const removed = state === 'removed'
  // A personal link that has been used needs no second word for it.
  const pill = state === 'live' || (state === 'used' && invite.kind === 'personal') ? null : STATE_PILL[state]
  const copy = () => {
    void navigator.clipboard?.writeText(link)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }
  return (
    <li aria-label={invite.label} className={`rounded-[var(--radius-card)] bg-surface-lowest p-4 hairline ${state === 'live' ? '' : 'opacity-80'}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-body-md font-semibold text-on-surface [overflow-wrap:anywhere]">{invite.label}</p>
          {invite.locked_email && <p className="mt-0.5 text-body-sm text-on-surface-variant [overflow-wrap:anywhere]">{invite.locked_email}</p>}
        </div>
        {!removed && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <ActionButton size="sm" tone="quiet" onClick={copy} aria-label={`Copy the link for ${invite.label}`}>
              {copied ? 'Copied' : 'Copy link'}
            </ActionButton>
            <ActionButton size="sm" tone="quiet" onClick={onQr} aria-label={`Download a QR code for ${invite.label}`}>
              QR code
            </ActionButton>
            {canEdit && (
              <ActionButton size="sm" tone="quiet" onClick={() => onTurn(!invite.active)} disabled={busy} aria-label={`${invite.active ? 'Turn off' : 'Turn on'} the link for ${invite.label}`}>
                {invite.active ? 'Turn off' : 'Turn on'}
              </ActionButton>
            )}
            {/* Only one nobody has come by: a link people registered with is turned off, so the list still says who. */}
            {canEdit && names.length === 0 && (
              <ActionButton size="sm" tone="danger-quiet" onClick={onDelete} disabled={busy} aria-label={`Delete the link for ${invite.label}`}>
                Delete
              </ActionButton>
            )}
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Pill tone={invite.kind === 'personal' ? 'blue' : 'indigo'}>{invite.kind === 'personal' ? 'Personal' : 'Group'}</Pill>
        <Pill tone={invite.discount_kind ? 'green' : 'neutral'}>{inviteGives(invite)}</Pill>
        <Pill tone="neutral">{usesWords(invite, uses)}</Pill>
        {pill && <Pill tone={pill.tone}>{pill.label}</Pill>}
      </div>
      {!removed && (
        <p className="mt-2 break-all font-mono text-label-sm text-on-surface-faint" aria-label={`The link for ${invite.label}`}>
          {link}
        </p>
      )}
      {(invite.expires_at || names.length > 0) && (
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-label-md text-on-surface-variant">
          {invite.expires_at && !removed && <span>Works until {dayWords(invite.expires_at)}</span>}
          {names.length > 0 && <span className="[overflow-wrap:anywhere]">Registered: {namesWords(names)}</span>}
        </p>
      )}
    </li>
  )
}

/**
 * Making a link. Pressed with something wrong, the form says what and
 * where (never a greyed button); made, the link is copied, ready to paste
 * into a message.
 */
function InviteForm({
  eventId,
  slug,
  ticketTypes,
  onClose,
  onMade,
}: {
  eventId: string
  slug: string
  ticketTypes: TicketType[]
  onClose: () => void
  onMade: () => void
}) {
  const errorText = useErrorText()
  const paid = ticketTypes.filter((t) => t.kind === 'paid')
  // With no paid ticket there is nothing to take money off: the link only records who came by it.
  const [draft, setDraft] = useState<InviteDraft>(() => (paid.length > 0 ? newInviteDraft() : { ...newInviteDraft(), discount: 'none', value: '' }))
  const [tried, setTried] = useState(false)
  const set = (patch: Partial<InviteDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const problems = inviteProblems(draft)
  const problemAt = (field: InviteField) => (tried ? (problems.find((p) => p.field === field) ?? null) : null)
  const errorId = (field: InviteField) => `invite-${field}-error`
  const say = (field: InviteField) => {
    const problem = problemAt(field)
    return problem ? (
      <p id={errorId(field)} className="text-body-sm font-medium text-error">
        {problem.text}
      </p>
    ) : null
  }
  const ring = (field: InviteField) => (problemAt(field) ? 'field-error' : '')
  const marked = (field: InviteField) => (problemAt(field) ? { 'aria-invalid': true as const, 'aria-describedby': errorId(field) } : {})
  const goTo = (field: InviteField) => document.getElementById(`invite-${field}`)?.querySelector<HTMLElement>('input, button')?.focus()

  const make = useMutation({
    mutationFn: () => createInvite(eventId, draft),
    onSuccess: async (invite) => {
      let copied = false
      try {
        await navigator.clipboard?.writeText(inviteUrl(slug, invite.token))
        copied = !!navigator.clipboard
      } catch {
        // The clipboard is the page's to refuse; the link is on the list either way.
      }
      showToast(copied ? 'Link made and copied' : 'Link made')
      onMade()
      onClose()
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (problems.length > 0) {
      setTried(true)
      goTo(problems[0].field)
      return
    }
    make.mutate()
  }

  const personal = draft.kind === 'personal'
  const discounted = draft.discount !== 'none'
  const free = draft.discount === 'percent' && draft.value.trim() === '100'
  const title = 'New invite link'

  return (
    <Overlay label={title} onDismiss={onClose}>
      <form
        onSubmit={submit}
        noValidate
        aria-label={title}
        className="flex max-h-[90dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-[var(--radius-card)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)]"
      >
        <div>
          <h2 className="text-headline-md text-on-surface">{title}</h2>
          <p className="mt-1 text-body-sm text-on-surface-variant">The link carries the discount. Nobody is shown a code, and you can turn this one link off at any time.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <SegmentedControl
            label="Who can use it"
            value={draft.kind}
            onChange={(kind) => set({ kind })}
            options={[
              { value: 'personal', label: 'One person' },
              { value: 'group', label: 'A group' },
            ]}
          />
          <p className="text-label-md text-on-surface-faint">
            {personal
              ? 'Only their email address can use it, once. Forwarded, it is no use to anybody else.'
              : 'Whoever has the link can use it, up to the number of times you set.'}
          </p>
        </div>

        <div id="invite-label" className="flex flex-col gap-1.5">
          <Field label={personal ? 'Who it is for' : 'Name of the group'}>
            <input
              value={draft.label}
              onChange={(e) => set({ label: e.target.value })}
              maxLength={INVITE_LABEL_MAX}
              placeholder={personal ? 'John Smith' : 'Youth WhatsApp group'}
              autoFocus
              className={`${inputClasses} ${ring('label')}`}
              {...marked('label')}
            />
          </Field>
          {say('label') ?? <p className="text-label-sm text-on-surface-faint">For your list only. Whoever opens the link never sees it.</p>}
        </div>

        {personal && (
          <div id="invite-email" className="flex flex-col gap-1.5">
            <Field label="Their email">
              <input
                value={draft.email}
                onChange={(e) => set({ email: e.target.value })}
                type="email"
                inputMode="email"
                autoCapitalize="off"
                autoComplete="off"
                maxLength={254}
                className={`${inputClasses} ${ring('email')}`}
                {...marked('email')}
              />
            </Field>
            {say('email') ?? <p className="text-label-sm text-on-surface-faint">They must register with this address. The link does not show it to anybody.</p>}
          </div>
        )}

        {paid.length === 0 ? (
          <p className="text-label-md text-on-surface-faint">
            This event has no paid tickets, so there is nothing for a link to take off. It will still record who came by it.
          </p>
        ) : (
          <FieldGroup label="What it gives">
            <SegmentedControl
              label="What it gives"
              value={draft.discount}
              onChange={(discount) => set({ discount, value: discount === 'percent' ? '100' : '' })}
              options={[
                { value: 'percent', label: 'Percent off' },
                { value: 'amount', label: 'Amount off' },
                { value: 'none', label: 'No discount' },
              ]}
            />
            {!discounted && <p className="text-label-md text-on-surface-faint">Nothing is taken off. The link only records who registered through it.</p>}
            {discounted && (
              <div className="grid grid-cols-2 gap-3">
                <div id="invite-value" className="flex flex-col gap-1.5">
                  <Field label={draft.discount === 'percent' ? 'Percent off' : 'Pounds off'}>
                    <input
                      value={draft.value}
                      onChange={(e) => set({ value: e.target.value })}
                      inputMode={draft.discount === 'percent' ? 'numeric' : 'decimal'}
                      placeholder={draft.discount === 'percent' ? '100' : '5.00'}
                      className={`${inputClasses} ${ring('value')}`}
                      {...marked('value')}
                    />
                  </Field>
                  {say('value')}
                </div>
                <div id="invite-covered" className="flex flex-col gap-1.5">
                  <Field label="Tickets covered">
                    <input
                      value={draft.ticketsCovered}
                      onChange={(e) => set({ ticketsCovered: e.target.value })}
                      inputMode="numeric"
                      className={`${inputClasses} ${ring('covered')}`}
                      {...marked('covered')}
                    />
                  </Field>
                  {say('covered')}
                </div>
                <p className="col-span-2 text-label-md text-on-surface-faint">
                  {draft.discount === 'percent'
                    ? 'The discount is on that many tickets of each registration, the dearest first. Any more are at full price.'
                    : 'The amount comes off each registration once, and never more than that many tickets cost.'}
                </p>
              </div>
            )}
            {discounted && (
              <div id="invite-tickets" className="flex flex-col gap-1.5">
                <SegmentedControl
                  label="Which tickets"
                  value={draft.limited ? 'some' : 'all'}
                  onChange={(v) => set({ limited: v === 'some' })}
                  options={[
                    { value: 'all', label: 'Every paid ticket' },
                    { value: 'some', label: 'Only these tickets' },
                  ]}
                />
                {draft.limited && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1" {...marked('tickets')}>
                    {paid.map((t) => (
                      <label key={t.id} className="flex items-center gap-2 text-body-sm text-on-surface">
                        <input
                          type="checkbox"
                          checked={draft.ticketTypeIds.includes(t.id)}
                          onChange={(e) => set({ ticketTypeIds: e.target.checked ? [...draft.ticketTypeIds, t.id] : draft.ticketTypeIds.filter((x) => x !== t.id) })}
                          className="h-4 w-4 accent-[var(--color-primary)]"
                        />
                        {t.name}
                      </label>
                    ))}
                  </div>
                )}
                {say('tickets')}
              </div>
            )}
          </FieldGroup>
        )}

        {!personal && (
          <div id="invite-uses" className="flex flex-col gap-1.5">
            <Field label={discounted ? 'How many times it can be used' : 'How many times it can be used (optional)'}>
              <input
                value={draft.maxUses}
                onChange={(e) => set({ maxUses: e.target.value })}
                inputMode="numeric"
                placeholder={discounted ? '20' : 'No limit'}
                className={`${inputClasses} max-w-40 ${ring('uses')}`}
                {...marked('uses')}
              />
            </Field>
            {say('uses') ?? (
              <p className="text-label-sm text-on-surface-faint">
                {free ? `A link that makes tickets free can be used ${FREE_GROUP_MAX} times at most.` : 'Each registration is one use. A cancelled one gives its use back.'}
              </p>
            )}
          </div>
        )}

        <div id="invite-until" className="flex flex-col gap-1.5">
          <FieldGroup label="Last day it works (optional)">
            <DateField value={draft.until} onChange={(until) => set({ until })} label="Last day it works" placeholder="No end" min={todayText()} clearable aria-label="Last day it works" />
          </FieldGroup>
          {say('until')}
        </div>

        {make.error && (
          <p role="alert" className="rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
            {errorText(make.error, 'The link could not be made. Try again.')}
          </p>
        )}
        {tried && problems.length > 0 && (
          <div role="alert" aria-label="What to put right" className="flex gap-3 rounded-[var(--radius-card)] bg-error-container p-4 text-on-error-container">
            <WarningIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <ul className="flex min-w-0 flex-col gap-1.5 text-body-sm">
              {problems.map((p) => (
                <li key={p.field}>
                  <button type="button" onClick={() => goTo(p.field)} className="text-left font-medium underline underline-offset-2">
                    {p.text}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <ActionButton tone="ghost" onClick={onClose}>
            Cancel
          </ActionButton>
          <ActionButton type="submit" disabled={make.isPending}>
            {make.isPending ? 'Making…' : 'Make the link'}
          </ActionButton>
        </div>
      </form>
    </Overlay>
  )
}
