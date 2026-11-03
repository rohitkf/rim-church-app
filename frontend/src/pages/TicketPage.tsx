import { type FormEvent, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PublicNothing, PublicShell } from '../components/PublicShell'
import { ActionButton, Field, Overlay, Pill, inputClasses } from '../components/Surface'
import { QrCode } from '../components/QrCode'
import { Countdown } from '../components/Countdown'
import { useNow } from '../lib/timeLeft'
import { useConfirmAction } from '../components/ConfirmAction'
import { AccountCard } from './GivingPage'
import { useErrorText } from '../lib/useErrorText'
import { directionsUrl } from '../lib/directions'
import { pounds, priceWords } from '../lib/money'
import { REGISTER_PATH, ticketUrl } from '../lib/registrationLinks'
import { PAYMENT_WORDS, cancelOrder, fetchOrder, imagePosition, registrationImageUrl, reportPayment, sendTicketEmail, uploadProof, whenWords, type OrderView } from '../lib/registrations'

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
 */
export function TicketPage() {
  const { code = '' } = useParams()
  const order = useQuery({ queryKey: ['ticket', code], queryFn: () => fetchOrder(code) })

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
  return <Ticket order={order.data} />
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

function Ticket({ order }: { order: OrderView }) {
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const { ask, dialog } = useConfirmAction()
  const [error, setError] = useState<string | null>(null)
  // Each minute: when the event starts, the countdown gives way to "Happening now".
  const now = useNow(true, 30_000)
  const [showBank, setShowBank] = useState(false)
  const [mailed, setMailed] = useState<string | null>(null)
  const paid = order.payment_status === 'not_needed' || order.payment_status === 'received' || order.payment_status === 'waived'
  const noun = paid ? 'ticket' : 'registration'
  const mail = useMutation({
    mutationFn: () => sendTicketEmail(order.code),
    onSuccess: (result) =>
      setMailed(
        result.reason === 'not configured'
          ? 'Email is not set up yet — save this page’s link instead.'
          : result.ok && result.sent === false
            ? `Already sent to ${order.email} in the last few minutes. Check the junk folder.`
            : result.ok
              ? `On its way to ${order.email}.`
              : 'Could not send just now. Save this page’s link instead.',
      ),
  })
  /** Opened a payment link: when they come back, ask whether it went through. */
  const [pending, setPending] = useState<OnlineMethod | null>(null)
  const [asking, setAsk] = useState(false)
  /** The receipt step, for the way they paid. */
  const [proofFor, setProofFor] = useState<OnlineMethod | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['ticket', order.code] })
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

  const event = order.event
  const image = registrationImageUrl(event.image_path)
  const directions = directionsUrl(event.location)
  const dates = order.date ? [order.date] : event.dates
  const needsPayment = order.status === 'confirmed' && (order.payment_status === 'awaiting' || order.payment_status === 'reported')
  const cancelled = order.status === 'cancelled'
  const title = cancelled ? 'Ticket' : paid ? 'Ticket' : 'Registration'
  // The date to count down to: the one booked, or the next of the event's
  // dates still to start — or one under way now. None once it is all over.
  const nextDate = [...dates]
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .find((d) => new Date(d.ends_at ?? d.starts_at).getTime() > now.getTime())

  return (
    <PublicShell title={`${title} · ${event.title}`} logoPath={order.logo_path}>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {cancelled ? <Pill tone="red">Cancelled</Pill> : <Pill tone="green">Registered</Pill>}
        {order.total_pence > 0 && !cancelled && <Pill tone={STATUS_TONE[order.payment_status]}>{PAYMENT_WORDS[order.payment_status]}</Pill>}
        {order.checked_in_at && <Pill tone="blue">Checked in</Pill>}
      </div>
      <h1 className="mt-2 text-headline-xl text-on-surface">{event.title}</h1>
      <p className="text-body-md text-on-surface-variant">
        {order.quantity} {order.quantity === 1 ? 'ticket' : 'tickets'} for {order.name}
      </p>
      {!cancelled && nextDate && (
        <div className="mt-4">
          {new Date(nextDate.starts_at).getTime() > now.getTime() ? (
            <Countdown to={nextDate.starts_at} lead="Starts in" over="It has started — see you there." />
          ) : (
            <p className="rounded-[var(--radius-card)] bg-surface-lowest px-4 py-3 text-body-md font-medium text-accent-green-soft hairline">Happening now</p>
          )}
        </div>
      )}

      {!cancelled && (
        <section aria-label={paid ? 'Your ticket' : 'Your registration'} className="mt-5 rounded-[var(--radius-card)] bg-white p-5 text-center shadow-[var(--shadow-lifted)]">
          <p className="font-mono text-label-sm uppercase tracking-wide text-[#5a5a72]">{paid ? 'Ticket' : 'Registration'}</p>
          <QrCode text={ticketUrl(order.code)} label={`${paid ? 'Ticket' : 'Registration'} ${order.code}`} className="mx-auto mt-2 h-48 w-48" />
          <p className="mt-3 font-mono text-headline-sm tracking-[0.2em] text-[#14143a]">{order.code}</p>
          <p className="mt-1 text-label-md text-[#5a5a72]">
            {paid
              ? event.attendance === 'online'
                ? 'Save this page’s link — it is your ticket, and the way in is below.'
                : 'Show this at the door. Save this page’s link — it is your ticket.'
              : order.payment_status === 'reported'
                ? 'Your receipt is being checked. Once the payment is matched, this becomes your ticket — show it at the door.'
                : 'Show this at reception to pay, or pay below. Once it is paid, this becomes your ticket.'}
          </p>
          <button
            type="button"
            onClick={() => mail.mutate()}
            disabled={mail.isPending}
            className="tap mt-2 rounded-full px-4 text-label-md font-medium text-[#0a66ff] hover:underline disabled:opacity-60"
          >
            {mail.isPending ? 'Sending…' : `Email me this ${noun}`}
          </button>
          {mailed && (
            <p role="status" className="mt-1 text-label-md text-[#5a5a72]">
              {mailed}
            </p>
          )}
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

      {needsPayment && (
        <section aria-label="Paying" className="mt-6 rounded-[var(--radius-card)] bg-surface-lowest p-5 hairline">
          <h2 className="text-headline-sm text-on-surface">
            {order.payment_status === 'reported' ? 'Thank you — your receipt is being checked' : `To pay: ${pounds(order.total_pence)}`}
          </h2>
          {order.payment_status === 'reported' ? (
            <p className="mt-1 text-body-sm text-on-surface-variant">
              You said you paid{order.payment_method && order.payment_method !== 'reception' ? ` by ${METHOD_WORDS[order.payment_method]}` : ''}
              {order.proof_reference ? `, reference ${order.proof_reference}` : ''}. Once the church matches it, this becomes your ticket, and you will get an email to say so.
            </p>
          ) : (
            <p className="mt-1 text-body-sm text-on-surface-variant">
              Use <span className="font-mono text-on-surface">{order.code}</span> as the reference, so it can be matched to your registration.
              {order.payment_method === 'reception' && ' You chose to pay at reception; you can still pay another way below.'}
            </p>
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
                    I’ve sent the transfer
                  </ActionButton>
                </div>
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

      {error && (
        <p role="alert" className="mt-4 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <Link to={`${REGISTER_PATH}/${event.slug}`} className="tap text-label-md text-accent-blue-soft hover:underline">
          Event page
        </Link>
        {order.can_cancel && (
          <button
            type="button"
            onClick={() =>
              ask({
                title: 'Cancel your registration?',
                body: 'Your tickets go back on sale. If you have paid, contact the church about a refund.',
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
      setProblem('Attach the receipt, or type the payment reference — one or the other, so the church can match it.')
      return
    }
    send.mutate()
  }
  return (
    <Overlay label="Your receipt" onDismiss={onClose}>
      <form onSubmit={submit} className="w-full max-w-sm rounded-[var(--radius-card)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)]">
        <h2 className="text-headline-md text-on-surface">Your receipt</h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          A screenshot or PDF of the {METHOD_WORDS[method] === 'bank transfer' ? 'transfer' : 'payment'}, or its reference, or both. The church matches it and confirms your ticket by email.
        </p>
        <Field label="Screenshot or PDF" className="mt-4">
          <input
            type="file"
            accept={PROOF_TYPES}
            onChange={(e) => choose(e.target.files?.[0] ?? null)}
            className="block w-full text-body-sm text-on-surface file:mr-3 file:rounded-full file:border-0 file:bg-raised file:px-4 file:py-2 file:text-label-md file:font-medium file:text-on-surface"
          />
        </Field>
        {file && <p className="mt-1 text-label-md text-on-surface-variant">{file.name}</p>}
        <Field label="Payment reference" hint="From your bank or the payment page, if you have it." className="mt-4">
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
