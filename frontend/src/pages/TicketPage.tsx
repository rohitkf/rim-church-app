import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PublicNothing, PublicShell } from '../components/PublicShell'
import { ActionButton, Overlay, Pill } from '../components/Surface'
import { QrCode } from '../components/QrCode'
import { useConfirmAction } from '../components/ConfirmAction'
import { AccountCard } from './GivingPage'
import { useErrorText } from '../lib/useErrorText'
import { directionsUrl } from '../lib/directions'
import { pounds, priceWords } from '../lib/money'
import { REGISTER_PATH, ticketUrl } from '../lib/registrationLinks'
import { PAYMENT_WORDS, cancelOrder, fetchOrder, registrationImageUrl, reportPayment, sendTicketEmail, whenWords, type OrderView } from '../lib/registrations'

/**
 * A ticket (0244): /ticket/<code>. The QR code for the door, what was
 * booked and for whom, and — for a paid order — how to pay and where that
 * stands. The code in the address is the key: whoever has the link has
 * the ticket, which is also how it is shared and saved.
 *
 * Paying: the order already exists and its tickets are held. The attendee
 * pays by one of the church's links or a bank transfer, with the code as
 * the reference, and says so; "Payment reported" stays until whoever runs
 * registrations marks it received. Or they choose to pay at reception.
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

function Ticket({ order }: { order: OrderView }) {
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const { ask, dialog } = useConfirmAction()
  const [error, setError] = useState<string | null>(null)
  const [showBank, setShowBank] = useState(false)
  const [mailed, setMailed] = useState<string | null>(null)
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
  const [pending, setPending] = useState<'paypal' | 'bank' | null>(null)
  const [asking, setAsk] = useState(false)

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

  return (
    <PublicShell title={`Ticket · ${event.title}`} logoPath={order.logo_path}>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {cancelled ? <Pill tone="red">Cancelled</Pill> : <Pill tone="green">Registered</Pill>}
        {order.total_pence > 0 && !cancelled && <Pill tone={STATUS_TONE[order.payment_status]}>{PAYMENT_WORDS[order.payment_status]}</Pill>}
        {order.checked_in_at && <Pill tone="blue">Checked in</Pill>}
      </div>
      <h1 className="mt-2 text-headline-xl text-on-surface">{event.title}</h1>
      <p className="text-body-md text-on-surface-variant">
        {order.quantity} {order.quantity === 1 ? 'ticket' : 'tickets'} for {order.name}
      </p>

      {!cancelled && (
        <section aria-label="Your ticket" className="mt-5 rounded-[var(--radius-card)] bg-white p-5 text-center shadow-[var(--shadow-lifted)]">
          <QrCode text={ticketUrl(order.code)} label={`Ticket ${order.code}`} className="mx-auto h-48 w-48" />
          <p className="mt-3 font-mono text-headline-sm tracking-[0.2em] text-[#14143a]">{order.code}</p>
          <p className="mt-1 text-label-md text-[#5a5a72]">Show this at the door. Save this page’s link — it is your ticket.</p>
          <button
            type="button"
            onClick={() => mail.mutate()}
            disabled={mail.isPending}
            className="tap mt-2 rounded-full px-4 text-label-md font-medium text-[#0a66ff] hover:underline disabled:opacity-60"
          >
            {mail.isPending ? 'Sending…' : 'Email me this ticket'}
          </button>
          {mailed && (
            <p role="status" className="mt-1 text-label-md text-[#5a5a72]">
              {mailed}
            </p>
          )}
        </section>
      )}

      <section className="mt-6 flex flex-col gap-4">
        {image && <img src={image} alt="" className="aspect-[16/9] w-full rounded-[var(--radius-card)] object-cover" />}
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
        {(event.location.name || event.location.address) && (
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
          <p className="text-body-sm text-on-surface-variant">
            {order.email}
            {order.phone && ` · ${order.phone}`}
          </p>
        </div>
      </section>

      {needsPayment && (
        <section aria-label="Paying" className="mt-6 rounded-[var(--radius-card)] bg-surface-lowest p-5 hairline">
          <h2 className="text-headline-sm text-on-surface">
            {order.payment_status === 'reported' ? 'Thank you — your payment will be confirmed' : `To pay: ${pounds(order.total_pence)}`}
          </h2>
          {order.payment_status === 'reported' ? (
            <p className="mt-1 text-body-sm text-on-surface-variant">
              You said you paid{order.payment_method ? ` by ${order.payment_method === 'paypal' ? 'the online link' : 'bank transfer'}` : ''}. Once the church sees it, this ticket will say Paid.
            </p>
          ) : (
            <p className="mt-1 text-body-sm text-on-surface-variant">
              Use <span className="font-mono text-on-surface">{order.code}</span> as the reference, so it can be matched to your ticket.
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
                  <ActionButton tone="success" onClick={() => setAsk(true)} disabled={report.isPending}>
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
            <p className="mt-1 text-body-sm text-on-surface-variant">If so, the church will confirm it when it arrives. If not, you can still pay another way.</p>
            <div className="mt-5 flex flex-col gap-2">
              <ActionButton
                onClick={() => {
                  setAsk(false)
                  report.mutate({ method: pending === 'paypal' ? 'paypal' : 'bank', done: true })
                }}
                disabled={report.isPending}
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
      {dialog}
    </PublicShell>
  )
}
