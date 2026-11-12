import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PublicNothing, PublicShell } from '../components/PublicShell'
import { ActionButton, Field, Overlay, Pill, Steps, inputClasses } from '../components/Surface'
import { QrCode } from '../components/QrCode'
import { Countdown } from '../components/Countdown'
import { useNow } from '../lib/timeLeft'
import { useConfirmAction } from '../components/ConfirmAction'
import { TicketEmailFix } from '../components/TicketEmailFix'
import { EMAIL_WATCH_EVERY_MS, watchesEmail } from '../lib/emailDelivery'
import { AccountCard } from './GivingPage'
import { useErrorText } from '../lib/useErrorText'
import { directionsUrl } from '../lib/directions'
import { ContactOrganisers } from '../components/ContactOrganisers'
import { pounds, priceWords } from '../lib/money'
import { REGISTER_PATH, ticketUrl } from '../lib/registrationLinks'
import { paysOnline, registrationSteps, stepNumber } from '../lib/registrationSteps'
import { PAYMENT_WORDS, cancelOrder, fetchOrder, imagePosition, registrationImageUrl, reportPayment, requestRefund, sendTicketEmail, uploadProof, whenWords, type OrderView } from '../lib/registrations'

/**
 * A ticket (0244): /ticket/<code>. The QR code for the door, what was
 * booked and for whom, and — for a paid order — how to pay and where that
 * stands. The code in the address is the key: whoever has the link has
 * the ticket, which is also how it is shared and saved.
 *
 * One code, two meanings (0247): until a paid order is paid, this page is
 * a *registration* — shown at reception to pay, where the same QR code
 * brings the order up — and once the church has the money it is the
 * *ticket*, shown at the door. Paying online: the attendee pays by one of
 * the church's links or a bank transfer, with the code as the reference,
 * and sends the proof — a screenshot or PDF of the receipt, or the
 * payment reference, or both — which whoever runs registrations matches
 * against the account; "being checked" stays until they do. Or they
 * choose to pay at reception.
 *
 * And the one place a wrong address can be caught (0283): the page of
 * somebody who has just registered asks again, for a few minutes, what
 * became of their email, and if it bounced says so and takes the right
 * address (components/TicketEmailFix).
 */
export function TicketPage() {
  const { code = '' } = useParams()
  const [openedAt] = useState(() => Date.now())
  /** When this page last asked for an email: the watch for a bounce starts again from there. */
  const askedAt = useRef<number | null>(null)
  const order = useQuery({
    queryKey: ['ticket', code],
    queryFn: () => fetchOrder(code),
    // While their email is on its way: a bounce comes back within the minute (lib/emailDelivery).
    refetchInterval: (query) => (watchesEmail(query.state.data, { openedAt, askedAt: askedAt.current }, Date.now()) ? EMAIL_WATCH_EVERY_MS : false),
  })

  if (order.isLoading) {
    return (
      <PublicShell title="Your ticket" logoPath={null}>
        <p className="mt-10 text-center text-body-sm text-on-surface-variant">Loading…</p>
      </PublicShell>
    )
  }
  if (order.error || !order.data) {
    return <PublicNothing title="No such ticket" body="This link doesn’t lead to a ticket. Check it against the one you were given." />
  }
  return (
    <Ticket
      order={order.data}
      onEmailAsked={() => {
        askedAt.current = Date.now()
      }}
    />
  )
}

const STATUS_TONE: Record<OrderView['payment_status'], 'neutral' | 'orange' | 'blue' | 'green'> = {
  not_needed: 'neutral',
  awaiting: 'orange',
  reported: 'blue',
  received: 'green',
  waived: 'green',
}

type OnlineMethod = 'paypal' | 'bank'
const METHOD_WORDS: Record<OnlineMethod, string> = { paypal: 'the online link', bank: 'bank transfer' }
const PROOF_TYPES = 'image/png,image/jpeg,image/webp,application/pdf'
const PROOF_LIMIT = 5 * 1024 * 1024

function Ticket({ order, onEmailAsked }: { order: OrderView; onEmailAsked: () => void }) {
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const { ask, dialog } = useConfirmAction()
  const [error, setError] = useState<string | null>(null)
  // Each minute: when the event starts, the countdown gives way to "Happening now".
  const now = useNow(true, 30_000)
  const [showBank, setShowBank] = useState(false)
  const [copied, setCopied] = useState(false)
  const [mailed, setMailed] = useState<string | null>(null)
  /** The address they have just put right, after a bounce: where the ticket is going now. */
  const [fixedTo, setFixedTo] = useState<string | null>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['ticket', order.code] })
  const paid = order.payment_status === 'not_needed' || order.payment_status === 'received' || order.payment_status === 'waived'
  const noun = paid ? 'ticket' : 'registration'
  const mail = useMutation({
    mutationFn: () => sendTicketEmail(order.code),
    onSuccess: (result) => {
      // Asked for again: if it bounces, this page should hear (0283).
      onEmailAsked()
      void refresh()
      setMailed(
        result.reason === 'not configured'
          ? 'Email is not set up yet — save this page’s link instead.'
          : result.ok && result.sent === false
            ? `Already sent to ${order.email} in the last few minutes. Check the junk folder.`
            : result.ok
              ? `On its way to ${order.email}.`
              : 'Could not send just now. Save this page’s link instead.',
      )
    },
  })
  /** Opened a payment link: when they come back, ask whether it went through. */
  const [pending, setPending] = useState<OnlineMethod | null>(null)
  const [asking, setAsk] = useState(false)
  /** The receipt step, for the way they paid. */
  const [proofFor, setProofFor] = useState<OnlineMethod | null>(null)

  const report = useMutation({
    mutationFn: ({ method, done }: { method: 'paypal' | 'bank' | 'reception'; done: boolean }) => reportPayment(order.code, method, done),
    onSuccess: () => {
      setError(null)
      setPending(null)
      return refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not save that.')),
  })
  const cancel = useMutation({
    mutationFn: () => cancelOrder(order.code),
    onSuccess: () => {
      setError(null)
      return refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not cancel this ticket.')),
  })

  // Back from the payment page: the tab comes back into view.
  useEffect(() => {
    if (!pending) return
    const onBack = () => {
      if (document.visibilityState === 'visible') setAsk(true)
    }
    document.addEventListener('visibilitychange', onBack)
    window.addEventListener('focus', onBack)
    return () => {
      document.removeEventListener('visibilitychange', onBack)
      window.removeEventListener('focus', onBack)
    }
  }, [pending])

  // The paid card is white in both themes, so it keeps fixed colours.
  const emailButton = (onWhite: boolean) => (
    <>
      <button
        type="button"
        onClick={() => mail.mutate()}
        disabled={mail.isPending}
        className={`tap mt-2 rounded-full px-4 text-label-md font-medium hover:underline disabled:opacity-60 ${onWhite ? 'text-[#0a66ff]' : 'text-accent-blue-soft'}`}
      >
        {mail.isPending ? 'Sending…' : `Email me this ${noun}`}
      </button>
      {mailed && (
        <p role="status" className={`mt-1 text-label-md ${onWhite ? 'text-[#5a5a72]' : 'text-on-surface-variant'}`}>
          {mailed}
        </p>
      )}
    </>
  )

  const event = order.event
  const image = registrationImageUrl(event.image_path)
  const directions = directionsUrl(event.location)
  const dates = order.date ? [order.date] : event.dates
  // Called off by the church (0250): no ticket to show, nothing to pay.
  const eventOff = !!event.cancelled_at
  const needsPayment = !eventOff && order.status === 'confirmed' && (order.payment_status === 'awaiting' || order.payment_status === 'reported')
  const cancelled = order.status === 'cancelled'
  /** A link or a bank account to pay by: the reference and the screenshot matter. */
  const payOnline = paysOnline(order)
  // Where it stands, as steps (lib/registrationSteps); the pay box below
  // wears the same numbers, so the bar and the box never disagree.
  const stepsView = registrationSteps(order, pounds)
  const payNumber = (stepsView && stepNumber(stepsView, 'pay')) ?? 2
  const receiptNumber = (stepsView && stepNumber(stepsView, 'receipt')) ?? 3
  const title = cancelled ? 'Ticket' : paid ? 'Ticket' : 'Registration'
  // The date to count down to: the one booked, or the next of the event's
  // dates still to start — or one under way now. None once it is all over.
  const nextDate = [...dates]
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .find((d) => new Date(d.ends_at ?? d.starts_at).getTime() > now.getTime())

  return (
    <PublicShell title={`${title} · ${event.title}`} logoPath={order.logo_path}>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {/* A green "Registered" over an unpaid order read as "all done" (the
            Owner, November 2026: people registered and did not pay). */}
        {cancelled ? <Pill tone="red">Cancelled</Pill> : paid || eventOff ? <Pill tone="green">Registered</Pill> : <Pill tone="orange">Not a ticket yet</Pill>}
        {order.total_pence > 0 && !cancelled && <Pill tone={STATUS_TONE[order.payment_status]}>{PAYMENT_WORDS[order.payment_status]}</Pill>}
        {order.checked_in_at && <Pill tone="blue">Checked in</Pill>}
      </div>
      <h1 className="mt-2 text-headline-xl text-on-surface">{event.title}</h1>
      <p className="text-body-md text-on-surface-variant">
        {order.quantity} {order.quantity === 1 ? 'ticket' : 'tickets'} for {order.name}
      </p>
      {stepsView && <Steps steps={stepsView.steps} caption={stepsView.caption} label="Your registration, step by step" className="mt-4" />}
      {eventOff && (
        <section aria-label="Event cancelled" className="mt-4 rounded-[var(--radius-card)] bg-error-container px-4 py-3 text-on-error-container">
          <p className="text-body-md font-semibold">This event has been cancelled</p>
          {event.cancel_note && <p className="mt-1 whitespace-pre-line text-body-sm">{event.cancel_note}</p>}
          {!order.refund_status && <p className="mt-1 text-body-sm">There is nothing for you to do.</p>}
        </section>
      )}
      {order.email_state === 'bounced' && !cancelled && (
        <TicketEmailFix
          order={order}
          noun={noun}
          onFixed={(email) => {
            setFixedTo(email)
            onEmailAsked()
            void refresh()
          }}
        />
      )}
      {fixedTo && order.email_state !== 'bounced' && (
        <p role="status" className="mt-4 rounded-[var(--radius-card)] bg-surface-lowest p-4 text-body-md text-on-surface hairline">
          Thank you. Your {noun} is on its way to <strong className="break-all font-semibold">{fixedTo}</strong>. Check your inbox, and the junk folder.
        </p>
      )}
      {order.refund_status && <RefundSection order={order} onSent={() => void refresh()} />}
      {needsPayment && (
        <section
          aria-label="Paying"
          className={`mt-4 rounded-[var(--radius-card)] p-5 ${
            order.payment_status === 'reported'
              ? 'bg-surface-lowest hairline'
              : 'bg-[color-mix(in_oklab,var(--color-accent-orange)_12%,var(--color-surface-lowest))] shadow-[inset_0_0_0_1.5px_color-mix(in_oklab,var(--color-accent-orange)_55%,transparent)]'
          }`}
        >
          <h2 className="text-headline-md text-on-surface">
            {order.payment_status === 'reported' ? 'Thank you — your receipt is being checked' : `Pay ${pounds(order.total_pence)} to get your ticket`}
          </h2>
          {order.payment_status === 'awaiting' && (
            <p className="mt-1 text-body-md font-medium text-on-surface">
              You are registered, but you do not have a ticket yet. Your place is held; it becomes a ticket once the payment is in.
            </p>
          )}
          {order.payment_status === 'reported' ? (
            <p className="mt-1 text-body-sm text-on-surface-variant">
              You said you paid{order.payment_method && order.payment_method !== 'reception' ? ` by ${METHOD_WORDS[order.payment_method]}` : ''}
              {order.proof_reference ? `, reference ${order.proof_reference}` : ''}. Once the church matches it, this becomes your ticket, and you will get an email to say so.
            </p>
          ) : (
            <>
              {order.payment_method === 'reception' && (
                <p className="mt-1 text-body-sm text-on-surface-variant">You chose to pay at reception; you can still pay another way below.</p>
              )}
              {/*
                Paying online has two parts that were being missed (the
                Owner, November 2026): the reference, without which the
                church cannot tell whose money it is, and the screenshot,
                which is what gets it matched quickly. They are numbered
                as the bar above numbers them — Pay, then Receipt.
              */}
              {payOnline && (
                <ol aria-label="How to pay online" className="mt-3 flex flex-col gap-3 text-body-sm text-on-surface">
                  <li className="flex gap-3">
                    <StepNumber n={payNumber} />
                    <span className="min-w-0">
                      <span className="font-semibold">Pay {pounds(order.total_pence)}</span> with one of the buttons below, and{' '}
                      <span className="font-semibold">put this as the payment reference</span>, exactly as it is. Without it the church cannot tell the payment is yours.
                      <span className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className="rounded-[var(--radius-chip)] bg-surface-lowest px-3 py-1.5 font-mono text-body-md font-semibold tracking-[0.14em] text-on-surface hairline">
                          {order.code}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard?.writeText(order.code)
                            setCopied(true)
                          }}
                          className="tap rounded-full px-3 text-label-md font-medium text-accent-blue-soft hairline hover:bg-raised"
                        >
                          {copied ? 'Copied' : 'Copy reference'}
                        </button>
                      </span>
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <StepNumber n={receiptNumber} />
                    <span>
                      <span className="font-semibold">Come back here and send a screenshot</span> of the payment. It is the quickest way to get your ticket confirmed.
                    </span>
                  </li>
                </ol>
              )}
            </>
          )}
          {event.payment_note && <p className="mt-2 whitespace-pre-line text-body-sm text-on-surface-variant">{event.payment_note}</p>}
          {order.payment_status === 'awaiting' && (
            <div className="mt-4 flex flex-col gap-2">
              {order.payment.links.map((l, i) => (
                <a
                  key={i}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setPending('paypal')}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-body-sm font-semibold text-on-primary transition-transform active:scale-[0.97]"
                >
                  {l.label} <span aria-hidden="true">↗</span>
                </a>
              ))}
              {order.payment.accounts.length > 0 && (
                <ActionButton tone="quiet" onClick={() => setShowBank((s) => !s)} aria-expanded={showBank}>
                  {showBank ? 'Hide bank details' : 'Bank transfer'}
                </ActionButton>
              )}
              {showBank && (
                <div className="flex flex-col gap-3">
                  {order.payment.accounts.map((a, i) => (
                    <AccountCard
                      key={i}
                      account={{
                        id: String(i),
                        label: a.label,
                        account_name: a.account_name,
                        bank_name: a.bank_name ?? null,
                        sort_code: a.sort_code ?? null,
                        account_number: a.account_number ?? null,
                        iban: a.iban ?? null,
                        bic: a.bic ?? null,
                        reference: order.code,
                        notes: null,
                        sort_order: i,
                      }}
                    />
                  ))}
                  <ActionButton tone="success" onClick={() => setProofFor('bank')} disabled={report.isPending}>
                    I’ve sent the transfer — send my screenshot
                  </ActionButton>
                </div>
              )}
              {/* Step 3, always in reach: the come-back prompt only appears
                  if the payment page was opened from here, in this tab.
                  Not while the bank details are open, though: the button
                  under them does exactly this, and two green buttons saying
                  nearly the same thing, one above the other, read as two
                  different things to do. */}
              {payOnline && !showBank && (
                <ActionButton tone="success" onClick={() => setProofFor(showBank || order.payment.links.length === 0 ? 'bank' : 'paypal')} disabled={report.isPending}>
                  I’ve paid — send my screenshot
                </ActionButton>
              )}
              {event.allow_pay_at_reception && order.payment_method !== 'reception' && (
                <ActionButton tone="ghost" onClick={() => report.mutate({ method: 'reception', done: false })} disabled={report.isPending}>
                  I’ll pay at reception
                </ActionButton>
              )}
            </div>
          )}
          {order.payment_status === 'reported' && (
            <div className="mt-4">
              <ActionButton tone="ghost" onClick={() => setProofFor(order.payment_method === 'paypal' ? 'paypal' : 'bank')}>
                Send another receipt
              </ActionButton>
            </div>
          )}
        </section>
      )}

      {!cancelled && !eventOff && nextDate && (
        <div className="mt-4">
          {new Date(nextDate.starts_at).getTime() > now.getTime() ? (
            <Countdown to={nextDate.starts_at} lead="Starts in" over="It has started — see you there." />
          ) : (
            <p className="rounded-[var(--radius-card)] bg-surface-lowest px-4 py-3 text-body-md font-medium text-accent-green-soft hairline">Happening now</p>
          )}
        </div>
      )}

      {!cancelled && !eventOff && paid && (
        <section aria-label="Your ticket" className="mt-5 rounded-[var(--radius-card)] bg-white p-5 text-center shadow-[var(--shadow-lifted)]">
          <p className="font-mono text-label-sm uppercase tracking-wide text-[#5a5a72]">Ticket</p>
          <QrCode text={ticketUrl(order.code)} label={`Ticket ${order.code}`} className="mx-auto mt-2 h-48 w-48" />
          <p className="mt-3 font-mono text-headline-sm tracking-[0.2em] text-[#14143a]">{order.code}</p>
          <p className="mt-1 text-label-md text-[#5a5a72]">
            {event.attendance === 'online'
              ? 'Save this page’s link — it is your ticket, and the way in is below.'
              : 'Show this at the door. Save this page’s link — it is your ticket.'}
          </p>
          {emailButton(true)}
        </section>
      )}
      {/*
        Not paid: no ticket to show, so no ticket-shaped card. The big QR
        code under a green "Registered" was read as the ticket itself. The
        code stays, as the payment reference; the QR is kept small and
        labelled, only where reception can use it — to take the payment, or
        to find a receipt that is being checked.
      */}
      {!cancelled && !eventOff && !paid && (
        <section aria-label="Your registration" className="mt-5 rounded-[var(--radius-card)] bg-surface-lowest p-5 text-center hairline">
          <p className="font-mono text-label-sm font-semibold uppercase tracking-wide text-accent-orange-soft">
            {order.payment_status === 'reported' ? 'Not a ticket yet — payment being checked' : 'Not a ticket — not paid'}
          </p>
          <p className="mt-2 text-label-md text-on-surface-variant">Registration code</p>
          <p className="font-mono text-headline-sm tracking-[0.2em] text-on-surface">{order.code}</p>
          {(order.payment_status === 'reported' || event.allow_pay_at_reception) && (
            <div className="mt-3">
              <div className="mx-auto w-fit rounded-[var(--radius-chip)] bg-white p-2">
                <QrCode text={ticketUrl(order.code)} label={`Registration ${order.code}`} className="h-28 w-28" />
              </div>
              <p className="mx-auto mt-2 max-w-xs text-label-md text-on-surface-variant">
                {order.payment_status === 'reported'
                  ? 'This is not a ticket. Once the church matches your payment it becomes one, and you will get an email to say so.'
                  : 'This is not a ticket. Reception scans it to take your payment.'}
              </p>
            </div>
          )}
          {emailButton(false)}
        </section>
      )}

      <section className="mt-6 flex flex-col gap-4">
        {image && <img src={image} alt="" style={{ objectPosition: imagePosition(event.image_focus) }} className="aspect-[16/9] w-full rounded-[var(--radius-card)] object-cover" />}
        <div>
          <p className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">When</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-body-md text-on-surface">
            {dates.map((d) => (
              <li key={d.id}>
                {whenWords(d.starts_at, d.ends_at)}
                {d.label && <span className="text-on-surface-variant"> · {d.label}</span>}
              </li>
            ))}
          </ul>
        </div>
        {event.attendance && event.attendance !== 'in_person' && !cancelled && (
          <section aria-label="Joining online" className="rounded-[var(--radius-card)] bg-surface-lowest p-4 hairline">
            <p className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">Joining online</p>
            {order.join ? (
              <>
                {order.join.url ? (
                  <a
                    href={order.join.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-body-sm font-semibold text-on-primary transition-transform active:scale-[0.97]"
                  >
                    Join online <span aria-hidden="true">↗</span>
                  </a>
                ) : (
                  <p className="mt-1 text-body-sm text-on-surface-variant">The church will put the link to join here before the event.</p>
                )}
                {order.join.details && <p className="mt-2 whitespace-pre-line text-body-sm text-on-surface">{order.join.details}</p>}
              </>
            ) : (
              <p className="mt-1 text-body-sm text-on-surface-variant">The link to join appears here once your payment is confirmed.</p>
            )}
          </section>
        )}
        {event.attendance !== 'online' && (event.location.name || event.location.address) && (
          <div>
            <p className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">Where</p>
            {event.location.name && <p className="mt-1 text-body-md text-on-surface">{event.location.name}</p>}
            {event.location.address && <p className="whitespace-pre-line text-body-sm text-on-surface-variant">{event.location.address}</p>}
            {directions && (
              <a
                href={directions}
                target="_blank"
                rel="noopener noreferrer"
                className="tap mt-2 inline-flex items-center gap-2 rounded-full px-4 text-label-md font-medium text-accent-blue-soft hairline hover:bg-raised"
              >
                Open directions <span aria-hidden="true">↗</span>
              </a>
            )}
          </div>
        )}
        <div>
          <p className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">Tickets</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-body-md text-on-surface">
            {order.tickets.map((t, i) => (
              <li key={i} className="flex items-center justify-between gap-3">
                <span>
                  {t.type_name}
                  {t.attendee_name && <span className="text-on-surface-variant"> · {t.attendee_name}</span>}
                </span>
                <span className="font-mono text-body-sm tabular text-on-surface-variant">{priceWords(t.unit_price_pence)}</span>
              </li>
            ))}
          </ul>
          {order.total_pence > 0 && (
            <div className="mt-2 border-t border-border-subtle pt-2 text-body-sm text-on-surface-variant">
              {order.discount_pence > 0 && (
                <p className="flex justify-between">
                  <span>Promo code {order.promo_code}</span>
                  <span className="font-mono tabular">−{pounds(order.discount_pence)}</span>
                </p>
              )}
              <p className="flex justify-between text-body-md text-on-surface">
                <span>Total</span>
                <span className="font-mono tabular">{pounds(order.total_pence)}</span>
              </p>
            </div>
          )}
        </div>
        <div>
          <p className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">Booked by</p>
          <p className="mt-1 text-body-md text-on-surface">{order.name}</p>
          {(order.email || order.phone) && (
            <p className="text-body-sm text-on-surface-variant">
              {order.email}
              {order.phone && `${order.email ? ' · ' : ''}${order.phone}`}
            </p>
          )}
        </div>
      </section>

      {error && (
        <p role="alert" className="mt-4 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      {/* Something wrong with this registration? Who it is from goes with the message (0287). */}
      <ContactOrganisers slug={event.slug} eventTitle={event.title} code={order.code} name={order.name ?? ''} email={order.email ?? ''} className="mt-6" />

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <Link to={`${REGISTER_PATH}/${event.slug}`} className="tap text-label-md text-accent-blue-soft hover:underline">
          Event page
        </Link>
        {order.can_cancel && !order.checked_in_at && !eventOff && (
          <button
            type="button"
            onClick={() =>
              ask({
                title: 'Cancel your registration?',
                body: 'Your tickets go back on sale. If you have paid, your refund is arranged from this page: it will say how the money comes back.',
                confirmLabel: 'Cancel it',
                cancelLabel: 'Keep it',
                onConfirm: () => cancel.mutate(),
              })
            }
            disabled={cancel.isPending}
            className="tap text-label-md text-on-surface-faint hover:text-error hover:underline"
          >
            Cancel my registration
          </button>
        )}
      </div>

      {asking && (
        <Overlay label="Did you complete the payment?" onDismiss={() => setAsk(false)}>
          <div className="w-full max-w-sm rounded-[var(--radius-card)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)]">
            <h2 className="text-headline-md text-on-surface">Did you complete the payment?</h2>
            <p className="mt-1 text-body-sm text-on-surface-variant">If so, send the receipt next, so the church can match it. If not, you can still pay another way.</p>
            <div className="mt-5 flex flex-col gap-2">
              <ActionButton
                onClick={() => {
                  setAsk(false)
                  setPending(null)
                  setProofFor(pending === 'bank' ? 'bank' : 'paypal')
                }}
              >
                Yes, I’ve paid
              </ActionButton>
              <ActionButton
                tone="quiet"
                onClick={() => {
                  setAsk(false)
                  setPending(null)
                }}
              >
                Not yet
              </ActionButton>
            </div>
          </div>
        </Overlay>
      )}
      {proofFor && (
        <ProofStep
          code={order.code}
          method={proofFor}
          onDone={() => {
            setProofFor(null)
            setError(null)
            void refresh()
          }}
          onClose={() => setProofFor(null)}
        />
      )}
      {dialog}
    </PublicShell>
  )
}

/**
 * The receipt: a screenshot or PDF of the payment, or its reference, or
 * both — at least one, so whoever runs registrations can match it to the
 * money. The file goes to the private proofs bucket under this order's
 * own code; only the church can read it back.
 */
function ProofStep({ code, method, onDone, onClose }: { code: string; method: OnlineMethod; onDone: () => void; onClose: () => void }) {
  const errorText = useErrorText()
  const [file, setFile] = useState<File | null>(null)
  const [reference, setReference] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const send = useMutation({
    mutationFn: async () => {
      const path = file ? await uploadProof(code, file) : null
      await reportPayment(code, method, true, { path, reference: reference.trim() || null })
    },
    onSuccess: onDone,
    onError: (err: unknown) => setProblem(errorText(err, 'Could not send that. Try again, or type the reference instead.')),
  })
  const choose = (chosen: File | null) => {
    if (chosen && chosen.size > PROOF_LIMIT) {
      setFile(null)
      setProblem('That file is over 5 MB. A screenshot of the receipt is enough.')
      return
    }
    setProblem(null)
    setFile(chosen)
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!file && !reference.trim()) {
      setProblem('Attach a screenshot of the payment, or type its reference — one or the other, so the church can match it.')
      return
    }
    send.mutate()
  }
  return (
    <Overlay label="Your receipt" onDismiss={onClose}>
      <form onSubmit={submit} className="w-full max-w-sm rounded-[var(--radius-card)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)]">
        <h2 className="text-headline-md text-on-surface">Send your receipt</h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Attach a screenshot (or PDF) of the {METHOD_WORDS[method] === 'bank transfer' ? 'transfer' : 'payment'}. It is the quickest way for the church to find your payment and confirm your ticket by email.
        </p>
        <p className="mt-2 text-body-sm text-on-surface">
          The reference on your payment should be <span className="font-mono font-semibold">{code}</span>.
        </p>
        <Field label="Screenshot of the payment — quickest" className="mt-4">
          <input
            type="file"
            accept={PROOF_TYPES}
            onChange={(e) => choose(e.target.files?.[0] ?? null)}
            className="block w-full text-body-sm text-on-surface file:mr-3 file:rounded-full file:border-0 file:bg-raised file:px-4 file:py-2 file:text-label-md file:font-medium file:text-on-surface"
          />
        </Field>
        {file && <p className="mt-1 text-label-md text-on-surface-variant">{file.name}</p>}
        <Field label="No screenshot? The payment’s own reference" hint="The transaction number your bank or the payment page shows. Matching it takes longer than a screenshot." className="mt-4">
          <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} autoCapitalize="characters" autoCorrect="off" className={inputClasses} />
        </Field>
        {problem && (
          <p role="alert" className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
            {problem}
          </p>
        )}
        <div className="mt-5 flex flex-col gap-2">
          <ActionButton type="submit" disabled={send.isPending}>
            {send.isPending ? 'Sending…' : 'Send'}
          </ActionButton>
          <ActionButton tone="quiet" onClick={onClose} disabled={send.isPending}>
            Not now
          </ActionButton>
        </div>
      </form>
    </Overlay>
  )
}

/**
 * A refund (0250, 0253). One paid by bank transfer or PayPal goes back the
 * way it came, and the page says so; one paid in cash at reception has
 * nowhere to go, so the bank details are asked for. Since 0253 anybody
 * owed a refund may send details — required for cash, a choice for the
 * rest: the refund has not come back after the 5–7 working days it
 * should take, or they would rather have it in another account. The
 * details are private to whoever runs refunds, and wiped once it is sent.
 */
function RefundSection({ order, onSent }: { order: OrderView; onSent: () => void }) {
  const errorText = useErrorText()
  const [name, setName] = useState(order.name)
  const [sortCode, setSortCode] = useState('')
  const [account, setAccount] = useState('')
  const [iban, setIban] = useState('')
  const [abroad, setAbroad] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const send = useMutation({
    mutationFn: () => requestRefund(order.code, abroad ? { account_name: name, iban } : { account_name: name, sort_code: sortCode, account_number: account }),
    onSuccess: () => {
      setProblem(null)
      setEditing(false)
      onSent()
    },
    onError: (err: unknown) => setProblem(errorText(err, 'Could not send that. Check the details and try again.')),
  })
  const amount = pounds(order.total_pence)

  if (order.refund_status === 'refunded') {
    return (
      <section aria-label="Your refund" className="mt-4 rounded-[var(--radius-card)] bg-surface-lowest p-4 hairline">
        <Pill tone="green">Refunded</Pill>
        <p className="mt-2 text-body-md text-on-surface">
          {amount} was refunded{order.refund_at ? ` on ${new Date(order.refund_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}.
        </p>
      </section>
    )
  }
  const how = order.payment_method === 'paypal' ? 'through PayPal, to the account you paid from' : 'to the bank account you paid from'
  // Cash has nowhere to go back to: the details are needed. Otherwise they are a choice.
  const wanted = !!order.refund_details_wanted
  const sent = !!order.refund_details_sent
  const form = (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        send.mutate()
      }}
      className="mt-2 flex flex-col gap-3"
    >
      <p className="text-body-md text-on-surface">
        {wanted ? `You paid ${amount} at reception. Where should the church send it back?` : `Where should the church send ${amount} instead?`}
      </p>
      <p className="-mt-1 text-label-md text-on-surface-faint">Only whoever runs refunds can see these, and they are deleted once the refund is sent.</p>
      <Field label="Name on the account">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" className={inputClasses} />
      </Field>
      {abroad ? (
        <Field label="IBAN">
          <input value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())} maxLength={40} autoCapitalize="characters" autoCorrect="off" className={`${inputClasses} font-mono`} />
        </Field>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sort code">
            <input value={sortCode} onChange={(e) => setSortCode(e.target.value)} inputMode="numeric" placeholder="20-00-00" maxLength={8} className={`${inputClasses} font-mono`} />
          </Field>
          <Field label="Account number">
            <input value={account} onChange={(e) => setAccount(e.target.value)} inputMode="numeric" placeholder="12345678" maxLength={8} className={`${inputClasses} font-mono`} />
          </Field>
        </div>
      )}
      <button type="button" onClick={() => setAbroad((a) => !a)} className="tap self-start text-label-md font-medium text-accent-blue-soft hover:underline">
        {abroad ? 'Use a UK sort code and account number' : 'Not a UK account? Give an IBAN'}
      </button>
      {problem && (
        <p role="alert" className="rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <ActionButton type="submit" disabled={send.isPending}>
          {send.isPending ? 'Sending…' : 'Send my bank details'}
        </ActionButton>
        {(!wanted || sent) && (
          <ActionButton tone="ghost" onClick={() => setEditing(false)}>
            Not now
          </ActionButton>
        )}
      </div>
    </form>
  )
  return (
    <section aria-label="Your refund" className="mt-4 rounded-[var(--radius-card)] bg-surface-lowest p-4 hairline">
      <Pill tone="orange">Refund on its way</Pill>
      {editing || (wanted && !sent) ? (
        form
      ) : sent ? (
        <>
          <p className="mt-2 text-body-md text-on-surface">Thank you — the church has your bank details and will send {amount} to that account.</p>
          <button type="button" onClick={() => setEditing(true)} className="tap mt-1 text-label-md font-medium text-accent-blue-soft hover:underline">
            Change the bank details
          </button>
        </>
      ) : (
        <>
          <p className="mt-2 text-body-md text-on-surface">The church will refund {amount} {how}. It usually shows within 5–7 working days of being sent, and there is nothing you need to send.</p>
          <p className="mt-2 text-body-sm text-on-surface-variant">Not back after 5–7 working days, or would you rather have it in another account?</p>
          <button type="button" onClick={() => setEditing(true)} className="tap mt-1 text-label-md font-medium text-accent-blue-soft hover:underline">
            Give bank details to send it to
          </button>
        </>
      )}
    </section>
  )
}

/** A step's number, in a filled circle: read before the words beside it. */
function StepNumber({ n }: { n: number }) {
  return (
    <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-label-sm font-semibold text-on-primary">
      {n}
    </span>
  )
}

