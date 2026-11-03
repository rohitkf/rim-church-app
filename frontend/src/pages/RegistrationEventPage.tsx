import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ActionButton, PageHeader, Pill, Statistic, Tile } from '../components/Surface'
import { QueryState } from '../components/QueryState'
import { useConfirmAction } from '../components/ConfirmAction'
import { useErrorText } from '../lib/useErrorText'
import { showToast } from '../lib/toast'
import { pounds } from '../lib/money'
import { registerUrl, ticketUrl } from '../lib/registrationLinks'
import {
  PAYMENT_WORDS,
  REGISTRATIONS_KEY,
  STATUS_TONE,
  STATUS_WORDS,
  deleteRegistrationEvent,
  fetchRegistrationEvent,
  fetchRegistrationOrders,
  setRegistrationStatus,
  whenWords,
  type EventStatus,
  type OrderRow,
} from '../lib/registrations'

/**
 * One registration event (0244): its link, where it stands, the numbers,
 * and everybody who has registered. Publish, close, reopen, edit, delete.
 */
export function RegistrationEventPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const { ask, dialog } = useConfirmAction()
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const full = useQuery({ queryKey: [...REGISTRATIONS_KEY, 'event', id], queryFn: () => fetchRegistrationEvent(id) })
  const orders = useQuery({ queryKey: [...REGISTRATIONS_KEY, 'orders', id], queryFn: () => fetchRegistrationOrders(id) })
  const refresh = () => queryClient.invalidateQueries({ queryKey: REGISTRATIONS_KEY })

  const setStatus = useMutation({
    mutationFn: (status: EventStatus) => setRegistrationStatus(full.data!.event, status),
    onSuccess: (_r, status) => {
      setError(null)
      showToast(status === 'published' ? 'Published — share the link' : status === 'closed' ? 'Registration closed' : 'Saved')
      return refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not change that.')),
  })
  const remove = useMutation({
    mutationFn: () => deleteRegistrationEvent(id),
    onSuccess: () => {
      void refresh()
      navigate('/registrations', { replace: true })
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not delete this event.')),
  })

  if (full.isLoading) return <QueryState isLoading error={null}>{null}</QueryState>
  if (full.error || !full.data) {
    return (
      <QueryState isLoading={false} error={full.error ?? new Error('No such event.')}>
        {null}
      </QueryState>
    )
  }
  const { event, dates, ticketTypes } = full.data
  const link = registerUrl(event.slug)
  const rows = orders.data ?? []
  const confirmed = rows.filter((o) => o.status === 'confirmed')
  const tickets = confirmed.reduce((n, o) => n + o.quantity, 0)
  const expected = confirmed.reduce((n, o) => n + o.total_pence, 0)
  const received = confirmed.filter((o) => o.payment_status === 'received' || o.payment_status === 'waived').reduce((n, o) => n + o.total_pence, 0)
  const soldOf = (typeId: string) => confirmed.reduce((n, o) => n + o.tickets.filter((t) => t.ticket_type_id === typeId).length, 0)
  const canPublish = dates.length > 0 && ticketTypes.length > 0

  return (
    <div>
      <PageHeader
        eyebrow="Registrations"
        belowEyebrow={<Pill tone={STATUS_TONE[event.status]}>{STATUS_WORDS[event.status]}</Pill>}
        title={event.title}
        description={dates.map((d) => whenWords(d.starts_at, d.ends_at)).join(' · ') || 'No dates yet'}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton tone="quiet" onClick={() => navigate(`/registrations/${id}/edit`)}>
              Edit
            </ActionButton>
            {event.status === 'draft' && (
              <ActionButton onClick={() => setStatus.mutate('published')} disabled={!canPublish || setStatus.isPending}>
                Publish
              </ActionButton>
            )}
            {event.status === 'published' && (
              <ActionButton tone="danger-quiet" onClick={() => setStatus.mutate('closed')} disabled={setStatus.isPending}>
                Close registration
              </ActionButton>
            )}
            {event.status === 'closed' && (
              <ActionButton onClick={() => setStatus.mutate('published')} disabled={setStatus.isPending}>
                Reopen
              </ActionButton>
            )}
          </div>
        }
      />

      {error && (
        <p role="alert" className="mb-4 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}
      {event.status === 'draft' && !canPublish && (
        <p className="mb-4 text-body-sm text-on-surface-variant">Add at least one date and one ticket type before publishing.</p>
      )}

      <Tile className="mb-4">
        <p className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">{event.status === 'published' ? 'Share this link' : 'The link, once published'}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          <a href={link} target="_blank" rel="noopener noreferrer" className="min-w-0 break-all font-mono text-body-sm text-accent-blue-soft hover:underline">
            {link}
          </a>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(link)
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1500)
            }}
            className="tap text-label-md font-medium text-accent-blue-soft hover:underline"
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
        {event.status === 'draft' && <p className="mt-1 text-label-md text-on-surface-faint">Only you can open it while it is a draft — a preview.</p>}
      </Tile>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile>
          <Statistic value={confirmed.length} unit={confirmed.length === 1 ? 'order' : 'orders'} />
        </Tile>
        <Tile>
          <Statistic value={tickets} unit="tickets" />
        </Tile>
        <Tile>
          <Statistic value={pounds(received)} unit="received" />
        </Tile>
        <Tile>
          <Statistic value={pounds(expected - received)} unit="still to come" />
        </Tile>
      </div>

      <ul aria-label="Ticket types" className="mt-4 flex flex-col gap-2">
        {ticketTypes.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 rounded-[var(--radius-row)] bg-surface-lowest px-3.5 py-2.5 hairline">
            <span className="min-w-0 text-body-md text-on-surface">
              {t.name}
              <span className="text-on-surface-variant"> · {t.kind === 'free' ? 'Free' : t.kind === 'paid' ? pounds(t.price_pence) : 'Donation'}</span>
            </span>
            <span className="shrink-0 font-mono text-label-md tabular text-on-surface-variant">
              {soldOf(t.id)}
              {t.quantity !== null && ` / ${t.quantity}`}
              {event.date_mode === 'choose' && t.quantity !== null && ' per date'}
            </span>
          </li>
        ))}
      </ul>

      <section className="mt-8">
        <h2 className="text-headline-md text-on-surface">Who has registered</h2>
        <QueryState isLoading={orders.isLoading} error={orders.error} isEmpty={rows.length === 0} emptyMessage="Nobody yet.">
          <ul aria-label="Orders" className="mt-3 flex flex-col gap-2">
            {rows.map((o) => (
              <OrderLine key={o.id} order={o} dateLabel={dates.find((d) => d.id === o.date_id)} />
            ))}
          </ul>
        </QueryState>
      </section>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
        <Link to="/registrations" className="tap text-label-md text-on-surface-variant hover:underline">
          All events
        </Link>
        <button
          type="button"
          onClick={() =>
            ask({
              title: `Delete ${event.title}?`,
              body: 'Every registration on it goes too, and its link stops working. Export the orders first if you need them for the accounts.',
              confirmLabel: 'Delete',
              onConfirm: () => remove.mutate(),
            })
          }
          disabled={remove.isPending}
          className="tap text-label-md text-on-surface-faint hover:text-error hover:underline"
        >
          Delete this event
        </button>
      </div>
      {dialog}
    </div>
  )
}

const PAY_TONE: Record<OrderRow['payment_status'], 'neutral' | 'orange' | 'blue' | 'green'> = {
  not_needed: 'neutral',
  awaiting: 'orange',
  reported: 'blue',
  received: 'green',
  waived: 'green',
}

function OrderLine({ order, dateLabel }: { order: OrderRow; dateLabel?: { starts_at: string; ends_at: string | null } }) {
  const when = new Date(order.created_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  return (
    <li aria-label={order.name} className={`rounded-[var(--radius-row)] bg-surface-lowest p-3.5 hairline ${order.status === 'cancelled' ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-body-md font-medium text-on-surface">
            {order.name}
            <span className="text-on-surface-variant">
              {' '}
              · {order.quantity} {order.quantity === 1 ? 'ticket' : 'tickets'}
            </span>
          </p>
          <p className="break-words text-body-sm text-on-surface-variant">
            {order.email}
            {order.phone && ` · ${order.phone}`}
          </p>
          {dateLabel && <p className="text-label-md text-on-surface-faint">{whenWords(dateLabel.starts_at, dateLabel.ends_at)}</p>}
        </div>
        <div className="flex flex-col items-end gap-1">
          {order.status === 'cancelled' ? (
            <Pill tone="red">Cancelled</Pill>
          ) : order.total_pence > 0 ? (
            <Pill tone={PAY_TONE[order.payment_status]}>{PAYMENT_WORDS[order.payment_status]}</Pill>
          ) : (
            <Pill tone="neutral">Free</Pill>
          )}
          <span className="font-mono text-label-sm tabular text-on-surface-variant">
            {order.total_pence > 0 ? pounds(order.total_pence) : ''}
            {order.promo_code && ` · ${order.promo_code}`}
          </span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-label-sm text-on-surface-faint">
        <span>{when}</span>
        <span>{order.code}</span>
        <a href={ticketUrl(order.code)} target="_blank" rel="noopener noreferrer" className="tap text-accent-blue-soft hover:underline">
          Ticket
        </a>
        {order.checked_in_at && <span className="text-accent-green-soft">Checked in</span>}
      </div>
    </li>
  )
}
