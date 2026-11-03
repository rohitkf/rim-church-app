import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useRegistrationRights } from '../lib/registrationRights'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ActionButton, Field, FieldGroup, Overlay, PageHeader, SectionTile, SegmentedControl, inputClasses } from '../components/Surface'
import { DateField, TimeField } from '../components/DateTimeFields'
import { PlaceMap } from '../components/PlaceMap'
import { QueryState } from '../components/QueryState'
import { FocalPointPicker } from '../components/FocalPointPicker'
import { useErrorText } from '../lib/useErrorText'
import { showToast } from '../lib/toast'
import { geocodeAddress, suggestAddresses, type Found } from '../lib/geocode'
import { registerUrl } from '../lib/registrationLinks'
import {
  REGISTRATIONS_KEY,
  draftFromEvent,
  draftProblems,
  emptyDraft,
  fetchRegistrationEvent,
  newDateDraft,
  newPromoDraft,
  newTicketTypeDraft,
  CENTRE,
  imagePosition,
  registrationImageUrl,
  saveRegistrationEvent,
  slugTyping,
  slugify,
  syncRegistrationDiary,
  uploadRegistrationImage,
  type DateDraft,
  type EventDraft,
  type ImageFocus,
  type PaymentAccount,
  type PaymentLink,
  type PromoDraft,
  type RegistrationEventFull,
  type TicketTypeDraft,
} from '../lib/registrations'

/**
 * Making or changing a registration event (0244): everything on one page,
 * top to bottom — the picture, the words, the dates, the tickets, promo
 * codes, the place on the map, when registration opens and closes, how to
 * pay, and the church diary. Save keeps it as it is (a draft stays a
 * draft); publishing is on the event's own page.
 */

const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp'
const IMAGE_MAX_BYTES = 2 * 1024 * 1024

export function RegistrationEditorPage() {
  const { id } = useParams()
  const existing = useQuery({ queryKey: [...REGISTRATIONS_KEY, 'event', id], queryFn: () => fetchRegistrationEvent(id!), enabled: !!id })
  const rights = useRegistrationRights()
  // Making and editing events is its own right (0251); the database refuses the save without it.
  if (!rights.edit) {
    return (
      <div>
        <PageHeader eyebrow="Registrations" title={id ? 'Edit event' : 'New event'} />
        <p className="text-body-md text-on-surface-variant">Making and editing events is not one of your rights. Whoever runs the app can give it to you in Access &amp; Privileges (“Make &amp; edit events”).</p>
        <Link to={id ? `/registrations/${id}` : '/registrations'} className="tap mt-3 inline-block text-label-md font-medium text-accent-blue-soft hover:underline">
          Back
        </Link>
      </div>
    )
  }
  if (id && existing.isLoading) return <QueryState isLoading error={null}>{null}</QueryState>
  if (id && (existing.error || !existing.data)) {
    return (
      <QueryState isLoading={false} error={existing.error ?? new Error('No such event.')}>
        {null}
      </QueryState>
    )
  }
  return <Editor existing={id ? (existing.data ?? null) : null} />
}

function Editor({ existing }: { existing: RegistrationEventFull | null }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const [draft, setDraft] = useState<EventDraft>(() => (existing ? draftFromEvent(existing) : emptyDraft()))
  // Published once: the link is in emails and on posters, and stays (0254).
  const linkOut = !!existing && existing.event.status !== 'draft'
  const [showProblems, setShowProblems] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<EventDraft>) => setDraft((d) => ({ ...d, ...patch }))

  const save = useMutation({
    mutationFn: async () => {
      const eventId = await saveRegistrationEvent(draft, existing)
      // The diary follows the saved words straight away (while published).
      if (existing?.event.status === 'published') await syncRegistrationDiary({ id: eventId, slug: draft.slug })
      return eventId
    },
    onSuccess: (eventId) => {
      setError(null)
      showToast(existing ? 'Saved' : 'Event saved as a draft')
      void queryClient.invalidateQueries({ queryKey: REGISTRATIONS_KEY })
      navigate(`/registrations/${eventId}`, { replace: true })
    },
    onError: (err: unknown) => {
      const code = (err as { code?: string } | null)?.code
      setError(
        code === '23505'
          ? 'Another event already uses that link. Change it.'
          : code === '23503'
            ? 'A date or ticket type that has registrations on it — cancelled ones too — cannot be removed. Set its quantity to what has been sold instead, so no more are taken.'
            : errorText(err, 'Could not save this event.'),
      )
    },
  })

  const problems = draftProblems(draft)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (problems.length > 0) {
      setShowProblems(true)
      return
    }
    save.mutate()
  }

  return (
    <form onSubmit={submit} aria-label={existing ? 'Edit event' : 'New event'}>
      <PageHeader
        eyebrow="Registrations"
        title={existing ? 'Edit event' : 'New event'}
        description="Everything on one page. Save keeps it as a draft until you publish it from the event's page."
      />

      <div className="flex flex-col gap-4">
        <SectionTile title="Picture" hint="Shown at the top of the event's page, cropped to 16:9 — pick the part that must stay in view. PNG, JPEG or WebP, up to 2 MB.">
          <PictureField
            path={draft.imagePath}
            focus={draft.imageFocus}
            onChange={(imagePath) => set({ imagePath, imageFocus: CENTRE })}
            onFocus={(imageFocus) => set({ imageFocus })}
            onError={setError}
          />
        </SectionTile>

        <SectionTile title="What it is">
          <div className="flex flex-col gap-4">
            <Field label="Title">
              <input
                value={draft.title}
                onChange={(e) => set({ title: e.target.value, slug: draft.slugTouched || linkOut ? draft.slug : slugify(e.target.value) })}
                placeholder="Pastors & Leaders Conference 2026"
                maxLength={200}
                className={inputClasses}
              />
            </Field>
            <Field
              label="Link"
              hint={
                <span className="break-all font-mono text-label-sm text-on-surface-faint">
                  {registerUrl(draft.slug || '…')}
                  {linkOut && <span className="font-sans"> · The link is out, in emails and on posters, so it cannot change now.</span>}
                </span>
              }
            >
              <input
                value={draft.slug}
                onChange={(e) => set({ slug: slugTyping(e.target.value), slugTouched: true })}
                onBlur={() => set({ slug: slugify(draft.slug) })}
                placeholder="pastors-leaders-2026"
                maxLength={80}
                autoCapitalize="off"
                autoCorrect="off"
                disabled={linkOut}
                className={`${inputClasses} disabled:opacity-60`}
              />
            </Field>
            <Field label="Description (optional)">
              <textarea value={draft.description} onChange={(e) => set({ description: e.target.value })} rows={6} placeholder="What it is, who it is for, what to bring…" className={`${inputClasses} resize-y`} />
            </Field>
          </div>
        </SectionTile>

        <SectionTile title="Dates and times">
          <DatesEditor draft={draft} set={set} />
        </SectionTile>

        <SectionTile title="Tickets" hint={draft.dateMode === 'choose' ? 'The quantity of each type is per date.' : 'Leave the quantity blank for no limit.'}>
          <TicketTypesEditor types={draft.ticketTypes} onChange={(ticketTypes) => set({ ticketTypes })} />
        </SectionTile>

        <SectionTile title="Promo codes" hint="Money off paid tickets. A code with no tickets ticked covers every paid ticket.">
          <PromoCodesEditor promos={draft.promoCodes} types={draft.ticketTypes} onChange={(promoCodes) => set({ promoCodes })} />
        </SectionTile>

        <SectionTile title="Where" hint="In the hall, online, or both. For a place: the address is what people read; the pin is where directions and the page’s map go.">
          <div className="flex flex-col gap-5">
            <SegmentedControl
              label="How people attend"
              value={draft.attendance}
              onChange={(attendance) => set({ attendance })}
              options={[
                { value: 'in_person', label: 'In person' },
                { value: 'online', label: 'Online' },
                { value: 'both', label: 'Both' },
              ]}
            />
            {draft.attendance !== 'online' && <LocationEditor draft={draft} set={set} />}
            {draft.attendance !== 'in_person' && (
              <FieldGroup label="Joining online">
                <p className="-mt-1 text-label-md text-on-surface-faint">
                  Shown only to people who have registered, on their ticket — and for a paid event, once the payment is confirmed. The event’s public page says only that it is online.
                </p>
                <Field label="Link to join (optional until you have it)">
                  <input
                    value={draft.joinUrl}
                    onChange={(e) => set({ joinUrl: e.target.value })}
                    inputMode="url"
                    placeholder="https://zoom.us/j/…"
                    maxLength={500}
                    autoCapitalize="off"
                    autoCorrect="off"
                    className={inputClasses}
                  />
                </Field>
                <Field label="Meeting ID, passcode, anything else (optional)">
                  <textarea
                    value={draft.joinDetails}
                    onChange={(e) => set({ joinDetails: e.target.value })}
                    rows={3}
                    maxLength={1000}
                    placeholder={'Meeting ID 812 3456 7890\nPasscode 2026'}
                    className={`${inputClasses} resize-y`}
                  />
                </Field>
              </FieldGroup>
            )}
          </div>
        </SectionTile>

        <SectionTile title="Registration" hint="When people can register, and how many tickets one order may hold. Left blank, registration opens when you publish and closes when the event starts.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FieldGroup label="Opens (optional)">
              <div className="flex flex-wrap gap-2">
                <DateField value={draft.opensAt.date} onChange={(date) => set({ opensAt: { ...draft.opensAt, date } })} label="Registration opens on" clearable />
                <TimeField value={draft.opensAt.time} onChange={(time) => set({ opensAt: { ...draft.opensAt, time } })} label="Registration opens at" clearable />
              </div>
            </FieldGroup>
            <FieldGroup label="Closes (optional)">
              <div className="flex flex-wrap gap-2">
                <DateField value={draft.closesAt.date} onChange={(date) => set({ closesAt: { ...draft.closesAt, date } })} label="Registration closes on" clearable />
                <TimeField value={draft.closesAt.time} onChange={(time) => set({ closesAt: { ...draft.closesAt, time } })} label="Registration closes at" clearable />
              </div>
            </FieldGroup>
            <Field label="Fewest tickets per order">
              <input value={draft.minPerOrder} onChange={(e) => set({ minPerOrder: e.target.value })} inputMode="numeric" className={inputClasses} />
            </Field>
            <Field label="Most tickets per order">
              <input value={draft.maxPerOrder} onChange={(e) => set({ maxPerOrder: e.target.value })} inputMode="numeric" className={inputClasses} />
            </Field>
          </div>
        </SectionTile>

        <SectionTile title="Paying" hint="Only needed when a ticket costs something. No payment passes through the app: people pay by a link or a bank transfer, with their order code as the reference, or at reception, and you mark it received.">
          <PaymentEditor draft={draft} set={set} />
        </SectionTile>

        <SectionTile title="Church diary">
          <label className="flex items-center gap-2 text-body-sm text-on-surface">
            <input type="checkbox" checked={draft.addToDiary} onChange={(e) => set({ addToDiary: e.target.checked })} className="h-4 w-4 accent-[var(--color-primary)]" />
            Put it in the church diary (Events) while it is published, one entry a date, with a Register link
          </label>
        </SectionTile>
      </div>

      {showProblems && problems.length > 0 && (
        <ul role="alert" aria-label="Before this can be saved" className="mt-6 flex flex-col gap-1 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-6 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        <ActionButton tone="ghost" onClick={() => navigate(existing ? `/registrations/${existing.event.id}` : '/registrations')}>
          Cancel
        </ActionButton>
        <ActionButton type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : existing ? 'Save changes' : 'Save as draft'}
        </ActionButton>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------------ */

function PictureField({
  path,
  focus,
  onChange,
  onFocus,
  onError,
}: {
  path: string | null
  focus: ImageFocus
  onChange: (path: string | null) => void
  onFocus: (focus: ImageFocus) => void
  onError: (text: string | null) => void
}) {
  const errorText = useErrorText()
  const upload = useMutation({
    mutationFn: (file: File) => uploadRegistrationImage(file),
    onSuccess: (uploaded) => {
      onError(null)
      onChange(uploaded)
    },
    onError: (err: unknown) => onError(errorText(err, 'Could not upload that picture.')),
  })
  const url = registrationImageUrl(path)
  const [positioning, setPositioning] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      {/* The crop as the page will show it. The focal point is moved only in
          its own dialog, so scrolling past the picture on a phone never nudges it.
          A new picture starts in the middle again (the page resets it with the path). */}
      {url && (
        <img
          src={url}
          alt="How the picture will show on the event’s page"
          style={{ objectPosition: imagePosition(focus) }}
          className="aspect-[16/9] w-full max-w-md rounded-[var(--radius-card)] object-cover"
        />
      )}
      {positioning && url && (
        <Overlay label="Position the picture" onDismiss={() => setPositioning(false)}>
          <div className="w-full max-w-3xl rounded-[var(--radius-card)] bg-surface-lowest p-5 shadow-[var(--shadow-lifted)]">
            <h2 className="text-headline-md text-on-surface">Position the picture</h2>
            <p className="mt-1 text-body-sm text-on-surface-variant">The event’s page shows it 16:9, cropped to fit. Pick the part that must stay in view.</p>
            <div className="mt-4">
              <FocalPointPicker src={url} value={focus} onChange={onFocus} />
            </div>
            <div className="mt-5 flex justify-end">
              <ActionButton onClick={() => setPositioning(false)}>Done</ActionButton>
            </div>
          </div>
        </Overlay>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label className="tap inline-flex cursor-pointer items-center rounded-full px-4 text-label-md font-medium text-accent-blue-soft hairline hover:bg-raised">
          {upload.isPending ? 'Uploading…' : url ? 'Change picture' : 'Choose a picture'}
          <input
            type="file"
            accept={IMAGE_ACCEPT}
            className="hidden"
            aria-label="Picture"
            disabled={upload.isPending}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              if (file.size > IMAGE_MAX_BYTES) {
                onError('That picture is over 2 MB. Choose a smaller one.')
                return
              }
              upload.mutate(file)
            }}
          />
        </label>
        {url && (
          <button type="button" onClick={() => setPositioning(true)} className="tap inline-flex items-center rounded-full px-4 text-label-md font-medium text-accent-blue-soft hairline hover:bg-raised">
            Position the picture
          </button>
        )}
        {url && (
          <button type="button" onClick={() => onChange(null)} className="tap text-label-md text-on-surface-faint hover:text-error hover:underline">
            Remove picture
          </button>
        )}
      </div>
    </div>
  )
}

function DatesEditor({ draft, set }: { draft: EventDraft; set: (patch: Partial<EventDraft>) => void }) {
  const setDate = (i: number, patch: Partial<DateDraft>) => set({ dates: draft.dates.map((d, j) => (j === i ? { ...d, ...patch } : d)) })
  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        label="How the dates work"
        value={draft.dateMode}
        onChange={(dateMode) => set({ dateMode })}
        options={[
          { value: 'all', label: 'Covers all dates' },
          { value: 'choose', label: 'Pick a date' },
        ]}
      />
      <p className="-mt-2 text-label-md text-on-surface-faint">
        {draft.dateMode === 'all'
          ? 'One ticket admits to every date — a conference, a course.'
          : 'People choose one date when they register, and each ticket type’s quantity is per date — the same evening run twice.'}
      </p>
      <label className="flex items-center gap-2 text-body-sm text-on-surface">
        <input type="checkbox" checked={draft.sameTimes} onChange={(e) => set({ sameTimes: e.target.checked })} className="h-4 w-4 accent-[var(--color-primary)]" />
        Every date has the same start and end time
      </label>
      {draft.sameTimes && (
        <div className="flex flex-wrap gap-3">
          <Field label="Starts">
            <TimeField value={draft.start} onChange={(start) => set({ start })} label="Start time" />
          </Field>
          <Field label="Ends (optional)">
            <TimeField value={draft.end} onChange={(end) => set({ end })} label="End time" clearable />
          </Field>
        </div>
      )}
      <ul className="flex flex-col gap-3">
        {draft.dates.map((d, i) => (
          <li key={i} role="group" aria-label={`Date ${i + 1}`} className="flex flex-col gap-2 rounded-[var(--radius-row)] p-3 hairline">
            <div className="flex flex-wrap items-end gap-3">
              <Field label={`Date ${i + 1}`}>
                <DateField value={d.date} onChange={(date) => setDate(i, { date })} label={`Date ${i + 1}`} />
              </Field>
              {!draft.sameTimes && (
                <>
                  <Field label="Starts">
                    <TimeField value={d.start} onChange={(start) => setDate(i, { start })} label={`Date ${i + 1} starts`} />
                  </Field>
                  <Field label="Ends (optional)">
                    <TimeField value={d.end} onChange={(end) => setDate(i, { end })} label={`Date ${i + 1} ends`} clearable />
                  </Field>
                  <Field label="Ends on another day (optional)">
                    <DateField value={d.endDate} onChange={(endDate) => setDate(i, { endDate })} label={`Date ${i + 1} ends on`} min={d.date || undefined} clearable />
                  </Field>
                </>
              )}
              <Field label="Label (optional)" className="min-w-40 flex-1">
                <input value={d.label} onChange={(e) => setDate(i, { label: e.target.value })} placeholder="Day 1, Evening session…" maxLength={100} className={inputClasses} />
              </Field>
            </div>
            {draft.dates.length > 1 && (
              <button type="button" onClick={() => set({ dates: draft.dates.filter((_, j) => j !== i) })} className="tap self-end text-label-md text-on-surface-faint hover:text-error hover:underline">
                Remove this date
              </button>
            )}
          </li>
        ))}
      </ul>
      <ActionButton size="sm" tone="quiet" onClick={() => set({ dates: [...draft.dates, newDateDraft()] })} glyph={<span aria-hidden="true">+</span>}>
        Add a date
      </ActionButton>
    </div>
  )
}

function TicketTypesEditor({ types, onChange }: { types: TicketTypeDraft[]; onChange: (next: TicketTypeDraft[]) => void }) {
  const setType = (i: number, patch: Partial<TicketTypeDraft>) => onChange(types.map((t, j) => (j === i ? { ...t, ...patch } : t)))
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {types.map((t, i) => (
          <li key={t.id} role="group" aria-label={`Ticket ${i + 1}`} className="flex flex-col gap-3 rounded-[var(--radius-row)] p-3 hairline">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Name" className="min-w-40 flex-1">
                <input value={t.name} onChange={(e) => setType(i, { name: e.target.value })} placeholder="General admission" maxLength={100} className={inputClasses} />
              </Field>
              <Field label="Quantity">
                <input value={t.quantity} onChange={(e) => setType(i, { quantity: e.target.value })} inputMode="numeric" placeholder="No limit" className={`${inputClasses} w-32`} />
              </Field>
            </div>
            <SegmentedControl
              label={`Ticket ${i + 1} kind`}
              value={t.kind}
              onChange={(kind) => setType(i, { kind })}
              options={[
                { value: 'free', label: 'Free' },
                { value: 'paid', label: 'Paid' },
                { value: 'donation', label: 'Donation' },
              ]}
            />
            {t.kind === 'paid' && (
              <Field label="Price (£)">
                <input value={t.price} onChange={(e) => setType(i, { price: e.target.value })} inputMode="decimal" placeholder="20.00" className={`${inputClasses} w-32`} />
              </Field>
            )}
            {t.kind === 'donation' && (
              <Field label="At least (£, optional)">
                <input value={t.minDonation} onChange={(e) => setType(i, { minDonation: e.target.value })} inputMode="decimal" placeholder="5.00" className={`${inputClasses} w-32`} />
              </Field>
            )}
            <Field label="Description (optional)">
              <input value={t.description} onChange={(e) => setType(i, { description: e.target.value })} placeholder="Includes lunch" maxLength={1000} className={inputClasses} />
            </Field>
            {types.length > 1 && (
              <button type="button" onClick={() => onChange(types.filter((_, j) => j !== i))} className="tap self-end text-label-md text-on-surface-faint hover:text-error hover:underline">
                Remove this ticket type
              </button>
            )}
          </li>
        ))}
      </ul>
      <ActionButton size="sm" tone="quiet" onClick={() => onChange([...types, newTicketTypeDraft()])} glyph={<span aria-hidden="true">+</span>}>
        Add a ticket type
      </ActionButton>
    </div>
  )
}

function PromoCodesEditor({ promos, types, onChange }: { promos: PromoDraft[]; types: TicketTypeDraft[]; onChange: (next: PromoDraft[]) => void }) {
  const setPromo = (i: number, patch: Partial<PromoDraft>) => onChange(promos.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const paid = types.filter((t) => t.kind === 'paid')
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {promos.map((p, i) => (
          <li key={i} role="group" aria-label={`Promo code ${i + 1}`} className="flex flex-col gap-3 rounded-[var(--radius-row)] p-3 hairline">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Code">
                <input
                  value={p.code}
                  onChange={(e) => setPromo(i, { code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') })}
                  placeholder="EARLYBIRD"
                  maxLength={30}
                  autoCapitalize="characters"
                  className={`${inputClasses} w-44`}
                />
              </Field>
              <Field label={p.kind === 'percent' ? 'Percent off' : 'Pounds off'}>
                <input value={p.value} onChange={(e) => setPromo(i, { value: e.target.value })} inputMode="decimal" placeholder={p.kind === 'percent' ? '10' : '5.00'} className={`${inputClasses} w-32`} />
              </Field>
              <Field label="Uses (optional)">
                <input value={p.maxUses} onChange={(e) => setPromo(i, { maxUses: e.target.value })} inputMode="numeric" placeholder="No limit" className={`${inputClasses} w-32`} />
              </Field>
            </div>
            <SegmentedControl
              label={`Promo code ${i + 1} kind`}
              value={p.kind}
              onChange={(kind) => setPromo(i, { kind })}
              options={[
                { value: 'percent', label: 'Percent off' },
                { value: 'amount', label: 'Amount off' },
              ]}
            />
            {paid.length > 0 ? (
              <FieldGroup label="Applies to">
                <SegmentedControl
                  label={`Promo code ${i + 1} applies to`}
                  value={p.limited ? 'some' : 'all'}
                  onChange={(v) => setPromo(i, { limited: v === 'some' })}
                  options={[
                    { value: 'all', label: 'Every paid ticket' },
                    { value: 'some', label: 'Only these tickets' },
                  ]}
                />
                {p.limited && (
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {paid.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-body-sm text-on-surface">
                      <input
                        type="checkbox"
                        checked={p.ticketTypeIds.includes(t.id)}
                        onChange={(e) => setPromo(i, { ticketTypeIds: e.target.checked ? [...p.ticketTypeIds, t.id] : p.ticketTypeIds.filter((x) => x !== t.id) })}
                        className="h-4 w-4 accent-[var(--color-primary)]"
                      />
                      {t.name || `Ticket ${types.indexOf(t) + 1}`}
                    </label>
                  ))}
                </div>
                )}
              </FieldGroup>
            ) : (
              <p className="text-label-md text-on-surface-faint">A code takes money off paid tickets only. Make a ticket type paid above, and you can choose which tickets this code is for.</p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-body-sm text-on-surface">
                <input type="checkbox" checked={p.active} onChange={(e) => setPromo(i, { active: e.target.checked })} className="h-4 w-4 accent-[var(--color-primary)]" />
                Active
              </label>
              <button type="button" onClick={() => onChange(promos.filter((_, j) => j !== i))} className="tap text-label-md text-on-surface-faint hover:text-error hover:underline">
                Remove this code
              </button>
            </div>
          </li>
        ))}
      </ul>
      <ActionButton size="sm" tone="quiet" onClick={() => onChange([...promos, newPromoDraft()])} glyph={<span aria-hidden="true">+</span>}>
        Add a promo code
      </ActionButton>
    </div>
  )
}

function LocationEditor({ draft, set }: { draft: EventDraft; set: (patch: Partial<EventDraft>) => void }) {
  const [note, setNote] = useState<string | null>(null)
  const [found, setFound] = useState<Found | null>(null)
  const [search, setSearch] = useState('')
  const [suggestions, setSuggestions] = useState<Found[]>([])
  const [looking, setLooking] = useState(false)
  const timer = useRef<number | null>(null)
  const inFlight = useRef<AbortController | null>(null)

  // The pin, and only the pin: the address is whatever was typed above.
  const place = (p: Found) => {
    setNote(null)
    setFound(p)
    setSuggestions([])
    set({ latitude: p.latitude, longitude: p.longitude })
  }

  // Suggestions follow the search box, a little behind it (Nominatim asks
  // for one request a second), and a stale answer is dropped.
  const lookUp = (text: string) => {
    setSearch(text)
    if (timer.current) window.clearTimeout(timer.current)
    const q = text.trim()
    if (q.length < 4) {
      setSuggestions([])
      return
    }
    timer.current = window.setTimeout(async () => {
      inFlight.current?.abort()
      const ac = new AbortController()
      inFlight.current = ac
      setLooking(true)
      try {
        const rows = await suggestAddresses(q, undefined, ac.signal)
        if (!ac.signal.aborted) {
          setSuggestions(rows)
          setNote(rows.length === 0 ? 'Nothing matches that yet — keep typing, or try the postcode.' : null)
        }
      } catch {
        if (!ac.signal.aborted) setNote('Could not reach the map service just now.')
      } finally {
        if (!ac.signal.aborted) setLooking(false)
      }
    }, 450)
  }
  useEffect(
    () => () => {
      inFlight.current?.abort()
      if (timer.current) window.clearTimeout(timer.current)
    },
    [],
  )

  // Find: what is in the search box, or failing that the place and address as typed.
  const asked = search.trim() || [draft.locationName, draft.address].filter(Boolean).join(', ')
  const find = useMutation({
    mutationFn: () => geocodeAddress(asked),
    onSuccess: (p) => {
      if (!p) {
        setFound(null)
        setNote('Nothing on the map matches that. Try the postcode or a nearby street, then drag the pin to the spot.')
        return
      }
      place(p)
    },
    onError: (err: unknown) => setNote(err instanceof Error ? err.message : 'Could not reach the map service.'),
  })
  // The map is remade when the pin first lands; after that it follows the pin.
  const [mapKey, setMapKey] = useState(0)
  useEffect(() => {
    if (draft.latitude !== null) setMapKey((k) => k + 1)
    // Only when a pin appears, not on every drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.latitude === null])

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Place (optional)">
          <input value={draft.locationName} onChange={(e) => set({ locationName: e.target.value })} placeholder="Church Hall" maxLength={200} className={inputClasses} />
        </Field>
        <Field label="Address (optional)" hint="Shown as typed, on the event’s page and the ticket.">
          <textarea
            value={draft.address}
            onChange={(e) => set({ address: e.target.value })}
            rows={2}
            placeholder="12 High Street, Reading, RG1 2AB"
            maxLength={500}
            autoComplete="off"
            className={`${inputClasses} resize-y`}
          />
        </Field>
      </div>
      <FieldGroup label="Pin on the map">
        <p className="-mt-1 text-label-md text-on-surface-faint">
          Directions and the page’s map go to the pin, not to the address. Search for the place or its postcode, then drag the pin if it lands a little off.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => lookUp(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (asked && !find.isPending) find.mutate()
              }
            }}
            aria-label="Search the map"
            placeholder="Postcode, street or place"
            autoComplete="off"
            className={`${inputClasses} min-w-0 flex-1`}
          />
          <ActionButton size="sm" tone="quiet" onClick={() => find.mutate()} disabled={find.isPending || !asked}>
            {find.isPending ? 'Looking…' : 'Find'}
          </ActionButton>
        </div>
        {looking && <p className="text-label-md text-on-surface-faint">Looking…</p>}
        {suggestions.length > 0 && (
          <ul aria-label="Places found" className="flex flex-col gap-1">
            {suggestions.map((p) => (
              <li key={`${p.latitude},${p.longitude}`}>
                <button
                  type="button"
                  onClick={() => place(p)}
                  className="tap w-full rounded-[var(--radius-row)] px-3 py-2 text-left text-body-sm text-on-surface hairline hover:bg-raised"
                >
                  {p.label}
                </button>
              </li>
            ))}
          </ul>
        )}
        {note && (
          <p role="alert" className="rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
            {note}
          </p>
        )}
        {draft.latitude !== null && draft.longitude !== null && (
          <>
            <PlaceMap
              key={mapKey}
              lat={draft.latitude}
              lng={draft.longitude}
              radius={0}
              editable
              title={draft.locationName || 'The venue'}
              onMove={({ lat, lng }) => set({ latitude: lat, longitude: lng })}
              className="h-64 w-full overflow-hidden rounded-[var(--radius-card)] hairline"
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-label-md text-on-surface-variant">
              <span className="font-mono tabular">
                Pin at {draft.latitude.toFixed(5)}, {draft.longitude.toFixed(5)}
              </span>
              {found && <span className="min-w-0 break-words">Found: {found.label}</span>}
              {found && draft.address.trim() !== found.label && (
                <button type="button" onClick={() => set({ address: found.label })} className="tap font-medium text-accent-blue-soft hover:underline">
                  Use as the address
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setFound(null)
                  set({ latitude: null, longitude: null })
                }}
                className="tap text-on-surface-faint hover:text-error hover:underline"
              >
                Clear the pin
              </button>
            </div>
          </>
        )}
      </FieldGroup>
    </div>
  )
}

function PaymentEditor({ draft, set }: { draft: EventDraft; set: (patch: Partial<EventDraft>) => void }) {
  const setLink = (i: number, patch: Partial<PaymentLink>) => set({ paymentLinks: draft.paymentLinks.map((l, j) => (j === i ? { ...l, ...patch } : l)) })
  const setAccount = (i: number, patch: Partial<PaymentAccount>) => set({ paymentAccounts: draft.paymentAccounts.map((a, j) => (j === i ? { ...a, ...patch } : a)) })
  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2 text-body-sm text-on-surface">
        <input type="checkbox" checked={draft.useChurchGiving} onChange={(e) => set({ useChurchGiving: e.target.checked })} className="h-4 w-4 accent-[var(--color-primary)]" />
        Offer the church’s own links and bank accounts from Settings › Giving
      </label>
      <FieldGroup label="This event’s own payment links (optional)">
        <ul className="flex flex-col gap-2">
          {draft.paymentLinks.map((l, i) => (
            <li key={i} className="flex flex-wrap items-end gap-2">
              <Field label="Button says" className="min-w-36">
                <input value={l.label} onChange={(e) => setLink(i, { label: e.target.value })} placeholder="Pay with PayPal" maxLength={60} className={inputClasses} />
              </Field>
              <Field label="Link" className="min-w-48 flex-1">
                <input value={l.url} onChange={(e) => setLink(i, { url: e.target.value })} placeholder="https://paypal.me/…" inputMode="url" autoCapitalize="off" className={inputClasses} />
              </Field>
              <button type="button" onClick={() => set({ paymentLinks: draft.paymentLinks.filter((_, j) => j !== i) })} className="tap pb-3 text-label-md text-on-surface-faint hover:text-error hover:underline">
                Remove
              </button>
            </li>
          ))}
        </ul>
        <ActionButton size="sm" tone="quiet" onClick={() => set({ paymentLinks: [...draft.paymentLinks, { label: '', url: '' }] })} glyph={<span aria-hidden="true">+</span>}>
          Add a payment link
        </ActionButton>
      </FieldGroup>
      <FieldGroup label="This event’s own bank account (optional)">
        <ul className="flex flex-col gap-3">
          {draft.paymentAccounts.map((a, i) => (
            <li key={i} role="group" aria-label={`Bank account ${i + 1}`} className="grid grid-cols-1 gap-2 rounded-[var(--radius-row)] p-3 hairline sm:grid-cols-2">
              <Field label="Label">
                <input value={a.label} onChange={(e) => setAccount(i, { label: e.target.value })} placeholder="Conference account" maxLength={60} className={inputClasses} />
              </Field>
              <Field label="Account name">
                <input value={a.account_name} onChange={(e) => setAccount(i, { account_name: e.target.value })} maxLength={100} className={inputClasses} />
              </Field>
              <Field label="Bank (optional)">
                <input value={a.bank_name ?? ''} onChange={(e) => setAccount(i, { bank_name: e.target.value || null })} maxLength={60} className={inputClasses} />
              </Field>
              <Field label="Sort code">
                <input value={a.sort_code ?? ''} onChange={(e) => setAccount(i, { sort_code: e.target.value || null })} inputMode="numeric" placeholder="40-11-22" maxLength={8} className={inputClasses} />
              </Field>
              <Field label="Account number">
                <input value={a.account_number ?? ''} onChange={(e) => setAccount(i, { account_number: e.target.value || null })} inputMode="numeric" maxLength={8} className={inputClasses} />
              </Field>
              <Field label="IBAN (optional)">
                <input value={a.iban ?? ''} onChange={(e) => setAccount(i, { iban: e.target.value || null })} autoCapitalize="characters" maxLength={34} className={inputClasses} />
              </Field>
              <button type="button" onClick={() => set({ paymentAccounts: draft.paymentAccounts.filter((_, j) => j !== i) })} className="tap justify-self-end text-label-md text-on-surface-faint hover:text-error hover:underline sm:col-span-2">
                Remove this account
              </button>
            </li>
          ))}
        </ul>
        <ActionButton
          size="sm"
          tone="quiet"
          onClick={() => set({ paymentAccounts: [...draft.paymentAccounts, { label: '', account_name: '', bank_name: null, sort_code: null, account_number: null, iban: null, bic: null }] })}
          glyph={<span aria-hidden="true">+</span>}
        >
          Add a bank account
        </ActionButton>
      </FieldGroup>
      <Field label="A note about paying (optional)">
        <textarea value={draft.paymentNote} onChange={(e) => set({ paymentNote: e.target.value })} rows={2} placeholder="Please pay within a week to keep your place." maxLength={2000} className={`${inputClasses} resize-y`} />
      </Field>
      <label className="flex items-center gap-2 text-body-sm text-on-surface">
        <input type="checkbox" checked={draft.allowPayAtReception} onChange={(e) => set({ allowPayAtReception: e.target.checked })} className="h-4 w-4 accent-[var(--color-primary)]" />
        People may choose to pay at reception
      </label>
    </div>
  )
}
