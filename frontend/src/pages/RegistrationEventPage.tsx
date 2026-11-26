import { useState } from 'react'
import { ClearingNotice } from '../components/RegistrationClearing'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ActionButton, ActionLink, Field, FitFigure, Overlay, PageHeader, Pill, SegmentedControl, StackedBar, Statistic, Tile, inputClasses } from '../components/Surface'
import { ActionMenu, type MenuAction } from '../components/ActionMenu'
import { TicketScanner } from '../components/TicketScanner'
import { QrCode } from '../components/QrCode'
import { QueryState } from '../components/QueryState'
import { RegistrationMessages } from '../components/RegistrationMessages'
import { RegistrationInvites } from '../components/RegistrationInvites'
import { RegistrationBreakdown } from '../components/RegistrationBreakdown'
import { OrderFilterBar } from '../components/OrderFilterBar'
import { OrderTable } from '../components/OrderTable'
import { DEFAULT_SORT, nextSort, sortOrders, type OrderSort } from '../lib/orderSort'
import { readRegistrationView, writeRegistrationView, type RegistrationView } from '../lib/registrationView'
import { NO_FILTERS, orderMatches, paymentWordsOf, type OrderFilters } from '../lib/orderFilters'
import { onlineLinkName, wayOf, wayWords } from '../lib/registrationBreakdown'
import { GIVING_KEY, fetchGiving } from '../lib/giving'
import { ApplyPromoDialog } from '../components/ApplyPromoDialog'
import { applyPromoToOrder, removePromoFromOrder, sendTicketAfterPromo, usablePromos } from '../lib/promoLater'
import { fetchInvites, inviteNames, invitesKey } from '../lib/registrationInvites'
import { useConfirmAction } from '../components/ConfirmAction'
import { OrderEmailDialog } from '../components/OrderEmailDialog'
import { deliveryOf, emailWantsDoing } from '../lib/emailDelivery'
import { useRegistrationRights, type RegistrationRights } from '../lib/registrationRights'
import { checkInCounts, checkInDayName, checkInsOf, everCheckedIn } from '../lib/checkInDays'
import { ACTION_DONE, orderActions, paidCash, refundWhere, withUndo } from '../lib/orderActions'
import { useErrorText } from '../lib/useErrorText'
import { showToast } from '../lib/toast'
import { UNDO_OFFER_MS, offerUndo, runUndo, useRecentUndo } from '../lib/registrationUndo'
import { pounds } from '../lib/money'
import { registerUrl, ticketUrl } from '../lib/registrationLinks'
import { downloadBlob, qrPngBlob } from '../lib/qrPng'
import { writeWorkbook } from '../lib/writeWorkbook'
import { buildFullRegistrationWorkbook, fetchRegistrationExportExtras } from '../lib/registrationExport'
import {
  PAYMENT_TONE,
  duplicateEmails,
  orderMoney,
  sharesAnEmail,
  type PromoCode,
  REGISTRATIONS_KEY,
  STATUS_TONE,
  STATUS_WORDS,
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
  proofUrl,
  receiverName,
  verifierName,
  verifyOrderPayment,
  saidPaidUnconfirmed,
  wantsVerifying,
  isPaid,
  checkedInWords,
  registrationExportFileName,
  sendTicketAgain,
  setOrderEmail,
  setOrderNotes,
  setRegistrationStatus,
  whenWords,
  type EventStatus,
  type OrderAction,
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
 *
 * Each registration says what became of its email (0283): delivered, on
 * its way, or bounced — with the mail server's reason — and whoever may
 * correct addresses (reg.email) puts the right one in from the row, which
 * sends the email again. Undelivered ones are counted in "What wants
 * doing" and have a filter of their own.
 */
export function RegistrationEventPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const { ask, dialog } = useConfirmAction()
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [filters, setFilters] = useState<OrderFilters>(NO_FILTERS)
  // Cards or a table (lib/registrationView): where there is room for a table it starts as one, and the choice is kept on this device.
  const [view, setView] = useState<RegistrationView>(readRegistrationView)
  const [sort, setSort] = useState<OrderSort>(DEFAULT_SORT)
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
  const [emailFor, setEmailFor] = useState<OrderRow | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  // A promo code being put on somebody's registration for them (0298).
  const [promoFor, setPromoFor] = useState<OrderRow | null>(null)
  const [promoError, setPromoError] = useState<string | null>(null)

  const full = useQuery({ queryKey: [...REGISTRATIONS_KEY, 'event', id], queryFn: () => fetchRegistrationEvent(id) })
  const orders = useQuery({ queryKey: [...REGISTRATIONS_KEY, 'orders', id], queryFn: () => fetchRegistrationOrders(id) })
  // Only for what the church's own online link is called, when the event pays through the church's giving details.
  const giving = useQuery({ queryKey: GIVING_KEY, queryFn: fetchGiving, enabled: full.data?.event.payment_use_church_giving === true })
  // The event's invitation links (0295), for the name of the one each order came by. The list itself is RegistrationInvites'.
  const invites = useQuery({ queryKey: invitesKey(id), queryFn: () => fetchInvites(id), enabled: rights.office })
  const invitedBy = inviteNames(invites.data ?? [])
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
  // Their registration as it now stands, by email, after a code went on or came off
  // (lib/promoLater). If it did not go — refused, or held because they were written to
  // a moment ago — whoever pressed is told: the press said they would be.
  const mailAfterPromo = (order: OrderRow) => {
    const slug = full.data?.event.slug
    if (!order.email || !slug) return undefined
    return () =>
      void sendTicketAfterPromo(order, slug).then((mail) => {
        if (!mail.ok || mail.sent === false) showToast(`${order.name} was not emailed about this. Tell them, or send their email again in a few minutes.`, 'error', 8000)
      })
  }
  // A code put on a registration made without it (0298): the price comes down, or it becomes a ticket.
  const applyPromo = useMutation({
    mutationFn: ({ order, code }: { order: OrderRow; code: PromoCode }) => applyPromoToOrder(order.id, code.code),
    onSuccess: (_r, { order, code }) => {
      setPromoFor(null)
      setPromoError(null)
      // Their ticket as it now stands, by email, once the press can no longer
      // be taken back — by whichever way whoever pressed is allowed (lib/promoLater).
      done(order, `Promo code ${code.code} applied`, mailAfterPromo(order))
      return refresh()
    },
    onError: (err: unknown) => {
      setPromoError(errorText(err, 'The code could not be put on that registration.'))
      // Refused because it had changed under them: show it as it now is.
      void refresh()
    },
  })
  // A code taken off a registration again (0299): the full price, awaiting payment.
  const takePromoOff = useMutation({
    mutationFn: (order: OrderRow) => removePromoFromOrder(order.id),
    onSuccess: (_r, order) => {
      setError(null)
      // "Payment needed", by email, once the press can no longer be taken back — unless
      // the code had taken nothing off, when nothing has changed for them to be told.
      done(order, order.promo_code ? `Promo code ${order.promo_code} removed` : 'Promo code removed', order.discount_pence > 0 ? mailAfterPromo(order) : undefined)
      return refresh()
    },
    onError: (err: unknown) => {
      setError(errorText(err, 'The code could not be taken off that registration.'))
      // Refused because it had changed under them: show it as it now is.
      void refresh()
    },
  })
  // Reception took the money and let them in: two marks, one tap, and one thing to undo.
  const payAndCheckIn = useMutation({
    mutationFn: (order: OrderRow) => takeAndAdmit(order.id),
    onSuccess: (_r, order) => {
      setError(null)
      done(order, 'Marked as paid, and checked in', ticketConfirmed(order))
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
        order.email ? 'Back to not paid — they will be emailed' : 'Back to not paid',
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
  // Their email, once more (0283): after an address is put right, or because the first never arrived.
  const emailAgain = (order: OrderRow) =>
    void sendTicketAgain(order.code).then((result) => {
      if (!result.ok) showToast(`The email to ${order.name} could not be sent. Try “Send it again” from their menu.`, 'error', 6000)
      return refresh()
    })
  const changeEmail = useMutation({
    mutationFn: ({ order, email }: { order: OrderRow; email: string }) => setOrderEmail(order.id, email),
    onSuccess: (changed, { order, email }) => {
      setError(null)
      setEmailFor(null)
      const live = order.status === 'confirmed'
      if (changed) {
        // The email waits for the offer of an undo: an address typed with a slip never gets somebody's ticket.
        done(order, live ? `Email address changed — their email goes to ${email}` : 'Email address changed', live ? () => emailAgain(order) : undefined)
      } else if (live) {
        showToast(`Sending their email again to ${email}`)
        emailAgain(order)
      }
      return refresh()
    },
    onError: (err: unknown) => setEmailError(errorText(err, 'Could not change the address.')),
  })
  const openEmail = (order: OrderRow) => {
    setEmailError(null)
    setEmailFor(order)
  }
  // Everything about the event (lib/registrationExport): what the page does not hold is read
  // when Export is pressed, and anything that could not be read is named, here and in the file.
  const exportAll = useMutation({
    mutationFn: async () => {
      const extras = await fetchRegistrationExportExtras(id, rights.office)
      await writeWorkbook(buildFullRegistrationWorkbook(full.data!, orders.data ?? [], invitedBy, extras), registrationExportFileName(full.data!.event.slug))
      return extras.leftOut ?? []
    },
    onSuccess: (leftOut) => {
      setError(null)
      if (leftOut.length > 0) showToast(`Exported, without ${leftOut.join(', ')}: that could not be read just now`, 'error', 8000)
      else showToast('Exported')
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
  // Money that came in, money the church let go, and money still to come: three sums, never added together.
  const money = orderMoney(rows)
  // Addresses more than one live registration is under: usually one person who registered twice.
  const dupes = duplicateEmails(rows)
  const sharing = rows.filter((o) => sharesAnEmail(o, dupes)).length
  // The event's codes that could go on a registration made without one (0298).
  const codes = usablePromos(full.data.promoCodes)
  // Anybody who came on any day: `checked_in_at` alone is only the latest, and is empty again once today's is undone.
  const checkedIn = confirmed.filter(everCheckedIn).length
  // Who came on which day (0314), for an event checked in on more than one.
  const dayCounts = checkInCounts(confirmed)
  const soldOf = (typeId: string) => confirmed.reduce((n, o) => n + o.tickets.filter((t) => t.ticket_type_id === typeId).length, 0)
  const canPublish = dates.length > 0 && ticketTypes.length > 0
  const shown = rows.filter((o) => orderMatches(o, filters, query, dupes))
  // The online link by its own name ("Paypal"), where the event's links share one; "Online link" otherwise.
  const onlineName = onlineLinkName([...event.payment_links, ...(event.payment_use_church_giving ? (giving.data?.links ?? []) : [])].map((l) => l.label))
  const reported = confirmed.filter((o) => o.payment_status === 'reported').length
  const awaitingOnly = confirmed.filter((o) => o.payment_status === 'awaiting').length
  // Cancelled after "I have paid" (0336): no refund is owed until somebody finds the money, so the page says they are there.
  const toFind = rows.filter((o) => o.status === 'cancelled' && saidPaidUnconfirmed(o)).length
  // Only whoever may verify is told what waits on them.
  const toVerify = rights.verify ? rows.filter(wantsVerifying).length : 0
  // Emails that did not arrive (0283): everybody on the page sees which; whoever may correct them is told to.
  const undelivered = rows.filter(emailWantsDoing).length
  // What a registration can do, made once: its menu, its next steps and its card — the cards draw them, and so does the table.
  const working = mark.isPending || verify.isPending || takePromoOff.isPending
  const actionsOf = (o: OrderRow) =>
    withUndo(
      lastDone(o.id),
      () => void runUndo({ orderId: o.id, refresh, words: errorText }),
      orderActions(o, (action) => mark.mutate({ order: o, action }), () => openNote(o), () => cancelOrder(o), () => notReceived(o), cancelled, () => setRefundFor(o), rights, (verified) => verify.mutate({ order: o, verified }), () => openEmail(o), codes.length > 0 ? () => openPromo(o) : undefined, () => removePromo(o)),
    )
  const stepsOf = (o: OrderRow) =>
    nextSteps(o, (action) => mark.mutate({ order: o, action }), () => notReceived(o), () => setRefundFor(o), rights, cancelled ? undefined : () => verify.mutate({ order: o, verified: true }), () => openEmail(o), cancelled)
  const cardOf = (o: OrderRow) => (
    <OrderLine
      key={o.id}
      order={o}
      invitedBy={o.invite_id ? (invitedBy[o.invite_id] ?? 'an invite link') : null}
      sharesEmail={sharesAnEmail(o, dupes)}
      dateLabel={dates.find((d) => d.id === o.date_id)}
      onlineName={onlineName}
      busy={working}
      actions={actionsOf(o)}
      next={stepsOf(o)}
    />
  )
  // A tap on what wants doing shows those orders, and goes to them.
  const showOrders = (f: Partial<OrderFilters>) => {
    setFilters({ ...NO_FILTERS, ...f })
    setQuery('')
    document.getElementById('registered')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  }

  const openNote = (order: OrderRow) => {
    setNoteText(order.notes ?? '')
    setNoteFor(order)
  }
  const openPromo = (order: OrderRow) => {
    setPromoError(null)
    setPromoFor(order)
  }
  const removePromo = (order: OrderRow) =>
    ask({
      title: `Remove the promo code from ${order.name}’s registration?`,
      body:
        order.discount_pence > 0
          ? `${order.promo_code ?? 'The code'} comes off and has its use back. The registration goes back to ${pounds(order.subtotal_pence)}, not paid yet${
              order.email ? `, and an email to ${order.email} asks for it.` : '. They gave no email address, so nobody is told.'
            }`
          : // Registered with a code that came to nothing (free tickets only): it still spent a use.
            `${order.promo_code ?? 'The code'} comes off and has its use back. It took nothing off this registration, so the price stays as it is and nobody is told.`,
      confirmLabel: 'Remove it',
      cancelLabel: 'Keep it',
      onConfirm: () => takePromoOff.mutate(order),
    })
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
        ? `Their registration goes back to not paid, and an email to ${order.email} says the payment could not be matched and asks them to check, or pay at reception.`
        : 'Their registration goes back to not paid. They gave no email address, so nobody is told.',
      confirmLabel: 'Ask again',
      cancelLabel: 'Keep it',
      onConfirm: () => askAgain.mutate(order),
    })

  const cancelled = !!event.cancelled_at
  // Money in and not yet sent back: the event cannot be deleted while any is.
  const unrefunded = rows.filter((o) => o.total_pence > 0 && (o.payment_status === 'received' || o.payment_status === 'reported') && o.refund_status !== 'refunded')
  const owed = rows.filter((o) => o.refund_status === 'owed')
  const owedPence = owed.reduce((n, o) => n + o.total_pence, 0)
  // The two sums in the tiles are one size: the longer of them decides it.
  const sumChars = Math.max(pounds(money.received).length, pounds(owed.length > 0 ? owedPence : money.toCome).length)
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
        back={
          <Link to="/registrations" className="tap hover:underline">
            <span aria-hidden="true">← </span>Registrations
          </Link>
        }
        status={cancelled ? <Pill tone="red">Cancelled</Pill> : <Pill tone={STATUS_TONE[event.status]}>{STATUS_WORDS[event.status]}</Pill>}
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
      {/* Finished: a countdown to the night people's details are taken off its registrations. */}
      <ClearingNotice
        lastEndsAt={dates.reduce<string | null>((last, d) => ((d.ends_at ?? d.starts_at) > (last ?? '') ? (d.ends_at ?? d.starts_at) : last), null)}
        anonymised={rows.some((o) => !!o.anonymised_at)}
      />
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
        {/* The link and its code side by side. What can be done with the link is under the link where there is room
            beside the code, and under both on a phone — beside the code, a phone had room for one button a line. */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-3">
          <div className="min-w-0">
            <p className="font-mono text-label-sm text-on-surface-faint">{event.status === 'published' ? 'Share this link' : 'The link, once published'}</p>
            {/* The link in a field of its own, so it reads as the thing to take; what can be done with it as buttons beneath, not as three more blue lines. */}
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block w-fit max-w-full break-all rounded-[var(--radius-chip)] bg-raised px-3 py-2 font-mono text-body-sm text-accent-blue-soft hairline hover:bg-raised-strong"
            >
              {link}
            </a>
          </div>
          <div className="rounded-[var(--radius-chip)] bg-white p-1.5 sm:row-span-2">
            <QrCode text={link} label={`QR code for ${link}`} className="h-20 w-20" />
          </div>
          <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1">
            <ActionButton
              size="sm"
              tone="quiet"
              onClick={() => {
                void navigator.clipboard?.writeText(link)
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1500)
              }}
            >
              {copied ? 'Copied' : 'Copy link'}
            </ActionButton>
            <ActionButton size="sm" tone="quiet" onClick={() => downloadQr.mutate()} disabled={downloadQr.isPending}>
              Download QR code
            </ActionButton>
            {event.status !== 'draft' && !cancelled && rights.door && (
              <ActionLink as={Link} to={`/door?event=${event.id}`} size="sm" tone="quiet">
                Open Reception
              </ActionLink>
            )}
          </div>
        </div>
        {event.status === 'draft' && <p className="mt-2.5 text-label-md text-on-surface-faint">Only you can open it while it is a draft — a preview.</p>}
        {event.status !== 'draft' && <p className="mt-2.5 text-label-md text-on-surface-faint">The QR code says this link: on a poster or a slide, whoever scans it lands on the registration page.</p>}
      </Tile>

      {/* Two by two until there is room for four in a row: four across a tablet left each tile narrower than its figure.
          Each the same way up — the figure, and what it is under it — and each figure sized to its own tile (FitFigure). */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile className="@container min-w-0">
          <Statistic className="flex-col" value={<FitFigure>{confirmed.length}</FitFigure>} unit={confirmed.length === 1 ? 'order' : 'orders'} />
        </Tile>
        <Tile className="@container min-w-0">
          <Statistic className="flex-col" value={<FitFigure>{tickets}</FitFigure>} unit="tickets" />
        </Tile>
        <Tile className="@container min-w-0">
          <Statistic className="flex-col" value={<FitFigure chars={sumChars}>{pounds(money.received)}</FitFigure>} unit="received" />
          {/* What was let go is said, and never counted as money in. */}
          {money.waived > 0 && <p className="mt-1 font-mono text-label-sm text-on-surface-faint">plus {pounds(money.waived)} waived</p>}
        </Tile>
        <Tile tone={owed.length > 0 ? 'warning' : 'plain'} className="@container min-w-0">
          <Statistic className="flex-col" value={<FitFigure chars={sumChars}>{pounds(owed.length > 0 ? owedPence : money.toCome)}</FitFigure>} unit={owed.length > 0 ? 'refunds owed' : 'still to come'} />
        </Tile>
      </div>

      {(reported > 0 || toFind > 0 || awaitingOnly > 0 || owed.length > 0 || toVerify > 0 || undelivered > 0 || (sharing > 0 && !cancelled)) && (
        <div aria-label="What wants doing" role="group" className="mt-3 flex flex-wrap items-center gap-2">
          {reported > 0 && (
            <ActionButton size="sm" tone="quiet" onClick={() => showOrders({ payment: 'reported' })}>
              <Pill tone="blue" dot className="-ml-1">
                {reported}
              </Pill>
              {reported === 1 ? 'receipt to check' : 'receipts to check'}
            </ActionButton>
          )}
          {toFind > 0 && (
            <ActionButton size="sm" tone="quiet" onClick={() => showOrders({ only: 'to_find' })}>
              <Pill tone="orange" dot className="-ml-1">
                {toFind}
              </Pill>
              {toFind === 1 ? 'payment to look for' : 'payments to look for'}
            </ActionButton>
          )}
          {toVerify > 0 && !cancelled && (
            <ActionButton size="sm" tone="quiet" onClick={() => showOrders({ only: 'to_verify' })}>
              <Pill tone="blue" dot className="-ml-1">
                {toVerify}
              </Pill>
              {toVerify === 1 ? 'payment to verify' : 'payments to verify'}
            </ActionButton>
          )}
          {awaitingOnly > 0 && !cancelled && (
            <ActionButton size="sm" tone="quiet" onClick={() => showOrders({ payment: 'awaiting' })}>
              <Pill tone="orange" className="-ml-1">
                {awaitingOnly}
              </Pill>
              not paid yet
            </ActionButton>
          )}
          {owed.length > 0 && (
            <ActionButton size="sm" tone="quiet" onClick={() => showOrders({ only: 'refunds' })}>
              <Pill tone="orange" dot className="-ml-1">
                {owed.length}
              </Pill>
              {owed.length === 1 ? 'refund owed' : 'refunds owed'}
            </ActionButton>
          )}
          {undelivered > 0 && (
            <ActionButton size="sm" tone="quiet" onClick={() => showOrders({ only: 'email' })}>
              <Pill tone="red" dot className="-ml-1">
                {undelivered}
              </Pill>
              {undelivered === 1 ? 'email not delivered' : 'emails not delivered'}
            </ActionButton>
          )}
          {/* One person registered twice, most often: once without the code and once with it. */}
          {sharing > 0 && !cancelled && (
            <ActionButton size="sm" tone="quiet" onClick={() => showOrders({ only: 'duplicates' })}>
              <Pill tone="orange" className="-ml-1">
                {sharing}
              </Pill>
              registrations share an email
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

      {/* The same tickets by how each is paid for: by code, by bank, by the online link, at reception, not yet chosen. */}
      <RegistrationBreakdown orders={rows} onlineName={onlineName} />

      {/* What people have written to the organisers (0287). Nothing is drawn while there are none. */}
      {rights.office && <RegistrationMessages eventId={id} eventTitle={event.title} codeOf={(orderId) => rows.find((o) => o.id === orderId)?.code ?? null} />}

      {/* Links that take their discount off by themselves (0295). Drawn for whoever may make one, or once there are some. */}
      {rights.office && (
        <RegistrationInvites
          eventId={id}
          slug={event.slug}
          eventTitle={event.title}
          published={event.status === 'published'}
          ticketTypes={ticketTypes}
          orders={rows}
          ordersReady={orders.isSuccess}
          canEdit={rights.edit && !cancelled}
        />
      )}

      <section id="registered" className="mt-8 scroll-mt-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 className="flex flex-wrap items-center gap-2 text-headline-md text-on-surface">
            Who has registered
            {dayCounts.length > 1
              ? dayCounts.map((c) => (
                  <Pill key={c.day} tone="blue">
                    {checkInDayName(c.day, dates)}: {c.registrations} checked in
                  </Pill>
                ))
              : checkedIn > 0 && <Pill tone="blue">{checkedIn} checked in</Pill>}
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
          // Find by typing, narrow by two dropdowns (lib/orderFilters), and beside them how many are shown and the way back to everybody.
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search registrations"
              placeholder="Name, email, phone or code"
              autoCapitalize="off"
              className={`${inputClasses} sm:w-72`}
            />
            <OrderFilterBar
              orders={rows}
              duplicates={dupes}
              filters={filters}
              onChange={setFilters}
              onlineName={onlineName}
              shown={shown.length}
              searching={query.trim() !== ''}
              onClear={() => {
                setFilters(NO_FILTERS)
                setQuery('')
              }}
            />
            {/* Cards say everything about one; the table says a line about each and can be put in order. */}
            <SegmentedControl<RegistrationView>
              label="Show as"
              value={view}
              onChange={(next) => {
                setView(next)
                writeRegistrationView(next)
              }}
              options={[
                { value: 'cards', label: 'Cards' },
                { value: 'table', label: 'Table' },
              ]}
              className="w-fit sm:ml-auto"
            />
          </div>
        )}
        <QueryState isLoading={orders.isLoading} error={orders.error} isEmpty={rows.length === 0} emptyMessage="Nobody yet.">
          {shown.length === 0 ? (
            <p className="mt-3 text-body-sm text-on-surface-variant">Nobody matches.</p>
          ) : view === 'table' ? (
            <OrderTable
              orders={sortOrders(shown, sort)}
              sort={sort}
              onSort={(key) => setSort((was) => nextSort(was, key))}
              onlineName={onlineName}
              actionsFor={actionsOf}
              stepsFor={stepsOf}
              cardFor={cardOf}
              busy={working}
            />
          ) : (
            <ul aria-label="Orders" className="mt-3 flex flex-col gap-2">
              {shown.map(cardOf)}
            </ul>
          )}
        </QueryState>
      </section>

      {scanning && (
        <TicketScanner
          orders={rows}
          dates={dates}
          busy={mark.isPending || payAndCheckIn.isPending}
          onCheckIn={(order) => mark.mutate({ order, action: 'check_in' })}
          onPaidAndCheckIn={(order) => payAndCheckIn.mutate(order)}
          onUndoCheckIn={(order) => mark.mutate({ order, action: 'undo_check_in' })}
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
      {emailFor && (
        <OrderEmailDialog
          order={emailFor}
          busy={changeEmail.isPending}
          error={emailError}
          onSave={(email) => changeEmail.mutate({ order: emailFor, email })}
          onClose={() => setEmailFor(null)}
        />
      )}
      {promoFor && (
        <ApplyPromoDialog
          order={promoFor}
          ticketTypes={ticketTypes}
          codes={codes}
          busy={applyPromo.isPending}
          error={promoError}
          onApply={(code) => applyPromo.mutate({ order: promoFor, code })}
          onClose={() => setPromoFor(null)}
        />
      )}
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

/** The one thing an order is waiting on, as buttons on its row; the ⋯ menu has the rest. */
function nextSteps(
  o: OrderRow,
  act: (action: OrderAction) => void,
  notReceived: () => void,
  refundDetails: () => void,
  r: RegistrationRights,
  verify?: () => void,
  email?: () => void,
  eventCancelled = false,
): NextStep[] {
  if (o.refund_status === 'owed' && r.refund) {
    return [
      { label: 'Mark as refunded', onClick: () => act('refunded'), tone: 'primary' },
      { label: 'Where to send it', onClick: refundDetails, tone: 'quiet' },
    ]
  }
  const steps: NextStep[] = []
  // Cancelled after "I have paid" (0336): their refund waits on somebody finding the money. Saying it arrived is what owes it.
  if (o.status === 'cancelled' && saidPaidUnconfirmed(o) && r.takePayment) {
    return [{ label: 'The payment did arrive', onClick: () => act('received'), tone: 'accent-quiet' }]
  }
  // Whoever can see the accounts goes first (0267): the office goes by their tag.
  if (verify && r.verify && wantsVerifying(o)) steps.push({ label: 'Verify payment', onClick: verify, tone: 'primary' })
  if (o.status === 'confirmed' && o.payment_status === 'reported' && r.takePayment) {
    // At a cancelled event nobody is being let in: the same button says what pressing it means there (0336).
    steps.push({ label: eventCancelled ? 'The payment did arrive' : 'Mark as paid', onClick: () => act('received'), tone: 'accent-quiet' })
    if (r.approve) steps.push({ label: 'Not received', onClick: notReceived, tone: 'quiet' })
  }
  // Not paid, and no receipt either: somebody who pays the office in person, or whose money simply turned up.
  // Its own button, in the colour of money, so it is never taken for the one that lets them in.
  if (o.status === 'confirmed' && o.total_pence > 0 && o.payment_status === 'awaiting' && r.takePayment) {
    steps.push({ label: 'Mark as paid', onClick: () => act('received'), tone: 'accent-quiet' })
  }
  // Paid, free or waived, and not in yet: Check in, in the door's green. Not while it owes (0266), and not at a cancelled event.
  if (o.status === 'confirmed' && !eventCancelled && !o.checked_in_at && r.checkIn && (o.total_pence <= 0 || isPaid(o))) {
    steps.push({ label: 'Check in', onClick: () => act('check_in'), tone: 'success-quiet' })
  }
  // Their email did not arrive (0283): the address wants putting right.
  if (email && r.email && emailWantsDoing(o)) steps.push({ label: 'Correct email address', onClick: email, tone: steps.length > 0 ? 'quiet' : 'primary' })
  return steps
}
type NextStep = { label: string; onClick: () => void; tone: 'primary' | 'quiet' | 'success-quiet' | 'accent-quiet' }

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
  invitedBy,
  sharesEmail,
  dateLabel,
  actions,
  next,
  busy,
  onlineName,
}: {
  order: OrderRow
  /** The name of the invitation link it came by (0295), if it came by one. */
  invitedBy?: string | null
  /** Another live registration is under the same address: usually the same person, twice. */
  sharesEmail?: boolean
  dateLabel?: { starts_at: string; ends_at: string | null }
  actions: MenuAction[]
  next: NextStep[]
  busy: boolean
  /** What the event's online link is called, when it has one name. */
  onlineName?: string
}) {
  const receiver = receiverName(order)
  const verifier = verifierName(order)
  const refunder = [order.refunder?.first_name, order.refunder?.last_name].filter(Boolean).join(' ')
  const [viewing, setViewing] = useState(false)
  const live = order.status === 'confirmed'
  // Cancelled after "I have paid", and nothing found yet (0336): the card says so, or it reads as any other cancellation.
  const toFind = !live && saidPaidUnconfirmed(order)
  const names = order.tickets.map((t) => t.attendee_name).filter(Boolean)
  // What became of their email (0283). A tag only when it wants something; the rest is a word at the foot.
  const delivery = deliveryOf(order)
  const undelivered = live && !!delivery?.wants
  const tagged = undelivered || (live && order.email_status === 'delayed')
  const changer = [order.changer?.first_name, order.changer?.last_name].filter(Boolean).join(' ')
  // How it pays, for one that is live and has something to pay.
  const way = live ? wayOf(order) : null
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
            {/* The sum alone. The code that made it stood here too, never shrinking: a long one left the name a column one word wide and ran over it on a phone. It is a tag below. */}
            <p className="shrink-0 font-mono text-body-sm tabular text-on-surface">{order.total_pence > 0 ? pounds(order.total_pence) : 'Free'}</p>
          </div>
          {(order.email || order.phone) && (
            <p className="break-words text-body-sm text-on-surface-variant">
              {order.email}
              {order.phone && `${order.email ? ' · ' : ''}${order.phone}`}
            </p>
          )}
          {/* What became of the email to that address, under the address: a tag instead (below) when it wants something. */}
          {delivery && !tagged && delivery.kind !== 'none' && (
            <p className={`font-mono text-label-sm ${delivery.kind === 'delivered' ? 'text-accent-green-soft' : 'text-on-surface-faint'}`} title={delivery.says}>
              {delivery.label}
            </p>
          )}

          {/* Where it stands. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            {order.status === 'cancelled' ? (
              <>
                <Pill tone="red">Cancelled</Pill>
                {toFind && (
                  <Pill tone="orange" dot>
                    Said they paid
                  </Pill>
                )}
              </>
            ) : order.total_pence > 0 ? (
              <>
                <Pill tone={PAYMENT_TONE[order.payment_status]}>{paymentWordsOf(order)}</Pill>
                {/* How: by bank, by the online link, at reception. Said beside where it stands, so "awaiting payment" at reception is told from one by bank at a glance. */}
                {way && way !== 'none' && <Pill tone="neutral">{wayWords(way, onlineName)}</Pill>}
                {/* A code that took some of it off. One that took all of it is said by "Free with code" instead. */}
                {order.promo_code && (
                  <Pill tone="neutral" className="max-w-full">
                    <span className="min-w-0 truncate">Code {order.promo_code}</span>
                  </Pill>
                )}
              </>
            ) : (
              // A tag is one line and never wider than the card: a very long code is cut short with an ellipsis rather than pushed out of it.
              <Pill tone="neutral" className="max-w-full">
                <span className="min-w-0 truncate">{order.promo_code ? `Free with code ${order.promo_code}` : invitedBy && order.discount_pence > 0 ? 'Free by invitation' : 'Free'}</span>
              </Pill>
            )}
            {live && order.payment_verified_at && order.total_pence > 0 && (
              <Pill tone="green" dot>
                Verified payment
              </Pill>
            )}
            {order.refund_status && <Pill tone={order.refund_status === 'owed' ? 'orange' : 'green'}>{order.refund_status === 'owed' ? 'Refund owed' : 'Refunded'}</Pill>}
            {/* The day too when it was not today: on the second day of an event a time alone reads as this morning's door. */}
            {/* Each day they came (0314), where more than one is kept; otherwise the latest, as before. */}
            {live && checkInsOf(order).length > 1
              ? checkInsOf(order).map((c) => (
                  <Pill key={c.on_date} tone="green">
                    {checkedInWords(c.checked_in_at)}
                  </Pill>
                ))
              : live && (order.checked_in_at ?? checkInsOf(order)[0]?.checked_in_at) && (
                  <Pill tone="green">{checkedInWords((order.checked_in_at ?? checkInsOf(order)[0]?.checked_in_at)!)}</Pill>
                )}
            {order.source === 'walk_in' && <Pill tone="neutral">Walk-in</Pill>}
            {invitedBy && <Pill tone="indigo">Invited: {invitedBy}</Pill>}
            {sharesEmail && <Pill tone="orange">Same email as another</Pill>}
            {delivery && tagged && (
              <Pill tone={delivery.tone} dot={undelivered}>
                {delivery.label}
              </Pill>
            )}
          </div>

          {/* The email that did not arrive: what the mail server said about it. */}
          {delivery && undelivered && (
            <p className="mt-1.5 text-label-md text-on-surface-variant [overflow-wrap:anywhere]">
              {delivery.says}
              {order.email_status_detail && <span className="text-on-surface-faint"> “{order.email_status_detail}”</span>}
            </p>
          )}
          {order.email_changed_at && (
            <p className="mt-1 text-label-md text-on-surface-faint [overflow-wrap:anywhere]">
              Email address changed {stamp(order.email_changed_at)} by {changer || 'the attendee'}
              {order.email_before?.email ? ` — was ${order.email_before.email}` : ''}
            </p>
          )}

          {/* How it got there: the receipt, who took the money, the refund. */}
          {(order.proof_path || order.proof_reference) && (live || toFind) && (
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
          {toFind && <p className="mt-1 text-label-md text-on-surface-faint">No refund is owed until the payment is found in the account.</p>}
          {order.received_at && (order.payment_status === 'received' || order.payment_status === 'waived') && (
            <p className="mt-1 text-label-md text-on-surface-faint">
              {order.payment_status === 'waived' ? 'Waived' : 'Received'} {stamp(order.received_at)}
              {receiver && ` by ${receiver}`}
              {/* Said by its own tag above for one that pays; here only where there is no tag (a waived one). */}
              {!way && order.payment_method && ` · ${wayWords(order.payment_method, onlineName)}`}
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
      {/* The foot: when it was made and its code on one side, the way to its ticket on the other — level with each other,
          and on the narrowest phone the code goes under the date rather than push the button about. */}
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
        <p className="flex min-w-0 flex-wrap gap-x-3 font-mono text-label-sm text-on-surface-faint">
          {/* Said what it is: a date alone under a card that also says when they paid and when they came in could be any of the three. */}
          <span className="whitespace-nowrap">Registered {stamp(order.created_at)}</span>
          <span className="whitespace-nowrap">{order.code}</span>
        </p>
        <ActionLink href={ticketUrl(order.code)} newTab size="sm" tone="quiet" className="shrink-0" aria-label={`Open ${order.name}’s ticket`}>
          Ticket
        </ActionLink>
      </div>
    </li>
  )
}

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
