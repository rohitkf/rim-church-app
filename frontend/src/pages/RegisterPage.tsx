import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { PublicNothing, PublicShell } from '../components/PublicShell'
import { ActionButton, Field, FieldGroup, Pill, Steps, inputClasses } from '../components/Surface'
import { registerFormSteps } from '../lib/registrationSteps'
import { LinkedText } from '../components/LinkedText'
import { PlaceMap } from '../components/PlaceMap'
import { Countdown } from '../components/Countdown'
import { PhoneField } from '../components/PhoneField'
import { ConfirmEmailDialog } from '../components/ConfirmEmailDialog'
import { ContactOrganisers } from '../components/ContactOrganisers'
import { looksLikeEmail, sameEmail } from '../lib/emailDelivery'
import { WarningIcon } from '../components/icons'
import type { PhoneStatus } from '../lib/phone'
import { useErrorText } from '../lib/useErrorText'
import { directionsUrl } from '../lib/directions'
import { pounds, parsePounds, priceWords } from '../lib/money'
import { TICKET_PATH } from '../lib/registrationLinks'
import {
  checkPromoCode,
  fetchPublicEvent,
  orderTotals,
  registerForEvent,
  imagePosition,
  registrationImageUrl,
  remainingOf,
  resendTickets,
  sendTicketEmail,
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
 *
 * Between the button and the registering it asks one thing (0283): "Is
 * this your email address?", with the address on its own
 * (components/ConfirmEmailDialog). The ticket goes there and nowhere
 * else, and a slip in it was the one mistake the form could not see.
 *
 * The address is typed twice (November 2026), and the two have to be the
 * same before the form will go on: a slip is rarely made the same way
 * twice. And the button is never greyed out for something missing. It
 * used to be, with a faint line beneath saying what was needed, which is
 * a button that does nothing and does not say why. Pressed with something
 * wrong, it now says what — a list in red by the button, each line a way
 * to its field, the field itself ringed with the reason under it — and
 * goes to the first.
 */

/** Where on the form a problem is, so "take me there" can find it. */
type Spot = 'date' | 'tickets' | 'name' | 'email' | 'emailAgain' | 'phone'
const spotId = (spot: Spot) => `register-${spot}`

interface Problem {
  /** One a place, except an amount, which is one a ticket type. */
  key: string
  spot: Spot
  text: string
}

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
  /** The address a second time. */
  const [emailAgain, setEmailAgain] = useState('')
  /** They have been in the second box and left it: from then a difference is said at once. */
  const [againTouched, setAgainTouched] = useState(false)
  /** Register was pressed with something wrong: from then every problem is said where it is. */
  const [tried, setTried] = useState(false)
  /** E.164, once it is a real number; the field keeps the rest to itself. */
  const [phone, setPhone] = useState('')
  const [phoneStatus, setPhoneStatus] = useState<PhoneStatus>('empty')
  const [promoText, setPromoText] = useState('')
  const [promo, setPromo] = useState<PromoCheck | null>(null)
  const [promoNote, setPromoNote] = useState<string | null>(null)
  const [website, setWebsite] = useState('')
  const [error, setError] = useState<string | null>(null)
  /** Register was pressed: the address is being shown back before anything is sent. */
  const [confirming, setConfirming] = useState(false)
  const emailField = useRef<HTMLInputElement>(null)
  /** "No, change it" was pressed: once the dialog has gone, the email field is the one to be in. */
  const backToEmail = useRef(false)
  useEffect(() => {
    if (confirming || !backToEmail.current) return
    backToEmail.current = false
    emailField.current?.focus()
    emailField.current?.select()
  }, [confirming])

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
        phone,
        date_id: event.date_mode === 'choose' ? dateId : null,
        promo_code: promo?.ok ? promo.code : '',
        lines,
        website,
      }),
    onSuccess: (code) => {
      setError(null)
      if (code) {
        // The ticket by email, for keeping; nothing waits on it (0247).
        void sendTicketEmail(code)
        navigate(`${TICKET_PATH}/${code}`, { replace: true })
      } else {
        onRegistered()
      }
    },
    onError: (err: unknown) => {
      // Back to the form, where the reason is said and can be put right.
      setConfirming(false)
      setError(errorText(err, 'Could not register. Try again.'))
    },
  })

  // Everything standing between them and registering, in the order it
  // sits on the page — so the list by the button reads top to bottom and
  // "the first" is the one highest up.
  const problems: Problem[] = []
  if (event.date_mode === 'choose' && !dateId) problems.push({ key: 'date', spot: 'date', text: 'Choose a date.' })
  if (totals.quantity === 0) problems.push({ key: 'tickets', spot: 'tickets', text: 'Choose at least one ticket.' })
  else if (totals.quantity < event.min_per_order)
    problems.push({ key: 'tickets', spot: 'tickets', text: `Choose at least ${event.min_per_order} tickets: an order here takes no fewer.` })
  else if (totals.quantity > event.max_per_order)
    problems.push({ key: 'tickets', spot: 'tickets', text: `Choose no more than ${event.max_per_order} tickets: an order here takes no more.` })
  for (const t of event.ticket_types) {
    const w = wanted[t.id]
    if (t.kind === 'donation' && w && w.quantity > 0) {
      const pence = parsePounds(w.donation)
      if (pence === null) problems.push({ key: `amount-${t.id}`, spot: 'tickets', text: `Say how much for “${t.name}”.` })
      else if (pence < (t.min_donation_pence ?? 0))
        problems.push({ key: `amount-${t.id}`, spot: 'tickets', text: `The least for “${t.name}” is ${pounds(t.min_donation_pence ?? 0)}.` })
    }
  }
  if (!name.trim()) problems.push({ key: 'name', spot: 'name', text: 'Enter your name.' })
  if (!email.trim()) problems.push({ key: 'email', spot: 'email', text: 'Enter your email address.' })
  else if (!looksLikeEmail(email))
    problems.push({ key: 'email', spot: 'email', text: 'That email address doesn’t look right. It should be like name@example.com.' })
  if (!emailAgain.trim()) problems.push({ key: 'emailAgain', spot: 'emailAgain', text: 'Enter your email address a second time.' })
  else if (!sameEmail(email, emailAgain))
    problems.push({ key: 'emailAgain', spot: 'emailAgain', text: 'The two email addresses are different. They have to be the same.' })
  if (phoneStatus !== 'valid' || !phone)
    problems.push({ key: 'phone', spot: 'phone', text: phoneStatus === 'invalid' ? 'That phone number doesn’t look right.' : 'Enter your phone number.' })

  // Two addresses that differ are said as soon as the second box is left:
  // that one is a slip being made now, not a blank they have yet to reach.
  const differNow = againTouched && !!email.trim() && !!emailAgain.trim() && !sameEmail(email, emailAgain)
  /** The problem at a place, once it is time to say it. */
  const shown = (key: string): Problem | null => {
    const problem = problems.find((p) => p.key === key)
    if (!problem) return null
    return tried || (key === 'emailAgain' && differNow) ? problem : null
  }
  const errorId = (key: string) => `register-${key}-error`
  const say = (key: string) => {
    const problem = shown(key)
    return problem ? (
      <p id={errorId(key)} className="text-body-sm font-medium text-error">
        {problem.text}
      </p>
    ) : null
  }
  /** For the control itself: ringed, marked wrong, and pointing at the words. */
  const ring = (key: string) => (shown(key) ? 'field-error' : '')
  const marked = (key: string) => (shown(key) ? { 'aria-invalid': true as const, 'aria-describedby': errorId(key) } : {})
  const emailsAgree = !!emailAgain.trim() && looksLikeEmail(email) && sameEmail(email, emailAgain)

  /** Bring a part of the form into view and put the cursor in it. */
  const goTo = (spot: Spot) => {
    const place = document.getElementById(spotId(spot))
    if (!place) return
    // Guarded: jsdom has no scrollIntoView.
    if (typeof place.scrollIntoView === 'function') place.scrollIntoView({ block: 'center', behavior: 'smooth' })
    // A box to type in before anything else there (the phone's country, a ticket's minus).
    const control =
      place.querySelector<HTMLElement>('input:not([type="radio"])') ??
      place.querySelector<HTMLElement>('input, button:not(:disabled)')
    control?.focus({ preventScroll: true })
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!event.open || soldOut) return
    if (problems.length > 0) {
      // On a phone the thing that is wrong is nearly always off the screen,
      // and a button that does nothing visible is what leaves people stuck.
      setTried(true)
      goTo(problems[0].spot)
      return
    }
    // Not yet: first the address, shown back on its own (0283).
    setError(null)
    setConfirming(true)
  }
  const registerLabel = totals.total > 0 ? `Register, then pay ${pounds(totals.total)}` : 'Register'
  const changeEmail = () => {
    backToEmail.current = true
    setConfirming(false)
  }

  const closedWords =
    event.closed_reason === 'not_yet' && event.opens_at
      ? `Registration opens ${whenWords(event.opens_at, null)}.`
      : event.closed_reason === 'cancelled'
        ? `This event has been cancelled.${event.cancel_note ? ` ${event.cancel_note}` : ''}`
      : event.closed_reason === 'over'
        ? 'Registration closed when the event started.'
        : event.closed_reason === 'closed'
          ? 'Registration has closed.'
          : null

  return (
    <PublicShell title={event.title} logoPath={event.logo_path}>
      {image && (
        <img src={image} alt="" style={{ objectPosition: imagePosition(event.image_focus) }} className="mt-2 aspect-[16/9] w-full rounded-[var(--radius-card)] object-cover" />
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {event.status === 'draft' && <Pill tone="orange">Draft — only you can see this</Pill>}
        {soldOut && <Pill tone="red">Sold out</Pill>}
        {!soldOut && ticketsLeft !== null && <Pill tone="green">{ticketsLeft} {ticketsLeft === 1 ? 'ticket' : 'tickets'} left</Pill>}
      </div>
      <h1 className="mt-2 text-headline-xl text-on-surface">{event.title}</h1>
      {event.open && event.closes_at && !soldOut && (
        <div className="mt-4">
          <Countdown to={event.closes_at} lead="Registration closes in" over="Registration has closed." />
        </div>
      )}

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
        {event.attendance && event.attendance !== 'in_person' && (
          <div>
            <p className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">Online</p>
            <p className="mt-1 text-body-md text-on-surface">{event.attendance === 'both' ? 'In the hall, or join online.' : 'This event is online.'}</p>
            <p className="text-body-sm text-on-surface-variant">The link to join is on your ticket once you register.</p>
          </div>
        )}
        {event.attendance !== 'online' && (event.location.name || event.location.address) && (
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
                interactive={false}
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
              {say('date')}
              <div id={spotId('date')} role="radiogroup" aria-label="Which date" className="flex flex-col gap-1.5" {...marked('date')}>
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
            {say('tickets')}
            <ul id={spotId('tickets')} className="flex flex-col gap-3">
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
                      <div className="mt-3 flex flex-col gap-1.5">
                        <Field label={`How much for ${t.name}, each`}>
                          <input
                            value={w.donation}
                            onChange={(e) => setWanted((all) => ({ ...all, [t.id]: { ...w, donation: e.target.value } }))}
                            inputMode="decimal"
                            placeholder={t.min_donation_pence ? (t.min_donation_pence / 100).toFixed(2) : '10.00'}
                            className={`${inputClasses} ${ring(`amount-${t.id}`)}`}
                            {...marked(`amount-${t.id}`)}
                          />
                        </Field>
                        {say(`amount-${t.id}`)}
                      </div>
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
            {/* Each reason sits outside its field's <label>: inside, it would become part of the field's name. */}
            <div id={spotId('name')} className="flex flex-col gap-1.5 sm:col-span-2">
              <Field label="Your name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  maxLength={120}
                  className={`${inputClasses} ${ring('name')}`}
                  {...marked('name')}
                />
              </Field>
              {say('name')}
            </div>
            <div id={spotId('email')} className="flex flex-col gap-1.5">
              <Field label="Email">
                <input
                  ref={emailField}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="off"
                  maxLength={254}
                  className={`${inputClasses} ${ring('email')}`}
                  {...marked('email')}
                />
              </Field>
              {say('email') ?? <p className="text-label-md text-on-surface-faint">Your ticket is sent here.</p>}
            </div>
            <div id={spotId('emailAgain')} className="flex flex-col gap-1.5">
              <Field label="Confirm email">
                {/* Typed, not filled in for them: the point is a second go at it. Pasting is left alone —
                    stopping it only annoys, and the address is shown back once more before anything is sent. */}
                <input
                  value={emailAgain}
                  onChange={(e) => setEmailAgain(e.target.value)}
                  onBlur={() => setAgainTouched(true)}
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={254}
                  className={`${inputClasses} ${ring('emailAgain')}`}
                  {...marked('emailAgain')}
                />
              </Field>
              {say('emailAgain') ??
                (emailsAgree ? (
                  <p className="text-label-md text-accent-green-soft">The same as the one above.</p>
                ) : (
                  <p className="text-label-md text-on-surface-faint">Type it again, so a slip in either shows.</p>
                ))}
            </div>
            <div id={spotId('phone')} className="flex flex-col gap-1.5 sm:col-span-2">
              <PhoneField
                value={phone}
                onChange={setPhone}
                onStatus={setPhoneStatus}
                label="Phone"
                eyebrow
                showError={tried}
                inputClassName={ring('phone')}
              />
              {/* A number typed wrong is said by the field itself; a blank one is said here. */}
              {phoneStatus !== 'invalid' && say('phone')}
            </div>
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
              {/* Nothing chosen yet is not "Free": a page that opened on
                  "0 tickets · Free / Total · Free" read as the price of the
                  ticket. Free is said only of tickets somebody has picked. */}
              <span>{totals.quantity === 0 ? 'No tickets chosen yet' : `${totals.quantity} ${totals.quantity === 1 ? 'ticket' : 'tickets'}`}</span>
              <span className="font-mono tabular">{totals.quantity === 0 ? '—' : priceWords(totals.subtotal)}</span>
            </div>
            {totals.discount > 0 && (
              <div className="mt-1 flex items-center justify-between text-body-sm text-accent-green-soft">
                <span>Promo code</span>
                <span className="font-mono tabular">−{pounds(totals.discount)}</span>
              </div>
            )}
            <div className="mt-2 flex items-center justify-between border-t border-border-subtle pt-2 text-headline-sm text-on-surface">
              <span>Total</span>
              <span className="font-mono tabular">{totals.quantity === 0 ? '—' : priceWords(totals.total)}</span>
            </div>
            {totals.total > 0 && (
              <p className="mt-2 text-label-md text-on-surface-variant">
                Registering holds your place. It is not a ticket until it is paid: the next page shows how to pay
                {event.allow_pay_at_reception ? ', or you can pay at reception' : ''}.
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

          {/* What is ahead, before they start: registering is step one of
              three when there is something to pay (lib/registrationSteps).
              Only then — a free order is done by registering. */}
          {totals.total > 0 && (() => {
            const view = registerFormSteps(pounds(totals.total))
            return <Steps steps={view.steps} caption={view.caption} label="What happens next" />
          })()}

          {/* What is wrong, by name, each a way back to it. It is here, by
              the button, because that is where they are looking when they
              press it; the page has also gone to the first. */}
          {tried && problems.length > 0 && (
            <div
              role="alert"
              aria-label="What to put right"
              className="flex gap-3 rounded-[var(--radius-card)] bg-error-container p-4 text-on-error-container"
            >
              <WarningIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <div className="min-w-0">
                <p className="text-body-md font-semibold">
                  {problems.length === 1
                    ? 'One thing to put right before you can register'
                    : `${problems.length} things to put right before you can register`}
                </p>
                <ul className="mt-2 flex flex-col gap-1.5 text-body-sm">
                  {problems.map((p) => (
                    <li key={p.key}>
                      <button type="button" onClick={() => goTo(p.spot)} className="text-left font-medium underline underline-offset-2">
                        {p.text}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Never greyed out for something missing: pressed, it says what. */}
          <ActionButton type="submit" disabled={register.isPending || !event.open || soldOut}>
            {register.isPending ? 'Registering…' : registerLabel}
          </ActionButton>
        </form>
      )}

      {confirming && (
        <ConfirmEmailDialog
          email={email.trim()}
          confirmLabel={registerLabel}
          busy={register.isPending}
          onConfirm={() => register.mutate()}
          onChange={changeEmail}
          // The spelling offered is taken for both boxes: it is one address.
          onUse={(next) => {
            setEmail(next)
            setEmailAgain(next)
          }}
        />
      )}

      <TicketAgain slug={event.slug} />

      {/* A way to reach the church from here (0287): shown whatever state the event is in.
          Centred, like the "lost your ticket?" line it sits under: the two are
          the page's foot, and the button used to hang off the left edge below
          a centred sentence. */}
      <ContactOrganisers slug={event.slug} eventTitle={event.title} className="mt-4 flex flex-col items-center text-center" />
    </PublicShell>
  )
}

/** "I have lost my ticket": the links go to the address that registered, or nowhere (0247). */
function TicketAgain({ slug }: { slug: string }) {
  const errorText = useErrorText()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [said, setSaid] = useState<string | null>(null)
  /** Send was pressed with an address that cannot be one. */
  const [wrong, setWrong] = useState(false)
  const send = useMutation({
    mutationFn: () => resendTickets(slug, email),
    onSuccess: (result) =>
      setSaid(
        result.reason === 'not configured'
          ? 'Tickets cannot be emailed just now. Ask the church for your ticket link.'
          : 'If that address has a registration for this event, its ticket link is on its way. Check your inbox and junk folder.',
      ),
    onError: (err: unknown) => setSaid(errorText(err, 'Could not send just now. Try again in a few minutes.')),
  })
  if (!open) {
    return (
      <p className="mt-8 text-center text-body-sm text-on-surface-variant">
        Already registered and lost your ticket?{' '}
        <button type="button" onClick={() => setOpen(true)} className="tap font-medium text-accent-blue-soft hover:underline">
          Get your ticket again
        </button>
      </p>
    )
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        // Said, not swallowed: the button used to do nothing at all for an address with a slip in it.
        if (!looksLikeEmail(email)) {
          setWrong(true)
          setSaid(null)
          return
        }
        send.mutate()
      }}
      aria-label="Get your ticket again"
      className="mt-8 rounded-[var(--radius-card)] bg-surface-lowest p-4 hairline"
    >
      <h2 className="text-headline-sm text-on-surface">Get your ticket again</h2>
      <p className="mt-1 text-body-sm text-on-surface-variant">The email address you registered with. Your ticket link goes there and nowhere else.</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Field label="Email" className="min-w-0 flex-1">
          <input
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setWrong(false)
            }}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            maxLength={254}
            className={`${inputClasses} ${wrong ? 'field-error' : ''}`}
            {...(wrong ? { 'aria-invalid': true as const, 'aria-describedby': 'ticket-again-error' } : {})}
          />
        </Field>
        <ActionButton type="submit" tone="quiet" disabled={send.isPending || !email.trim()}>
          {send.isPending ? 'Sending…' : 'Send my ticket'}
        </ActionButton>
      </div>
      {wrong && (
        <p id="ticket-again-error" role="alert" className="mt-3 text-body-sm font-medium text-error">
          That email address doesn’t look right. It should be like name@example.com.
        </p>
      )}
      {said && (
        <p role="status" className="mt-3 text-body-sm text-on-surface-variant">
          {said}
        </p>
      )}
    </form>
  )
}
