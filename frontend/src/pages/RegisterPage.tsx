import { type FormEvent, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { PublicNothing, PublicShell } from '../components/PublicShell'
import { ActionButton, Field, FieldGroup, Pill, inputClasses } from '../components/Surface'
import { LinkedText } from '../components/LinkedText'
import { PlaceMap } from '../components/PlaceMap'
import { useErrorText } from '../lib/useErrorText'
import { directionsUrl } from '../lib/directions'
import { pounds, parsePounds, priceWords } from '../lib/money'
import { TICKET_PATH } from '../lib/registrationLinks'
import {
  checkPromoCode,
  fetchPublicEvent,
  orderTotals,
  registerForEvent,
  registrationImageUrl,
  remainingOf,
  whenWords,
  type OrderLine,
  type PromoCheck,
  type PublicEvent,
  type PublicTicketType,
} from '../lib/registrations'

/**
 * An event's public page (0244): /register/<slug>. What it is, when and
 * where, the tickets with how many are left, and the form — which ticket
 * types and how many, a name for each if they like, who is booking, a
 * promo code — and then their ticket.
 *
 * Nobody signs in here. The page reads through registration_public_event
 * and writes through registration_register, which does every check again
 * under a lock; what this page checks is only so the form can say so
 * before the button is pressed.
 */

/** How many of each type is wanted, and any names and donation amounts. */
interface Wanted {
  quantity: number
  names: string[]
  /** As typed, pounds. */
  donation: string
}

export function RegisterPage() {
  const { slug = '' } = useParams()
  const event = useQuery({ queryKey: ['public-event', slug], queryFn: () => fetchPublicEvent(slug) })

  if (event.isLoading) {
    return (
      <PublicShell title="Register" logoPath={null}>
        <p className="mt-10 text-center text-body-sm text-on-surface-variant">Loading…</p>
      </PublicShell>
    )
  }
  if (event.error || !event.data) {
    return <PublicNothing title="No such event" body="This link doesn’t lead to an event. Check it with whoever sent it." />
  }
  return <EventPage event={event.data} onRegistered={() => event.refetch()} />
}

function EventPage({ event, onRegistered }: { event: PublicEvent; onRegistered: () => void }) {
  const navigate = useNavigate()
  const errorText = useErrorText()
  const [dateId, setDateId] = useState<string | null>(event.date_mode === 'choose' ? (event.dates.find((d) => d.open)?.id ?? null) : null)
  const [wanted, setWanted] = useState<Record<string, Wanted>>({})
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [promoText, setPromoText] = useState('')
  const [promo, setPromo] = useState<PromoCheck | null>(null)
  const [promoNote, setPromoNote] = useState<string | null>(null)
  const [website, setWebsite] = useState('')
  const [error, setError] = useState<string | null>(null)

  const image = registrationImageUrl(event.image_path)
  const directions = directionsUrl(event.location)
  const anyPaid = event.ticket_types.some((t) => t.kind !== 'free')

  const lines: OrderLine[] = useMemo(
    () =>
      event.ticket_types
        .filter((t) => (wanted[t.id]?.quantity ?? 0) > 0)
        .map((t) => ({
          ticket_type_id: t.id,
          quantity: wanted[t.id].quantity,
          attendee_names: Array.from({ length: wanted[t.id].quantity }, (_, i) => (wanted[t.id].names[i] ?? '').trim()),
          donation_pence: t.kind === 'donation' ? (parsePounds(wanted[t.id].donation) ?? 0) : undefined,
        })),
    [event.ticket_types, wanted],
  )
  const totals = orderTotals(event.ticket_types, lines, promo)

  const remaining = (t: PublicTicketType) => remainingOf(t, event.date_mode, dateId)
  // A type with no limit means there is no number to show, and no selling out.
  const ticketsLeft = event.ticket_types.some((t) => remaining(t) === null)
    ? null
    : event.ticket_types.reduce((sum, t) => sum + (remaining(t) ?? 0), 0)
  const soldOut = ticketsLeft === 0

  const setQuantity = (t: PublicTicketType, next: number) => {
    const cap = remaining(t)
    const n = Math.max(0, Math.min(next, cap ?? event.max_per_order, event.max_per_order))
    setWanted((w) => ({ ...w, [t.id]: { quantity: n, names: w[t.id]?.names ?? [], donation: w[t.id]?.donation ?? '' } }))
  }

  const applyPromo = useMutation({
    mutationFn: () => checkPromoCode(event.slug, promoText),
    onSuccess: (result) => {
      setPromo(result.ok ? result : null)
      setPromoNote(
        result.ok
          ? result.kind === 'percent'
            ? `${result.value}% off${result.ticket_type_ids.length ? ' the tickets it covers' : ''}`
            : `${pounds(result.value)} off`
          : 'That code isn’t valid.',
      )
    },
    onError: (err: unknown) => setPromoNote(errorText(err, 'Could not check that code.')),
  })

  const register = useMutation({
    mutationFn: () =>
      registerForEvent(event.slug, {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        date_id: event.date_mode === 'choose' ? dateId : null,
        promo_code: promo?.ok ? promo.code : '',
        lines,
        website,
      }),
    onSuccess: (code) => {
      setError(null)
      if (code) {
        navigate(`${TICKET_PATH}/${code}`, { replace: true })
      } else {
        onRegistered()
      }
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not register. Try again.')),
  })

  const problems: string[] = []
  if (event.date_mode === 'choose' && !dateId) problems.push('Choose a date.')
  if (totals.quantity === 0) problems.push('Choose at least one ticket.')
  else if (totals.quantity < event.min_per_order) problems.push(`At least ${event.min_per_order} tickets per order.`)
  else if (totals.quantity > event.max_per_order) problems.push(`At most ${event.max_per_order} tickets per order.`)
  for (const t of event.ticket_types) {
    const w = wanted[t.id]
    if (t.kind === 'donation' && w && w.quantity > 0) {
      const pence = parsePounds(w.donation)
      if (pence === null) problems.push(`How much for “${t.name}”?`)
      else if (pence < (t.min_donation_pence ?? 0)) problems.push(`The least for “${t.name}” is ${pounds(t.min_donation_pence ?? 0)}.`)
    }
  }
  if (!name.trim()) problems.push('Your name.')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) problems.push('An email address that looks right.')
  if (!phone.trim()) problems.push('A phone number.')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (problems.length > 0 || !event.open) return
    register.mutate()
  }

  const closedWords =
    event.closed_reason === 'not_yet' && event.opens_at
      ? `Registration opens ${whenWords(event.opens_at, null)}.`
      : event.closed_reason === 'over'
        ? 'Registration closed when the event started.'
        : event.closed_reason === 'closed'
          ? 'Registration has closed.'
          : null

  return (
    <PublicShell title={event.title} logoPath={event.logo_path}>
      {image && (
        <img src={image} alt="" className="mt-2 aspect-[16/9] w-full rounded-[var(--radius-card)] object-cover" />
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {event.status === 'draft' && <Pill tone="orange">Draft — only you can see this</Pill>}
        {soldOut && <Pill tone="red">Sold out</Pill>}
        {!soldOut && ticketsLeft !== null && <Pill tone="green">{ticketsLeft} {ticketsLeft === 1 ? 'ticket' : 'tickets'} left</Pill>}
      </div>
      <h1 className="mt-2 text-headline-xl text-on-surface">{event.title}</h1>

      <section className="mt-5 flex flex-col gap-4">
        <div>
          <p className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">When</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-body-md text-on-surface">
            {event.dates.map((d) => (
              <li key={d.id}>
                {whenWords(d.starts_at, d.ends_at)}
                {d.label && <span className="text-on-surface-variant"> · {d.label}</span>}
              </li>
            ))}
          </ul>
        </div>
        {(event.location.name || event.location.address) && (
          <div>
            <p className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">Where</p>
            {event.location.name && <p className="mt-1 text-body-md text-on-surface">{event.location.name}</p>}
            {event.location.address && <p className="whitespace-pre-line text-body-sm text-on-surface-variant">{event.location.address}</p>}
            {event.location.latitude !== null && event.location.longitude !== null && (
              <PlaceMap
                lat={event.location.latitude}
                lng={event.location.longitude}
                radius={0}
                editable={false}
                title={event.location.name ?? 'The venue'}
                className="mt-3 h-52 w-full overflow-hidden rounded-[var(--radius-card)] hairline"
              />
            )}
            {directions && (
              <a
                href={directions}
                target="_blank"
                rel="noopener noreferrer"
                className="tap mt-3 inline-flex items-center gap-2 rounded-full px-4 text-label-md font-medium text-accent-blue-soft hairline hover:bg-raised"
              >
                Open directions <span aria-hidden="true">↗</span>
              </a>
            )}
          </div>
        )}
        {event.description && (
          <div>
            <p className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">About</p>
            <p className="mt-1 whitespace-pre-line break-words text-body-md text-on-surface">
              <LinkedText text={event.description} />
            </p>
          </div>
        )}
      </section>

      {closedWords ? (
        <p className="mt-8 rounded-[var(--radius-card)] bg-surface-lowest p-5 text-center text-body-md text-on-surface hairline">{closedWords}</p>
      ) : (
        <form onSubmit={submit} className="mt-8 flex flex-col gap-6" aria-label="Register">
          <h2 className="text-headline-md text-on-surface">Register</h2>

          {event.date_mode === 'choose' && (
            <FieldGroup label="Which date">
              <div role="radiogroup" aria-label="Which date" className="flex flex-col gap-1.5">
                {event.dates.map((d) => (
                  <label key={d.id} className={`flex items-center gap-2 text-body-sm ${d.open ? 'text-on-surface' : 'text-on-surface-faint'}`}>
                    <input
                      type="radio"
                      name="date"
                      checked={dateId === d.id}
                      disabled={!d.open}
                      onChange={() => setDateId(d.id)}
                      className="accent-[var(--color-primary)]"
                    />
                    {whenWords(d.starts_at, d.ends_at)}
                    {d.label && <span className="text-on-surface-variant">· {d.label}</span>}
                    {!d.open && <span className="text-on-surface-faint">· started</span>}
                  </label>
                ))}
              </div>
            </FieldGroup>
          )}

          <FieldGroup label="Tickets">
            <ul className="flex flex-col gap-3">
              {event.ticket_types.map((t) => {
                const left = remaining(t)
                const w = wanted[t.id] ?? { quantity: 0, names: [], donation: '' }
                const price =
                  t.kind === 'free' ? 'Free' : t.kind === 'paid' ? pounds(t.price_pence) : `Donation${t.min_donation_pence ? ` · at least ${pounds(t.min_donation_pence)}` : ''}`
                return (
                  <li key={t.id} aria-label={t.name} className="rounded-[var(--radius-row)] bg-surface-lowest p-3.5 hairline">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-body-md font-medium text-on-surface">{t.name}</p>
                        <p className="text-body-sm text-on-surface-variant">
                          {price}
                          {left !== null && (
                            <span className={left === 0 ? ' text-accent-red-soft' : ' text-on-surface-faint'}> · {left === 0 ? 'Sold out' : `${left} left`}</span>
                          )}
                        </p>
                        {t.description && <p className="mt-1 whitespace-pre-line text-body-sm text-on-surface-variant">{t.description}</p>}
                      </div>
                      <div role="group" aria-label={`How many ${t.name}`} className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          aria-label={`One fewer ${t.name}`}
                          disabled={w.quantity === 0}
                          onClick={() => setQuantity(t, w.quantity - 1)}
                          className="tap-square rounded-full text-headline-sm text-on-surface hairline disabled:opacity-40"
                        >
                          −
                        </button>
                        <span className="w-8 text-center font-mono text-body-md tabular text-on-surface" aria-live="polite">
                          {w.quantity}
                        </span>
                        <button
                          type="button"
                          aria-label={`One more ${t.name}`}
                          disabled={left === 0 || (left !== null && w.quantity >= left) || totals.quantity >= event.max_per_order}
                          onClick={() => setQuantity(t, w.quantity + 1)}
                          className="tap-square rounded-full text-headline-sm text-on-surface hairline disabled:opacity-40"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    {w.quantity > 0 && t.kind === 'donation' && (
                      <Field label={`How much for ${t.name}, each`} className="mt-3">
                        <input
                          value={w.donation}
                          onChange={(e) => setWanted((all) => ({ ...all, [t.id]: { ...w, donation: e.target.value } }))}
                          inputMode="decimal"
                          placeholder={t.min_donation_pence ? (t.min_donation_pence / 100).toFixed(2) : '10.00'}
                          className={inputClasses}
                        />
                      </Field>
                    )}
                    {w.quantity > 1 && (
                      <div className="mt-3 flex flex-col gap-2">
                        <p className="text-label-md text-on-surface-variant">Who are they for? (optional)</p>
                        {Array.from({ length: w.quantity }, (_, i) => (
                          <input
                            key={i}
                            value={w.names[i] ?? ''}
                            onChange={(e) =>
                              setWanted((all) => {
                                const names = [...w.names]
                                names[i] = e.target.value
                                return { ...all, [t.id]: { ...w, names } }
                              })
                            }
                            aria-label={`${t.name} ${i + 1} name`}
                            placeholder={`${t.name} ${i + 1}`}
                            maxLength={120}
                            className={inputClasses}
                          />
                        ))}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
            {(event.min_per_order > 1 || event.max_per_order < 10) && (
              <p className="text-label-md text-on-surface-faint">
                {event.min_per_order > 1 ? `At least ${event.min_per_order}` : 'Up to'}
                {event.min_per_order > 1 ? ` and at most ${event.max_per_order}` : ` ${event.max_per_order}`} tickets per order.
              </p>
            )}
          </FieldGroup>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Your name" className="sm:col-span-2">
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} className={inputClasses} />
            </Field>
            <Field label="Email">
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoComplete="email" autoCapitalize="off" maxLength={254} className={inputClasses} />
            </Field>
            <Field label="Phone">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" maxLength={40} className={inputClasses} />
            </Field>
          </div>

          {/* Nobody sees this box; a bot that fills it in registers nothing. */}
          <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden">
            <label>
              Website
              <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" />
            </label>
          </div>

          {anyPaid && (
            <Field label="Promo code (optional)">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={promoText}
                  onChange={(e) => {
                    setPromoText(e.target.value.toUpperCase())
                    setPromo(null)
                    setPromoNote(null)
                  }}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  maxLength={30}
                  className={`${inputClasses} max-w-xs`}
                />
                <ActionButton size="sm" tone="quiet" onClick={() => applyPromo.mutate()} disabled={!promoText.trim() || applyPromo.isPending}>
                  Apply
                </ActionButton>
                {promoNote && <span className={`text-body-sm ${promo?.ok ? 'text-accent-green-soft' : 'text-accent-red-soft'}`}>{promoNote}</span>}
              </div>
            </Field>
          )}

          <div className="rounded-[var(--radius-card)] bg-surface-lowest p-4 hairline" aria-label="Your order">
            <div className="flex items-center justify-between text-body-md text-on-surface">
              <span>
                {totals.quantity} {totals.quantity === 1 ? 'ticket' : 'tickets'}
              </span>
              <span className="font-mono tabular">{priceWords(totals.subtotal)}</span>
            </div>
            {totals.discount > 0 && (
              <div className="mt-1 flex items-center justify-between text-body-sm text-accent-green-soft">
                <span>Promo code</span>
                <span className="font-mono tabular">−{pounds(totals.discount)}</span>
              </div>
            )}
            <div className="mt-2 flex items-center justify-between border-t border-border-subtle pt-2 text-headline-sm text-on-surface">
              <span>Total</span>
              <span className="font-mono tabular">{priceWords(totals.total)}</span>
            </div>
            {totals.total > 0 && (
              <p className="mt-2 text-label-md text-on-surface-variant">
                You’ll be shown how to pay on your ticket{event.allow_pay_at_reception ? ', or you can pay at reception' : ''}.
              </p>
            )}
          </div>

          {error && (
            <p role="alert" className="rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
              {error}
            </p>
          )}
          {!event.open && event.status === 'draft' && (
            <p className="text-body-sm text-on-surface-variant">A draft takes no registrations. Publish it first.</p>
          )}

          <div className="flex flex-col gap-2">
            <ActionButton type="submit" disabled={register.isPending || problems.length > 0 || !event.open || soldOut}>
              {register.isPending ? 'Registering…' : totals.total > 0 ? `Register · ${pounds(totals.total)}` : 'Register'}
            </ActionButton>
            {problems.length > 0 && totals.quantity > 0 && (
              <p className="text-label-md text-on-surface-faint">Still needed: {problems.join(' ')}</p>
            )}
          </div>
        </form>
      )}
    </PublicShell>
  )
}
