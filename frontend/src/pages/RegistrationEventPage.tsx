import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ActionButton, Field, Overlay, PageHeader, Pill, SegmentedControl, StackedBar, Statistic, Tile, inputClasses } from '../components/Surface'
import { ActionMenu, type MenuAction } from '../components/ActionMenu'
import { TicketScanner } from '../components/TicketScanner'
import { QrCode } from '../components/QrCode'
import { QueryState } from '../components/QueryState'
import { useConfirmAction } from '../components/ConfirmAction'
import { useRegistrationRights, type RegistrationRights } from '../lib/registrationRights'
import { useErrorText } from '../lib/useErrorText'
import { showToast } from '../lib/toast'
import { UNDO_OFFER_MS, offerUndo, runUndo, useRecentUndo } from '../lib/registrationUndo'
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
  payAndCheckIn as takeAndAdmit,
  notifyPayment,
  orderMatches,
  proofUrl,
  receiverName,
  verifierName,
  verifyOrderPayment,
  canBeVerified,
  wantsVerifying,
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
 *
 * What wants doing is said up front: receipts to check, payments still
 * to come, refunds owed, each a tap to the orders it means; and an order
 * that needs a decision carries its next step as a button, the rest of
 * what can be done to it behind its ⋯ menu.
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
  const [cancelTyped, setCancelTyped] = useState('')
  const [refundFor, setRefundFor] = useState<OrderRow | null>(null)

  const full = useQuery({ queryKey: [...REGISTRATIONS_KEY, 'event', id], queryFn: () => fetchRegistrationEvent(id) })
  const orders = useQuery({ queryKey: [...REGISTRATIONS_KEY, 'orders', id], queryFn: () => fetchRegistrationOrders(id) })
  const refresh = () => queryClient.invalidateQueries({ queryKey: REGISTRATIONS_KEY })

  const setStatus = useMutation({
    mutationFn: (status: EventStatus) => setRegistrationStatus(full.data!.event, status),
    onSuccess: (_r, status) => {
      setError(null)
      // As it stood when the button was pressed: what Undo puts back.
      const event = full.data?.event
      const before = event?.status
      showToast(
        status === 'published' ? 'Published — share the link' : status === 'closed' ? 'Registration closed' : 'Saved',
        'success',
        before && before !== status ? UNDO_OFFER_MS : undefined,
        event && before && before !== status
          ? {
              label: 'Undo',
              run: () =>
                void setRegistrationStatus(event, before)
                  .then(() => showToast('Undone'))
                  .catch((err: unknown) => showToast(errorText(err, 'Could not undo that.'), 'error', 6000))
                  .finally(refresh),
            }
          : undefined,
      )
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
  // The money is in: "your ticket is confirmed", to whoever gave an address.
  // It waits for the offer of an undo to pass (0281): a payment marked
  // received by a slip, and taken back, never writes to them.
  const ticketConfirmed = (order: OrderRow) => (order.email ? () => void notifyPayment('paid', order.code) : undefined)
  // What this browser did to a registration lately: its menu offers to take it back.
  const lastDone = useRecentUndo()
  // What was done, with Undo on it; the page reads again either way.
  const done = (order: OrderRow, text: string, then?: () => void) =>
    void offerUndo({ text, orderId: order.id, then, refresh, words: errorText })
  // The Pastor (or the Owner) has seen the money in the bank or PayPal (0267).
  const verify = useMutation({
    mutationFn: ({ order, verified }: { order: OrderRow; verified: boolean }) => verifyOrderPayment(order.id, verified),
    onSuccess: (_r, { order, verified }) => {
      setError(null)
      done(order, verified ? 'Payment verified' : 'Verification taken back')
      return refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not change that registration.')),
  })
  const mark = useMutation({
    mutationFn: ({ order, action }: { order: OrderRow; action: OrderAction }) => markOrder(order.id, action),
    onSuccess: (_r, { order, action }) => {
      setError(null)
      done(order, ACTION_DONE[action], action === 'received' ? ticketConfirmed(order) : undefined)
      return refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not change that registration.')),
  })
  // Reception took the money and let them in: two marks, one tap, and one thing to undo.
  const payAndCheckIn = useMutation({
    mutationFn: (order: OrderRow) => takeAndAdmit(order.id),
    onSuccess: (_r, order) => {
      setError(null)
      done(order, 'Received, and checked in', ticketConfirmed(order))
      return refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not change that registration.')),
  })
  // A reported payment that is not in the account: back to awaiting, and an email says so.
  const askAgain = useMutation({
    mutationFn: (order: OrderRow) => markOrder(order.id, 'awaiting'),
    onSuccess: (_r, order) => {
      setError(null)
      // The email that says so waits for the undo, like the other one.
      done(
        order,
        order.email ? 'Back to awaiting payment — they will be emailed' : 'Back to awaiting payment',
        order.email ? () => void notifyPayment('unmatched', order.code) : undefined,
      )
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
    onSuccess: (_r, { order }) => {
      setError(null)
      setNoteFor(null)
      done(order, 'Note saved')
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
      <QueryState
        isLoading={false}
        error={full.error}
        isEmpty
        missing={{ title: 'Event not found', back: { to: '/registrations', label: 'Registrations' } }}
      >
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
  const countOf = (f: OrderFilter) => rows.filter((o) => orderMatches(o, f, '')).length
  const reported = confirmed.filter((o) => o.payment_status === 'reported').length
  const awaitingOnly = confirmed.filter((o) => o.payment_status === 'awaiting').length
  // Only whoever may verify is told what waits on them.
  const toVerify = rights.verify ? rows.filter(wantsVerifying).length : 0
  // A tap on what wants doing shows those orders, and goes to them.
  const showOrders = (f: OrderFilter) => {
    setFilter(f)
    setQuery('')
    document.getElementById('registered')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  }

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
    eventActions.push({
      label: 'Cancel event',
      tone: 'danger',
      onSelect: () => {
        setCancelTyped('')
        setCancelling(true)
      },
      hint: 'Called off: everyone is told, and every order is kept',
    })
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
        eyebrow={
          <Link to="/registrations" className="tap hover:underline">
            <span aria-hidden="true">← </span>Registrations
          </Link>
        }
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
          <Statistic value={<Money>{pounds(received)}</Money>} unit="received" />
        </Tile>
        <Tile tone={owed.length > 0 ? 'warning' : 'plain'}>
          {owed.length > 0 ? <Statistic value={<Money>{pounds(owedPence)}</Money>} unit="refunds owed" /> : <Statistic value={<Money>{pounds(expected - received)}</Money>} unit="still to come" />}
        </Tile>
      </div>

      {(reported > 0 || awaitingOnly > 0 || owed.length > 0 || toVerify > 0) && (
        <div aria-label="What wants doing" role="group" className="mt-3 flex flex-wrap items-center gap-2">
          {reported > 0 && (
            <ActionButton size="sm" tone="quiet" onClick={() => showOrders('to_check')}>
              <Pill tone="blue" dot className="-ml-1">
                {reported}
              </Pill>
              {reported === 1 ? 'receipt to check' : 'receipts to check'}
            </ActionButton>
          )}
          {toVerify > 0 && !cancelled && (
            <ActionButton size="sm" tone="quiet" onClick={() => showOrders('to_verify')}>
              <Pill tone="blue" dot className="-ml-1">
                {toVerify}
              </Pill>
              {toVerify === 1 ? 'payment to verify' : 'payments to verify'}
            </ActionButton>
          )}
          {awaitingOnly > 0 && !cancelled && (
            <ActionButton size="sm" tone="quiet" onClick={() => showOrders('to_pay')}>
              <Pill tone="orange" className="-ml-1">
                {awaitingOnly}
              </Pill>
              awaiting payment
            </ActionButton>
          )}
          {owed.length > 0 && (
            <ActionButton size="sm" tone="quiet" onClick={() => showOrders('refunds')}>
              <Pill tone="orange" dot className="-ml-1">
                {owed.length}
              </Pill>
              {owed.length === 1 ? 'refund owed' : 'refunds owed'}
            </ActionButton>
          )}
        </div>
      )}

      <ul aria-label="Ticket types" className="mt-4 flex flex-col gap-2">
        {ticketTypes.map((t) => {
          const sold = soldOf(t.id)
          const perDate = event.date_mode === 'choose' && t.quantity !== null
          return (
            <li key={t.id} className="rounded-[var(--radius-row)] bg-surface-lowest px-3.5 py-2.5 hairline">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 text-body-md text-on-surface">
                  {t.name}
                  <span className="text-on-surface-variant"> · {t.kind === 'free' ? 'Free' : t.kind === 'paid' ? pounds(t.price_pence) : 'Donation'}</span>
                </span>
                <span className="shrink-0 font-mono text-label-md tabular text-on-surface-variant">
                  {sold}
                  {t.quantity !== null && ` / ${t.quantity}`}
                  {perDate && ' per date'}
                </span>
              </div>
              {t.quantity !== null && !perDate && (
                <div className="mt-2">
                  <StackedBar
                    height={4}
                    segments={[
                      { key: 'sold', value: sold, className: sold >= t.quantity ? 'bg-accent-orange' : 'bg-accent-blue' },
                      { key: 'left', value: Math.max(0, t.quantity - sold), className: 'bg-transparent' },
                    ]}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <section id="registered" className="mt-8 scroll-mt-4">
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
            {/* Seven segments do not fit a phone; the row scrolls rather than squeezes. Each says how many it holds. */}
            <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
              <SegmentedControl
                label="Show"
                value={filter}
                onChange={setFilter}
                options={ORDER_FILTERS.map((f) => {
                  const n = countOf(f.key)
                  return {
                    value: f.key,
                    label: (
                      <>
                        {f.label}
                        {f.key !== 'all' && n > 0 && (
                          <>
                            {' '}
                            <span className="font-mono text-label-sm tabular opacity-70">{n}</span>
                          </>
                        )}
                      </>
                    ),
                  }
                })}
                scrolls
              />
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
                  busy={mark.isPending || verify.isPending}
                  actions={withUndo(
                    lastDone(o.id),
                    () => void runUndo({ orderId: o.id, refresh, words: errorText }),
                    orderActions(o, (action) => mark.mutate({ order: o, action }), () => openNote(o), () => cancelOrder(o), () => notReceived(o), cancelled, () => setRefundFor(o), rights, (verified) => verify.mutate({ order: o, verified })),
                  )}
                  next={nextSteps(o, (action) => mark.mutate({ order: o, action }), () => notReceived(o), () => setRefundFor(o), rights, cancelled ? undefined : () => verify.mutate({ order: o, verified: true }))}
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
              if (cancelTyped.trim() === event.title.trim()) cancelEvent.mutate()
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
            <NameToType title={event.title} label="Type the event’s name to cancel it" value={cancelTyped} onChange={setCancelTyped} />
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <ActionButton tone="ghost" onClick={() => setCancelling(false)}>
                Keep it on
              </ActionButton>
              <ActionButton type="submit" tone="danger" disabled={cancelTyped.trim() !== event.title.trim() || cancelEvent.isPending}>
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
            <NameToType title={event.title} label="Type the event’s name to delete it" value={deleteTyped} onChange={setDeleteTyped} />
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

/**
 * A step that cannot be undone asks for the event's name typed back. The
 * name is set apart and copies in one tap — the check is that they meant
 * this event, not that they can type.
 */
function NameToType({ title, label, value, onChange }: { title: string; label: string; value: string; onChange: (v: string) => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <>
      <div className="mt-4 flex items-center justify-between gap-3 rounded-[var(--radius-chip)] bg-surface-container px-3 py-2">
        <p className="min-w-0 break-words font-mono text-body-sm text-on-surface" aria-label="The event’s name">
          {title}
        </p>
        <ActionButton
          size="sm"
          tone="quiet"
          className="whitespace-nowrap"
          onClick={() => {
            void navigator.clipboard?.writeText(title)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? 'Copied' : 'Copy name'}
        </ActionButton>
      </div>
      <Field label={label} className="mt-3">
        <input value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" className={inputClasses} />
      </Field>
    </>
  )
}

/** A sum of money is wider than a count: a step smaller on a phone, so the tile holds it. */
function Money({ children }: { children: ReactNode }) {
  return <span className="text-headline-lg sm:text-numeral">{children}</span>
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

/**
 * The registration's menu, with the last thing this browser did to it at
 * the top for as long as the database will take it back (0281): the toast
 * that offered Undo is gone in seconds, and a slip is often noticed after.
 */
function withUndo(last: string | null, undo: () => void, actions: MenuAction[]): MenuAction[] {
  if (!last) return actions
  return [{ label: 'Undo', tone: 'accent', onSelect: undo, hint: `“${last}” — puts it back exactly as it was` }, ...actions]
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
  verify: (verified: boolean) => void,
): MenuAction[] {
  const actions: MenuAction[] = []
  // A refund owed comes first: it is what this order needs.
  if (o.refund_status === 'owed' && r.refund) {
    actions.push({ label: 'Where to send the refund', onSelect: refundDetails, hint: refundWhere(o) })
    actions.push({ label: 'Mark as refunded', tone: 'accent', onSelect: () => act('refunded'), hint: refundHow(o) })
  }
  if (eventCancelled) {
    actions.push({ label: o.notes ? 'Edit the note' : 'Add a note', onSelect: note })
    return actions
  }
  if (o.status === 'confirmed') {
    // Verifying (0267): the Pastor's and the Owner's, apart from the office's "received".
    if (r.verify && canBeVerified(o)) {
      actions.push(
        o.payment_verified_at
          ? { label: 'Take back the verification', onSelect: () => verify(false), hint: 'It was verified by mistake' }
          : { label: 'Verify payment', tone: 'accent', onSelect: () => verify(true), hint: 'You have seen it in the bank account or PayPal' },
      )
    }
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
          : // Not while it owes (0266): the database refuses it, so say why here.
            o.total_pence > 0 && (o.payment_status === 'awaiting' || o.payment_status === 'reported')
            ? { label: 'Check in', onSelect: () => undefined, disabled: true, hint: 'Not until it is paid: mark it received or waive it first' }
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

/** The one thing an order is waiting on, as buttons on its row; the ⋯ menu has the rest. */
function nextSteps(
  o: OrderRow,
  act: (action: OrderAction) => void,
  notReceived: () => void,
  refundDetails: () => void,
  r: RegistrationRights,
  verify?: () => void,
): NextStep[] {
  if (o.refund_status === 'owed' && r.refund) {
    return [
      { label: 'Mark as refunded', onClick: () => act('refunded'), tone: 'primary' },
      { label: 'Where to send it', onClick: refundDetails, tone: 'quiet' },
    ]
  }
  const steps: NextStep[] = []
  // Whoever can see the accounts goes first (0267): the office goes by their tag.
  if (verify && r.verify && wantsVerifying(o)) steps.push({ label: 'Verify payment', onClick: verify, tone: 'primary' })
  if (o.status === 'confirmed' && o.payment_status === 'reported' && r.takePayment) {
    steps.push({ label: 'Mark as received', onClick: () => act('received'), tone: steps.length > 0 ? 'quiet' : 'primary' })
    if (r.approve) steps.push({ label: 'Not received', onClick: notReceived, tone: 'quiet' })
  }
  return steps
}
type NextStep = { label: string; onClick: () => void; tone: 'primary' | 'quiet' }

const paidCash = (o: OrderRow) => !o.payment_method || o.payment_method === 'reception'
/** Where a refund goes, for the menu and the sheet. */
function refundWhere(o: OrderRow): string {
  if (o.refund_details) return 'They sent bank details to use'
  if (paidCash(o)) return 'Paid at reception: waiting for their bank details'
  return o.payment_method === 'paypal' ? 'Paid through PayPal: refund it there' : 'Paid by bank transfer: back to the account it came from'
}
function refundHow(o: OrderRow): string {
  if (o.refund_details) return 'Sent to the account they gave'
  if (paidCash(o)) return 'Sent to the account they gave'
  return o.payment_method === 'paypal' ? 'Refunded in PayPal' : 'Sent back to the account it came from'
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

function OrderLine({
  order,
  dateLabel,
  actions,
  next,
  busy,
}: {
  order: OrderRow
  dateLabel?: { starts_at: string; ends_at: string | null }
  actions: MenuAction[]
  next: NextStep[]
  busy: boolean
}) {
  const receiver = receiverName(order)
  const verifier = verifierName(order)
  const refunder = [order.refunder?.first_name, order.refunder?.last_name].filter(Boolean).join(' ')
  const [viewing, setViewing] = useState(false)
  const live = order.status === 'confirmed'
  const names = order.tickets.map((t) => t.attendee_name).filter(Boolean)
  return (
    <li aria-label={order.name} className={`rounded-[var(--radius-row)] bg-surface-lowest p-3.5 hairline sm:p-4 ${order.status === 'cancelled' ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {/* Who, how many, and what it comes to — the three things a glance wants. */}
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 text-body-md font-medium text-on-surface">
              {order.name}
              <span className="font-normal text-on-surface-variant">
                {' '}
                · {order.quantity} {order.quantity === 1 ? 'ticket' : 'tickets'}
              </span>
            </p>
            <p className="shrink-0 font-mono text-body-sm tabular text-on-surface">
              {order.total_pence > 0 ? pounds(order.total_pence) : 'Free'}
              {order.promo_code && <span className="text-on-surface-faint"> · {order.promo_code}</span>}
            </p>
          </div>
          {(order.email || order.phone) && (
            <p className="break-words text-body-sm text-on-surface-variant">
              {order.email}
              {order.phone && `${order.email ? ' · ' : ''}${order.phone}`}
            </p>
          )}

          {/* Where it stands. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            {order.status === 'cancelled' ? (
              <Pill tone="red">Cancelled</Pill>
            ) : order.total_pence > 0 ? (
              <Pill tone={PAY_TONE[order.payment_status]}>{PAYMENT_WORDS[order.payment_status]}</Pill>
            ) : (
              <Pill tone="neutral">{order.promo_code ? `Free with code ${order.promo_code}` : 'Free'}</Pill>
            )}
            {live && order.payment_verified_at && order.total_pence > 0 && (
              <Pill tone="green" dot>
                Verified payment
              </Pill>
            )}
            {order.refund_status && <Pill tone={order.refund_status === 'owed' ? 'orange' : 'green'}>{order.refund_status === 'owed' ? 'Refund owed' : 'Refunded'}</Pill>}
            {live && order.checked_in_at && <Pill tone="green">Checked in {new Date(order.checked_in_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Pill>}
            {order.source === 'walk_in' && <Pill tone="neutral">Walk-in</Pill>}
          </div>

          {/* How it got there: the receipt, who took the money, the refund. */}
          {(order.proof_path || order.proof_reference) && live && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-label-md text-on-surface-variant">
              {order.proof_path && (
                <button type="button" onClick={() => setViewing(true)} className="tap font-medium text-accent-blue-soft hover:underline">
                  Open the receipt
                </button>
              )}
              {order.proof_reference && <span>Ref {order.proof_reference}</span>}
              {order.proof_at && <span className="text-on-surface-faint">sent {stamp(order.proof_at)}</span>}
            </p>
          )}
          {order.received_at && (order.payment_status === 'received' || order.payment_status === 'waived') && (
            <p className="mt-1 text-label-md text-on-surface-faint">
              {order.payment_status === 'waived' ? 'Waived' : 'Received'} {stamp(order.received_at)}
              {receiver && ` by ${receiver}`}
              {order.payment_method && ` · ${METHOD_WORDS[order.payment_method]}`}
            </p>
          )}
          {live && order.payment_verified_at && (
            <p className="mt-1 text-label-md text-on-surface-faint">
              Verified {stamp(order.payment_verified_at)}
              {verifier && ` by ${verifier}`}
            </p>
          )}
          {order.refund_status === 'owed' && (
            <p className="mt-1 text-label-md text-on-surface-faint">
              {order.refund_details ? `Bank details sent ${stamp(order.refund_details.created_at)}` : refundWhere(order)}
            </p>
          )}
          {order.refund_status === 'refunded' && order.refund_at && (
            <p className="mt-1 text-label-md text-on-surface-faint">
              Refunded {stamp(order.refund_at)}
              {refunder && ` by ${refunder}`}
            </p>
          )}
          {dateLabel && <p className="mt-1 text-label-md text-on-surface-faint">{whenWords(dateLabel.starts_at, dateLabel.ends_at)}</p>}
          {names.length > 0 && <p className="text-label-md text-on-surface-faint">For {names.join(', ')}</p>}
        </div>
        <ActionMenu label={order.name} actions={actions} className="shrink-0" />
        {viewing && <ReceiptViewer order={order} onClose={() => setViewing(false)} />}
      </div>
      {order.notes && <p className="mt-2 whitespace-pre-line rounded-[var(--radius-chip)] bg-surface-container px-3 py-2 text-body-sm text-on-surface-variant">{order.notes}</p>}
      {next.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {next.map((n) => (
            <ActionButton key={n.label} size="sm" tone={n.tone} onClick={n.onClick} disabled={busy}>
              {n.label}
            </ActionButton>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-label-sm text-on-surface-faint">
        <span>{stamp(order.created_at)}</span>
        <span>{order.code}</span>
        <a href={ticketUrl(order.code)} target="_blank" rel="noopener noreferrer" className="tap text-accent-blue-soft hover:underline">
          Ticket <span aria-hidden="true">↗</span>
        </a>
        {order.email_sent_at && <span>Emailed</span>}
      </div>
    </li>
  )
}

const METHOD_WORDS: Record<NonNullable<OrderRow['payment_method']>, string> = { paypal: 'PayPal', bank: 'bank transfer', reception: 'at reception' }

/** Where to send a refund: what the attendee sent, if anything, and otherwise the way it came. Private to the Refunds right. */
function RefundDetailsSheet({ order, onClose }: { order: OrderRow; onClose: () => void }) {
  const details = useQuery({ queryKey: [...REGISTRATIONS_KEY, 'refund-details', order.id], queryFn: () => fetchRefundDetails(order.id) })
  const d = details.data
  const cash = paidCash(order)
  const came = order.payment_method === 'paypal' ? 'through PayPal' : 'by bank transfer'
  return (
    <Overlay label={`Refund for ${order.name}`} onDismiss={onClose}>
      <div className="w-full max-w-md rounded-[var(--radius-card)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)]">
        <h2 className="text-headline-md text-on-surface">Refund for {order.name}</h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          {pounds(order.total_pence)}, paid {cash ? 'at reception' : came}. Any details they send are wiped when you mark it refunded.
        </p>
        <div className="mt-4">
          {details.isLoading ? (
            <p className="text-body-sm text-on-surface-variant">Loading…</p>
          ) : !d ? (
            <p className="text-body-sm text-on-surface-variant">
              {cash
                ? `They have not sent their bank details yet. Their ticket page asks for them${order.email ? `, and so did the email to ${order.email}` : ''}.`
                : `Send it back ${came}, to where it came from. They have not asked for another account; their ticket page lets them, if it has not come back after 5–7 working days.`}
            </p>
          ) : (
            <>
              {!cash && <p className="mb-3 text-body-sm text-on-surface-variant">They asked for it to go to this account rather than back {came}.</p>}
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
                <dt className="text-on-surface-variant">Sent</dt>
                <dd className="text-on-surface">{stamp(d.created_at)}</dd>
              </dl>
            </>
          )}
        </div>
        <div className="mt-5 flex justify-end">
          <ActionButton onClick={onClose}>Done</ActionButton>
        </div>
      </div>
    </Overlay>
  )
}
