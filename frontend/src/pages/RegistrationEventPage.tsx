import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ActionButton, Field, Overlay, PageHeader, Pill, SegmentedControl, Statistic, Tile, inputClasses } from '../components/Surface'
import { ActionMenu, type MenuAction } from '../components/ActionMenu'
import { TicketScanner } from '../components/TicketScanner'
import { QrCode } from '../components/QrCode'
import { QueryState } from '../components/QueryState'
import { useConfirmAction } from '../components/ConfirmAction'
import { useRegistrationRights, type RegistrationRights } from '../lib/registrationRights'
import { useErrorText } from '../lib/useErrorText'
import { showToast } from '../lib/toast'
import { pounds } from '../lib/money'
import { registerUrl, ticketUrl } from '../lib/registrationLinks'
import { downloadBlob, qrPngBlob } from '../lib/qrPng'
import { writeWorkbook } from '../lib/writeWorkbook'
import {
  ORDER_FILTERS,
  PAYMENT_WORDS,
  REGISTRATIONS_KEY,
  STATUS_TONE,
  STATUS_WORDS,
  buildRegistrationWorkbook,
  cancelRegistrationEvent,
  deleteRegistrationEvent,
  fetchRefundDetails,
  notifyEventCancelled,
  sortCodeWords,
  fetchRegistrationEvent,
  fetchRegistrationOrders,
  markOrder,
  notifyPayment,
  orderMatches,
  proofUrl,
  receiverName,
  registrationExportFileName,
  setOrderNotes,
  setRegistrationStatus,
  whenWords,
  type EventStatus,
  type OrderAction,
  type OrderFilter,
  type OrderRow,
} from '../lib/registrations'

/**
 * One registration event (0244, 0245): its link, where it stands, the
 * numbers, and everybody who has registered — found by name, email or
 * code, filtered by what is owed or who has arrived, each with the things
 * reception does (mark a payment received or waived, check in, a note,
 * cancel), and the lot exported for the accounts. Publish, close, reopen,
 * edit, delete.
 *
 * Proof of payment (0247): an order that says it paid online carries its
 * receipt (a link to the private proofs bucket) and reference beside it;
 * Mark as received confirms it — and emails "your ticket is confirmed" —
 * while Not received, ask again puts it back to awaiting and emails that
 * the payment could not be matched. Who marked it, and when, stays on the
 * order. The link tile also has the event's QR code to download, for a
 * poster or a message: whoever scans it lands on the registration page.
 */
export function RegistrationEventPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const { ask, dialog } = useConfirmAction()
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [filter, setFilter] = useState<OrderFilter>('all')
  const [query, setQuery] = useState('')
  const [noteFor, setNoteFor] = useState<OrderRow | null>(null)
  const [noteText, setNoteText] = useState('')
  const [scanning, setScanning] = useState(false)
  // What this person may press here (0251); the database checks the same.
  const rights = useRegistrationRights()
  const [cancelling, setCancelling] = useState(false)
  const [cancelNote, setCancelNote] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteTyped, setDeleteTyped] = useState('')
  const [refundFor, setRefundFor] = useState<OrderRow | null>(null)

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
  // The money is in: "your ticket is confirmed", to whoever gave an address. Nothing waits on it.
  const ticketConfirmed = (order: OrderRow) => {
    if (order.email) void notifyPayment('paid', order.code)
  }
  const mark = useMutation({
    mutationFn: ({ order, action }: { order: OrderRow; action: OrderAction }) => markOrder(order.id, action),
    onSuccess: (_r, { order, action }) => {
      setError(null)
      if (action === 'received') ticketConfirmed(order)
      showToast(ACTION_DONE[action])
      return refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not change that registration.')),
  })
  // Reception took the money and let them in: two marks, one tap.
  const payAndCheckIn = useMutation({
    mutationFn: async (order: OrderRow) => {
      await markOrder(order.id, 'received')
      await markOrder(order.id, 'check_in')
    },
    onSuccess: (_r, order) => {
      setError(null)
      ticketConfirmed(order)
      showToast('Received, and checked in')
      return refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not change that registration.')),
  })
  // A reported payment that is not in the account: back to awaiting, and an email says so.
  const askAgain = useMutation({
    mutationFn: (order: OrderRow) => markOrder(order.id, 'awaiting'),
    onSuccess: (_r, order) => {
      setError(null)
      if (order.email) void notifyPayment('unmatched', order.code)
      showToast(order.email ? 'Back to awaiting payment — they have been emailed' : 'Back to awaiting payment')
      return refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not change that registration.')),
  })
  const cancelEvent = useMutation({
    mutationFn: () => cancelRegistrationEvent(id, cancelNote),
    onSuccess: (owedCount) => {
      setError(null)
      setCancelling(false)
      // Everyone with an address is told; nothing waits on it.
      void notifyEventCancelled(id)
      showToast(owedCount > 0 ? `Event cancelled — ${owedCount} ${owedCount === 1 ? 'refund' : 'refunds'} owed` : 'Event cancelled')
      return refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not cancel the event.')),
  })
  const downloadQr = useMutation({
    mutationFn: async () => downloadBlob(await qrPngBlob(registerUrl(full.data!.event.slug), full.data!.event.title), `${full.data!.event.slug}-qr.png`),
    onSuccess: () => showToast('QR code downloaded'),
    onError: (err: unknown) => setError(errorText(err, 'Could not make the QR code.')),
  })
  const saveNote = useMutation({
    mutationFn: ({ order, notes }: { order: OrderRow; notes: string }) => setOrderNotes(order.id, notes),
    onSuccess: () => {
      setError(null)
      setNoteFor(null)
      return refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not save the note.')),
  })
  const exportAll = useMutation({
    mutationFn: () => writeWorkbook(buildRegistrationWorkbook(full.data!, orders.data ?? []), registrationExportFileName(full.data!.event.slug)),
    onSuccess: () => {
      setError(null)
      showToast('Exported')
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not export the registrations.')),
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
  const checkedIn = confirmed.filter((o) => o.checked_in_at).length
  const soldOf = (typeId: string) => confirmed.reduce((n, o) => n + o.tickets.filter((t) => t.ticket_type_id === typeId).length, 0)
  const canPublish = dates.length > 0 && ticketTypes.length > 0
  const shown = rows.filter((o) => orderMatches(o, filter, query))

  const openNote = (order: OrderRow) => {
    setNoteText(order.notes ?? '')
    setNoteFor(order)
  }
  const cancelOrder = (order: OrderRow) =>
    ask({
      title: `Cancel ${order.name}’s registration?`,
      body: `Their ${order.quantity === 1 ? 'ticket goes' : `${order.quantity} tickets go`} back on sale. If they have paid, the refund is yours to arrange.`,
      confirmLabel: 'Cancel it',
      cancelLabel: 'Keep it',
      onConfirm: () => mark.mutate({ order, action: 'cancel' }),
    })
  const askDelete = () => {
    setDeleteTyped('')
    setDeleting(true)
  }
  const notReceived = (order: OrderRow) =>
    ask({
      title: `Not received from ${order.name}?`,
      body: order.email
        ? `Their registration goes back to awaiting payment, and an email to ${order.email} says the payment could not be matched and asks them to check, or pay at reception.`
        : 'Their registration goes back to awaiting payment. They gave no email address, so nobody is told.',
      confirmLabel: 'Ask again',
      cancelLabel: 'Keep it',
      onConfirm: () => askAgain.mutate(order),
    })

  const cancelled = !!event.cancelled_at
  // Money in and not yet sent back: the event cannot be deleted while any is.
  const unrefunded = rows.filter((o) => o.total_pence > 0 && (o.payment_status === 'received' || o.payment_status === 'reported') && o.refund_status !== 'refunded')
  const owed = rows.filter((o) => o.refund_status === 'owed')
  const owedPence = owed.reduce((n, o) => n + o.total_pence, 0)
  const eventActions: MenuAction[] = [
    { label: 'Download QR code', onSelect: () => downloadQr.mutate(), hint: 'For a poster or a message' },
    { label: 'Export to Excel', onSelect: () => exportAll.mutate(), disabled: rows.length === 0 },
  ]
  if (!cancelled && event.status !== 'draft' && rights.cancel) {
    eventActions.push({ label: 'Cancel event', tone: 'danger', onSelect: () => setCancelling(true), hint: 'Called off: everyone is told, and every order is kept' })
  }
  if (rights.delete) {
    eventActions.push(
      unrefunded.length > 0
        ? { label: 'Delete event', tone: 'danger', onSelect: () => undefined, disabled: true, hint: `${unrefunded.length} paid and not refunded — cancel the event and refund them first` }
        : { label: 'Delete event', tone: 'danger', onSelect: askDelete, hint: 'For a test or a duplicate; everything on it goes' },
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="Registrations"
        belowEyebrow={cancelled ? <Pill tone="red">Cancelled</Pill> : <Pill tone={STATUS_TONE[event.status]}>{STATUS_WORDS[event.status]}</Pill>}
        title={event.title}
        description={dates.map((d) => whenWords(d.starts_at, d.ends_at)).join(' · ') || 'No dates yet'}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {!cancelled && rights.edit && (
              <ActionButton tone="quiet" onClick={() => navigate(`/registrations/${id}/edit`)}>
                Edit
              </ActionButton>
            )}
            {event.status === 'draft' && rights.edit && (
              <ActionButton onClick={() => setStatus.mutate('published')} disabled={!canPublish || setStatus.isPending}>
                Publish
              </ActionButton>
            )}
            {event.status === 'published' && rights.edit && (
              <ActionButton tone="danger-quiet" onClick={() => setStatus.mutate('closed')} disabled={setStatus.isPending}>
                Close registration
              </ActionButton>
            )}
            {event.status === 'closed' && !cancelled && rights.edit && (
              <ActionButton onClick={() => setStatus.mutate('published')} disabled={setStatus.isPending}>
                Reopen
              </ActionButton>
            )}
            {/* The rest of what can be done to the event itself, deleting it last. */}
            <ActionMenu label={event.title} actions={eventActions} />
          </div>
        }
      />

      {error && (
        <p role="alert" className="mb-4 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}
      {cancelled && (
        <section aria-label="Cancelled" className="mb-4 rounded-[var(--radius-card)] bg-error-container px-4 py-3 text-on-error-container">
          <p className="text-body-md font-medium">Cancelled {new Date(event.cancelled_at!).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
          {event.cancel_note && <p className="mt-1 whitespace-pre-line text-body-sm">{event.cancel_note}</p>}
          <p className="mt-1 text-body-sm">
            {owed.length > 0
              ? `${owed.length} ${owed.length === 1 ? 'refund' : 'refunds'} still owed, ${pounds(owedPence)}. Show Refunds below to work through them.`
              : 'Nothing is owed back.'}
          </p>
        </section>
      )}
      {event.status === 'draft' && !canPublish && (
        <p className="mb-4 text-body-sm text-on-surface-variant">Add at least one date and one ticket type before publishing.</p>
      )}

      <Tile className="mb-4">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
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
              <button type="button" onClick={() => downloadQr.mutate()} disabled={downloadQr.isPending} className="tap text-label-md font-medium text-accent-blue-soft hover:underline disabled:opacity-60">
                Download QR code
              </button>
              {event.status !== 'draft' && !cancelled && rights.door && (
                <Link to={`/door?event=${event.id}`} className="tap text-label-md font-medium text-accent-blue-soft hover:underline">
                  Open Reception
                </Link>
              )}
            </div>
            {event.status === 'draft' && <p className="mt-1 text-label-md text-on-surface-faint">Only you can open it while it is a draft — a preview.</p>}
            {event.status !== 'draft' && <p className="mt-1 text-label-md text-on-surface-faint">The QR code says this link: on a poster or a slide, whoever scans it lands on the registration page.</p>}
          </div>
          <div className="shrink-0 rounded-[var(--radius-chip)] bg-white p-1.5">
            <QrCode text={link} label={`QR code for ${link}`} className="h-20 w-20" />
          </div>
        </div>
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
          {owed.length > 0 ? <Statistic value={pounds(owedPence)} unit="refunds owed" /> : <Statistic value={pounds(expected - received)} unit="still to come" />}
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
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 className="flex flex-wrap items-center gap-2 text-headline-md text-on-surface">
            Who has registered
            {checkedIn > 0 && <Pill tone="blue">{checkedIn} checked in</Pill>}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {event.status !== 'draft' && !cancelled && rows.length > 0 && rights.checkIn && (
              <ActionButton size="sm" onClick={() => setScanning(true)}>
                Scan tickets
              </ActionButton>
            )}
            <ActionButton size="sm" tone="quiet" onClick={() => exportAll.mutate()} disabled={rows.length === 0 || exportAll.isPending}>
              {exportAll.isPending ? 'Exporting…' : 'Export to Excel'}
            </ActionButton>
          </div>
        </div>
        {rows.length > 0 && (
          <div className="mt-3 flex flex-col gap-3">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search registrations"
              placeholder="Name, email, phone or code"
              autoCapitalize="off"
              className={`${inputClasses} max-w-sm`}
            />
            {/* Five segments do not fit a phone; the row scrolls rather than squeezes. */}
            <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
              <SegmentedControl label="Show" value={filter} onChange={setFilter} options={ORDER_FILTERS.map((f) => ({ value: f.key, label: f.label }))} className="w-max min-w-full" />
            </div>
          </div>
        )}
        <QueryState isLoading={orders.isLoading} error={orders.error} isEmpty={rows.length === 0} emptyMessage="Nobody yet.">
          {shown.length === 0 ? (
            <p className="mt-3 text-body-sm text-on-surface-variant">Nobody matches.</p>
          ) : (
            <ul aria-label="Orders" className="mt-3 flex flex-col gap-2">
              {shown.map((o) => (
                <OrderLine
                  key={o.id}
                  order={o}
                  dateLabel={dates.find((d) => d.id === o.date_id)}
                  actions={orderActions(o, (action) => mark.mutate({ order: o, action }), () => openNote(o), () => cancelOrder(o), () => notReceived(o), cancelled, () => setRefundFor(o), rights)}
                />
              ))}
            </ul>
          )}
        </QueryState>
        {rows.length > 0 && shown.length !== rows.length && (
          <p className="mt-2 text-label-md text-on-surface-faint">
            {shown.length} of {rows.length}
          </p>
        )}
      </section>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
        <Link to="/registrations" className="tap text-label-md text-on-surface-variant hover:underline">
          All events
        </Link>
      </div>

      {scanning && (
        <TicketScanner
          orders={rows}
          dates={dates}
          busy={mark.isPending || payAndCheckIn.isPending}
          onCheckIn={(order) => mark.mutate({ order, action: 'check_in' })}
          onPaidAndCheckIn={(order) => payAndCheckIn.mutate(order)}
          onClose={() => setScanning(false)}
        />
      )}
      {cancelling && (
        <Overlay label={`Cancel ${event.title}?`} onDismiss={() => setCancelling(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              cancelEvent.mutate()
            }}
            className="w-full max-w-md rounded-[var(--radius-card)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)]"
          >
            <h2 className="text-headline-md text-on-surface">Cancel {event.title}?</h2>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              Registration closes for good and the event leaves the church diary. Every order is kept. Everyone who registered is emailed, and their ticket says the event was cancelled.
              {unrefunded.length > 0 && ` ${unrefunded.length} paid ${unrefunded.length === 1 ? 'order' : 'orders'} will be marked as owing a refund; you work through them from this page.`}
            </p>
            <Field label="A word to everyone (optional)" className="mt-4">
              <textarea value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} rows={3} maxLength={1000} placeholder="We are sorry — the hall is closed for repairs." className={`${inputClasses} resize-y`} />
            </Field>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <ActionButton tone="ghost" onClick={() => setCancelling(false)}>
                Keep it on
              </ActionButton>
              <ActionButton type="submit" tone="danger" disabled={cancelEvent.isPending}>
                {cancelEvent.isPending ? 'Cancelling…' : 'Cancel the event'}
              </ActionButton>
            </div>
          </form>
        </Overlay>
      )}
      {deleting && (
        <Overlay label={`Delete ${event.title}?`} onDismiss={() => setDeleting(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (deleteTyped.trim() === event.title.trim()) remove.mutate()
            }}
            className="w-full max-w-md rounded-[var(--radius-card)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)]"
          >
            <h2 className="text-headline-md text-on-surface">Delete {event.title}?</h2>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              For a test or a duplicate. The event, every registration on it and its link go for good, and cannot be brought back. Export to Excel first if you might need them.
            </p>
            <Field label="Type the event’s name to delete it" className="mt-4">
              <input value={deleteTyped} onChange={(e) => setDeleteTyped(e.target.value)} autoComplete="off" className={inputClasses} />
            </Field>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <ActionButton tone="ghost" onClick={() => setDeleting(false)}>
                Keep it
              </ActionButton>
              <ActionButton type="submit" tone="danger" disabled={deleteTyped.trim() !== event.title.trim() || remove.isPending}>
                Delete for good
              </ActionButton>
            </div>
          </form>
        </Overlay>
      )}
      {refundFor && <RefundDetailsSheet order={refundFor} onClose={() => setRefundFor(null)} />}
      {noteFor && (
        <Overlay label={`A note on ${noteFor.name}’s registration`} onDismiss={() => setNoteFor(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              saveNote.mutate({ order: noteFor, notes: noteText })
            }}
            className="w-full max-w-md rounded-[var(--radius-card)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)]"
          >
            <h2 className="text-headline-md text-on-surface">A note on {noteFor.name}’s registration</h2>
            <p className="mt-1 text-body-sm text-on-surface-variant">For whoever runs registrations; the attendee never sees it.</p>
            <Field label="Note" className="mt-4">
              <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3} maxLength={2000} autoFocus className={`${inputClasses} resize-y`} />
            </Field>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <ActionButton tone="ghost" onClick={() => setNoteFor(null)}>
                Cancel
              </ActionButton>
              <ActionButton type="submit" disabled={saveNote.isPending}>
                Save note
              </ActionButton>
            </div>
          </form>
        </Overlay>
      )}
      {dialog}
    </div>
  )
}

const ACTION_DONE: Record<OrderAction, string> = {
  received: 'Marked as received',
  waived: 'Payment waived',
  awaiting: 'Back to awaiting payment',
  check_in: 'Checked in',
  undo_check_in: 'Check-in undone',
  cancel: 'Registration cancelled',
  restore: 'Registration put back',
  refunded: 'Marked as refunded',
}

/** What reception can do to an order, as it stands. */
function orderActions(
  o: OrderRow,
  act: (action: OrderAction) => void,
  note: () => void,
  cancel: () => void,
  notReceived: () => void,
  eventCancelled: boolean,
  refundDetails: () => void,
  r: RegistrationRights,
): MenuAction[] {
  const actions: MenuAction[] = []
  // A refund owed comes first: it is what this order needs.
  if (o.refund_status === 'owed' && r.refund) {
    const cash = !o.payment_method || o.payment_method === 'reception'
    if (cash) actions.push({ label: 'Where to send the refund', onSelect: refundDetails, hint: 'Paid at reception: the bank details they sent' })
    actions.push({
      label: 'Mark as refunded',
      tone: 'accent',
      onSelect: () => act('refunded'),
      hint: cash ? 'Sent to the account they gave' : o.payment_method === 'paypal' ? 'Refunded in PayPal' : 'Sent back to the account it came from',
    })
  }
  if (eventCancelled) {
    actions.push({ label: o.notes ? 'Edit the note' : 'Add a note', onSelect: note })
    return actions
  }
  if (o.status === 'confirmed') {
    if (o.payment_status !== 'not_needed') {
      if (o.payment_status !== 'received' && r.takePayment) {
        actions.push({
          label: 'Mark as received',
          onSelect: () => act('received'),
          tone: 'accent',
          hint: o.payment_status === 'reported' ? 'The receipt matches the account; their ticket is confirmed by email' : 'The money has arrived',
        })
      }
      if (r.approve) {
        if (o.payment_status === 'reported') actions.push({ label: 'Not received, ask again', onSelect: notReceived, hint: 'Nothing matches; an email asks them to check' })
        if (o.payment_status !== 'waived') actions.push({ label: 'Waive the payment', onSelect: () => act('waived') })
        if (o.payment_status === 'received' || o.payment_status === 'waived') actions.push({ label: 'Back to awaiting payment', onSelect: () => act('awaiting') })
      }
    }
    if (r.checkIn) {
      actions.push(
        o.checked_in_at
          ? { label: 'Undo check-in', onSelect: () => act('undo_check_in') }
          : { label: 'Check in', onSelect: () => act('check_in'), hint: 'They have arrived' },
      )
    }
  } else if (o.refund_status !== 'refunded' && r.cancel) {
    actions.push({ label: 'Put back', onSelect: () => act('restore'), hint: 'If its tickets still fit' })
  }
  actions.push({ label: o.notes ? 'Edit the note' : 'Add a note', onSelect: note })
  if (o.status === 'confirmed' && r.cancel) actions.push({ label: 'Cancel registration', onSelect: cancel, tone: 'danger' })
  return actions
}

const PAY_TONE: Record<OrderRow['payment_status'], 'neutral' | 'orange' | 'blue' | 'green'> = {
  not_needed: 'neutral',
  awaiting: 'orange',
  reported: 'blue',
  received: 'green',
  waived: 'green',
}

const stamp = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/**
 * The receipt, shown over the page. It used to open a new tab, but a tab
 * opened with `noopener` is not handed back to the page, so the page lost
 * it and loaded the receipt over itself instead (a blank tab, and the
 * event's page gone behind Back). A picture is shown here; a PDF gets a
 * plain link the browser opens itself. The link is signed for ten minutes.
 */
function ReceiptViewer({ order, onClose }: { order: OrderRow; onClose: () => void }) {
  const url = useQuery({ queryKey: [...REGISTRATIONS_KEY, 'proof', order.proof_path], queryFn: () => proofUrl(order.proof_path!), staleTime: 5 * 60_000 })
  const pdf = /\.pdf$/i.test(order.proof_path ?? '')
  return (
    <Overlay label={`Receipt from ${order.name}`} onDismiss={onClose}>
      <div className="w-full max-w-2xl rounded-[var(--radius-card)] bg-surface-lowest p-5 shadow-[var(--shadow-lifted)]">
        <h2 className="text-headline-md text-on-surface">Receipt from {order.name}</h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          {pounds(order.total_pence)}
          {order.proof_reference && ` · ref ${order.proof_reference}`}
          {order.proof_at && ` · sent ${stamp(order.proof_at)}`}
        </p>
        <div className="mt-4">
          {url.isLoading ? (
            <p className="text-body-sm text-on-surface-variant">Loading…</p>
          ) : url.error || !url.data ? (
            <p role="alert" className="text-body-sm text-error">Could not open the receipt.</p>
          ) : pdf ? (
            <a href={url.data} target="_blank" rel="noopener noreferrer" className="tap inline-flex items-center gap-2 rounded-full px-4 text-label-md font-medium text-accent-blue-soft hairline hover:bg-raised">
              Open the PDF <span aria-hidden="true">↗</span>
            </a>
          ) : (
            <img src={url.data} alt={`Receipt from ${order.name}`} className="max-h-[70vh] w-full rounded-[var(--radius-chip)] bg-surface-container object-contain" />
          )}
        </div>
        <div className="mt-5 flex justify-end">
          <ActionButton onClick={onClose}>Done</ActionButton>
        </div>
      </div>
    </Overlay>
  )
}

function OrderLine({ order, dateLabel, actions }: { order: OrderRow; dateLabel?: { starts_at: string; ends_at: string | null }; actions: MenuAction[] }) {
  const when = stamp(order.created_at)
  const receiver = receiverName(order)
  const [viewing, setViewing] = useState(false)
  return (
    <li aria-label={order.name} className={`rounded-[var(--radius-row)] bg-surface-lowest p-3.5 hairline ${order.status === 'cancelled' ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-body-md font-medium text-on-surface">
            {order.name}
            <span className="text-on-surface-variant">
              {' '}
              · {order.quantity} {order.quantity === 1 ? 'ticket' : 'tickets'}
            </span>
          </p>
          {(order.email || order.phone) && (
            <p className="break-words text-body-sm text-on-surface-variant">
              {order.email}
              {order.phone && `${order.email ? ' · ' : ''}${order.phone}`}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {order.status === 'cancelled' ? (
              <Pill tone="red">Cancelled</Pill>
            ) : order.total_pence > 0 ? (
              <Pill tone={PAY_TONE[order.payment_status]}>{PAYMENT_WORDS[order.payment_status]}</Pill>
            ) : (
              <Pill tone="neutral">{order.promo_code ? `Free with code ${order.promo_code}` : 'Free'}</Pill>
            )}
            {(order.total_pence > 0 || order.promo_code) && (
              <span className="font-mono text-label-sm tabular text-on-surface-variant">
                {order.total_pence > 0 ? pounds(order.total_pence) : ''}
                {order.promo_code && `${order.total_pence > 0 ? ' · ' : ''}${order.promo_code}`}
              </span>
            )}
            {order.source === 'walk_in' && <Pill tone="neutral">Walk-in</Pill>}
          </div>
          {(order.proof_path || order.proof_reference) && order.status === 'confirmed' && (
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-label-md text-on-surface-variant">
              {order.proof_path && (
                <button type="button" onClick={() => setViewing(true)} className="tap font-medium text-accent-blue-soft hover:underline">
                  Open the receipt
                </button>
              )}
              {order.proof_reference && <span>Ref {order.proof_reference}</span>}
              {order.proof_at && <span className="text-on-surface-faint">sent {stamp(order.proof_at)}</span>}
            </p>
          )}
          {order.refund_status && (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-label-md text-on-surface-faint">
              <Pill tone={order.refund_status === 'owed' ? 'orange' : 'green'}>{order.refund_status === 'owed' ? 'Refund owed' : 'Refunded'}</Pill>
              {order.refund_status === 'refunded' && order.refund_at && (
                <span>
                  {stamp(order.refund_at)}
                  {[order.refunder?.first_name, order.refunder?.last_name].filter(Boolean).length > 0 && ` by ${[order.refunder?.first_name, order.refunder?.last_name].filter(Boolean).join(' ')}`}
                </span>
              )}
            </p>
          )}
          {order.received_at && (order.payment_status === 'received' || order.payment_status === 'waived') && (
            <p className="mt-1 text-label-md text-on-surface-faint">
              {order.payment_status === 'waived' ? 'Waived' : 'Received'} {stamp(order.received_at)}
              {receiver && ` by ${receiver}`}
            </p>
          )}
          {dateLabel && <p className="mt-1 text-label-md text-on-surface-faint">{whenWords(dateLabel.starts_at, dateLabel.ends_at)}</p>}
          {order.tickets.some((t) => t.attendee_name) && (
            <p className="text-label-md text-on-surface-faint">For {order.tickets.map((t) => t.attendee_name).filter(Boolean).join(', ')}</p>
          )}
        </div>
        <ActionMenu label={order.name} actions={actions} className="shrink-0" />
        {viewing && <ReceiptViewer order={order} onClose={() => setViewing(false)} />}
      </div>
      {order.notes && <p className="mt-2 whitespace-pre-line rounded-[var(--radius-chip)] bg-surface-container px-3 py-2 text-body-sm text-on-surface-variant">{order.notes}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-label-sm text-on-surface-faint">
        <span>{when}</span>
        <span>{order.code}</span>
        <a href={ticketUrl(order.code)} target="_blank" rel="noopener noreferrer" className="tap text-accent-blue-soft hover:underline">
          Ticket
        </a>
        {order.checked_in_at && <span className="text-accent-green-soft">Checked in</span>}
        {order.email_sent_at && <span>Emailed</span>}
      </div>
    </li>
  )
}

/** Where to send a refund paid in cash: what the attendee sent, private to whoever runs registrations. */
function RefundDetailsSheet({ order, onClose }: { order: OrderRow; onClose: () => void }) {
  const details = useQuery({ queryKey: [...REGISTRATIONS_KEY, 'refund-details', order.id], queryFn: () => fetchRefundDetails(order.id) })
  const d = details.data
  return (
    <Overlay label={`Refund for ${order.name}`} onDismiss={onClose}>
      <div className="w-full max-w-md rounded-[var(--radius-card)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)]">
        <h2 className="text-headline-md text-on-surface">Refund for {order.name}</h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">{pounds(order.total_pence)}, paid at reception. The details are wiped when you mark it refunded.</p>
        <div className="mt-4">
          {details.isLoading ? (
            <p className="text-body-sm text-on-surface-variant">Loading…</p>
          ) : !d ? (
            <p className="text-body-sm text-on-surface-variant">They have not sent their bank details yet. Their ticket page asks for them{order.email ? `, and so did the email to ${order.email}` : ''}.</p>
          ) : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-md">
              <dt className="text-on-surface-variant">Name</dt>
              <dd className="text-on-surface">{d.account_name}</dd>
              {d.sort_code && (
                <>
                  <dt className="text-on-surface-variant">Sort code</dt>
                  <dd className="font-mono tabular text-on-surface">{sortCodeWords(d.sort_code)}</dd>
                </>
              )}
              {d.account_number && (
                <>
                  <dt className="text-on-surface-variant">Account</dt>
                  <dd className="font-mono tabular text-on-surface">{d.account_number}</dd>
                </>
              )}
              {d.iban && (
                <>
                  <dt className="text-on-surface-variant">IBAN</dt>
                  <dd className="break-all font-mono text-on-surface">{d.iban}</dd>
                </>
              )}
              {d.note && (
                <>
                  <dt className="text-on-surface-variant">Note</dt>
                  <dd className="whitespace-pre-line text-on-surface">{d.note}</dd>
                </>
              )}
              <dt className="text-on-surface-variant">Reference</dt>
              <dd className="font-mono text-on-surface">{order.code}</dd>
            </dl>
          )}
        </div>
        <div className="mt-5 flex justify-end">
          <ActionButton onClick={onClose}>Done</ActionButton>
        </div>
      </div>
    </Overlay>
  )
}
