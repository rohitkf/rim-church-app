import { type FormEvent, useMemo, useState } from 'react'
import { useRegistrationRights } from '../lib/registrationRights'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ActionButton, Field, FieldGroup, PageHeader, Pill, SegmentedControl, Statistic, Tile, inputClasses } from '../components/Surface'
import { Select } from '../components/Select'
import { PhoneField } from '../components/PhoneField'
import { ScannerPanel } from '../components/TicketScanner'
import { QueryState } from '../components/QueryState'
import { useErrorText } from '../lib/useErrorText'
import { usePageAccess } from '../lib/usePageAccess'
import { showToast } from '../lib/toast'
import { parsePounds, pounds } from '../lib/money'
import { ticketUrl } from '../lib/registrationLinks'
import type { PhoneStatus } from '../lib/phone'
import {
  PAYMENT_WORDS,
  REGISTRATIONS_KEY,
  checkedInToday,
  doorEvents,
  fetchRegistrationEvent,
  fetchRegistrationEvents,
  fetchRegistrationOrders,
  isPaid,
  markOrder,
  notifyPayment,
  orderMatches,
  sendTicketEmail,
  todaysEvent,
  walkIn,
  whenWords,
  type EventDate,
  type OrderLine,
  type OrderRow,
  type TicketType,
} from '../lib/registrations'

/**
 * Reception (0247): the door, on one page, for whoever works it — the
 * Owner, whoever runs registrations, and whoever the grid gives "Work the
 * door". Today's event comes up on its own (or pick one), and then three
 * things: Scan a ticket's QR code (a paid one is checked in on sight; one
 * that still owes is held up, and can be paid there and then), Find
 * anybody by name and check them in or take their payment, and Walk-in
 * for somebody who turns up having done nothing online: registered, paid
 * or not, checked in, and their ticket emailed if they give an address.
 *
 * The door can do only that: `registration_order_mark` lets `reg.door`
 * check in, undo a check-in and mark a payment received, and nothing
 * else; events and their tickets are read-only here.
 */
type Tab = 'scan' | 'find' | 'walk_in'

export function DoorPage() {
  const [params, setParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { canOpen } = usePageAccess()
  const events = useQuery({ queryKey: [...REGISTRATIONS_KEY, 'list'], queryFn: fetchRegistrationEvents })
  const open = useMemo(() => doorEvents(events.data ?? []), [events.data])
  const today = useMemo(() => todaysEvent(events.data ?? []), [events.data])
  // The event in the address wins (the event's page links here); else today's; else the next one.
  const asked = params.get('event')
  const eventId = (asked && open.some((e) => e.id === asked) ? asked : null) ?? today?.id ?? open[0]?.id ?? null
  const choose = (id: string) => setParams(id ? { event: id } : {}, { replace: true })

  const refresh = () => queryClient.invalidateQueries({ queryKey: REGISTRATIONS_KEY })

  return (
    <div>
      <PageHeader eyebrow="Church life" title="Reception" description="Scan tickets, check people in, take payments at the door, register a walk-in." />
      <QueryState isLoading={events.isLoading} error={events.error} isEmpty={open.length === 0} emptyMessage="No event today, and none coming up. Events are made on the Registrations page.">
        {open.length > 1 && (
          <Field label="Event" className="mb-4 max-w-md">
            <Select
              value={eventId ?? ''}
              onChange={choose}
              aria-label="Event"
              options={open.map((e) => ({ value: e.id, label: `${e.title}${e.first_starts_at ? ` · ${whenWords(e.first_starts_at, null)}` : ''}` }))}
            />
          </Field>
        )}
        {eventId && <Door key={eventId} eventId={eventId} refresh={refresh} manager={canOpen('/registrations')} />}
      </QueryState>
    </div>
  )
}

function Door({ eventId, refresh, manager }: { eventId: string; refresh: () => Promise<void>; manager: boolean }) {
  // What this person may do at the door (0251); the database checks the same.
  const rights = useRegistrationRights()
  const errorText = useErrorText()
  const [tab, setTab] = useState<Tab>('scan')
  const [error, setError] = useState<string | null>(null)
  const full = useQuery({ queryKey: [...REGISTRATIONS_KEY, 'event', eventId], queryFn: () => fetchRegistrationEvent(eventId) })
  const orders = useQuery({ queryKey: [...REGISTRATIONS_KEY, 'orders', eventId], queryFn: () => fetchRegistrationOrders(eventId) })

  // Money taken at the door: marked received, and "your ticket is
  // confirmed" to whoever gave an address. Nothing waits on the email.
  const tookMoney = (order: OrderRow) => {
    if (order.email) void notifyPayment('paid', order.code)
  }
  const checkIn = useMutation({
    mutationFn: (order: OrderRow) => markOrder(order.id, 'check_in'),
    onSuccess: () => {
      setError(null)
      showToast('Checked in')
      return refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not check them in.')),
  })
  const undoCheckIn = useMutation({
    mutationFn: (order: OrderRow) => markOrder(order.id, 'undo_check_in'),
    onSuccess: () => {
      setError(null)
      showToast('Check-in undone')
      return refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not undo that.')),
  })
  const paid = useMutation({
    mutationFn: async ({ order, andIn }: { order: OrderRow; andIn: boolean }) => {
      await markOrder(order.id, 'received')
      if (andIn) await markOrder(order.id, 'check_in')
    },
    onSuccess: (_r, { order, andIn }) => {
      setError(null)
      tookMoney(order)
      showToast(andIn ? 'Received, and checked in' : 'Received')
      return refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not take that payment.')),
  })
  const busy = checkIn.isPending || undoCheckIn.isPending || paid.isPending

  if (full.isLoading) return <QueryState isLoading error={null}>{null}</QueryState>
  if (full.error || !full.data) {
    return (
      <QueryState isLoading={false} error={full.error ?? new Error('No such event.')}>
        {null}
      </QueryState>
    )
  }
  const { event, dates, ticketTypes } = full.data
  const rows = orders.data ?? []
  const confirmed = rows.filter((o) => o.status === 'confirmed')
  const tickets = confirmed.reduce((n, o) => n + o.quantity, 0)
  // Today's door: a check-in from the first day of a two-day event is not here now.
  const here = confirmed.filter((o) => checkedInToday(o)).reduce((n, o) => n + o.quantity, 0)
  const owing = confirmed.filter((o) => o.total_pence > 0 && !isPaid(o)).length

  return (
    <div>
      <Tile className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h2 className="text-headline-md text-on-surface">{event.title}</h2>
            <p className="text-body-sm text-on-surface-variant">{dates.map((d) => whenWords(d.starts_at, d.ends_at)).join(' · ')}</p>
          </div>
          {manager && (
            <Link to={`/registrations/${event.id}`} className="tap text-label-md font-medium text-accent-blue-soft hover:underline">
              The event's page
            </Link>
          )}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Statistic value={here} unit="here" />
          <Statistic value={tickets} unit="tickets" />
          <Statistic value={owing} unit="still to pay" />
        </div>
      </Tile>

      {error && (
        <p role="alert" className="mb-4 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      <SegmentedControl
        label="At the door"
        kind="tab"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'scan', label: 'Scan' },
          { value: 'find', label: 'Find' },
          ...(rights.walkIn ? [{ value: 'walk_in' as const, label: 'Walk-in' }] : []),
        ]}
        className="mb-4"
      />

      {tab === 'scan' && (
        <section aria-label="Scan tickets">
          <p className="mb-3 text-body-sm text-on-surface-variant">Point the camera at the QR code on a ticket. A paid ticket is checked in as it is read.</p>
          <ScannerPanel
            orders={rows}
            dates={dates}
            busy={busy}
            onCheckIn={(order) => checkIn.mutate(order)}
            onPaidAndCheckIn={(order) => paid.mutate({ order, andIn: true })}
            canTakePayment={rights.takePayment}
          />
        </section>
      )}
      {tab === 'find' && (
        <Find
          orders={rows}
          dates={dates}
          busy={busy}
          onCheckIn={(order) => checkIn.mutate(order)}
          onUndo={(order) => undoCheckIn.mutate(order)}
          onPaid={(order, andIn) => paid.mutate({ order, andIn })}
          canTakePayment={rights.takePayment}
        />
      )}
      {tab === 'walk_in' && rights.walkIn && (
        <WalkIn
          eventId={event.id}
          dateMode={event.date_mode}
          dates={dates}
          ticketTypes={ticketTypes}
          orders={confirmed}
          refresh={refresh}
          canTakePayment={rights.takePayment}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Find: anybody, by name, and what the door does for them              */
/* ------------------------------------------------------------------ */

const PAY_TONE: Record<OrderRow['payment_status'], 'neutral' | 'orange' | 'blue' | 'green'> = {
  not_needed: 'neutral',
  awaiting: 'orange',
  reported: 'blue',
  received: 'green',
  waived: 'green',
}

function Find({
  orders,
  dates,
  busy,
  onCheckIn,
  onUndo,
  onPaid,
  canTakePayment,
}: {
  orders: OrderRow[]
  dates: EventDate[]
  busy: boolean
  onCheckIn: (order: OrderRow) => void
  onUndo: (order: OrderRow) => void
  onPaid: (order: OrderRow, andIn: boolean) => void
  canTakePayment: boolean
}) {
  const [query, setQuery] = useState('')
  const shown = orders
    .filter((o) => orderMatches(o, 'all', query))
    .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'confirmed' ? -1 : 1))
  return (
    <section aria-label="Find a registration">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Find a registration"
        placeholder="Name, email, phone or code"
        autoCapitalize="off"
        className={inputClasses}
      />
      {orders.length === 0 ? (
        <p className="mt-3 text-body-sm text-on-surface-variant">Nobody has registered yet.</p>
      ) : shown.length === 0 ? (
        <p className="mt-3 text-body-sm text-on-surface-variant">Nobody matches.</p>
      ) : (
        <ul aria-label="Registrations" className="mt-3 flex flex-col gap-2">
          {shown.map((o) => {
            const day = o.date_id ? dates.find((d) => d.id === o.date_id) : undefined
            const owes = o.status === 'confirmed' && o.total_pence > 0 && !isPaid(o)
            const inToday = checkedInToday(o)
            return (
              <li key={o.id} aria-label={o.name} className={`rounded-[var(--radius-row)] bg-surface-lowest p-3.5 hairline ${o.status === 'cancelled' ? 'opacity-60' : ''}`}>
                <p className="text-body-md font-medium text-on-surface">
                  {o.name}
                  <span className="text-on-surface-variant">
                    {' '}
                    · {o.quantity} {o.quantity === 1 ? 'ticket' : 'tickets'}
                  </span>
                </p>
                {/* Where they stand, on its own line: a long pill beside the name squeezed it into a column on a phone. */}
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {o.status === 'cancelled' ? (
                    <Pill tone="red">Cancelled</Pill>
                  ) : inToday ? (
                    <Pill tone="blue">Checked in {new Date(o.checked_in_at!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Pill>
                  ) : o.checked_in_at ? (
                    <Pill tone="neutral">Checked in {new Date(o.checked_in_at).toLocaleDateString([], { weekday: 'short' })} · not yet today</Pill>
                  ) : null}
                  {o.status === 'confirmed' && o.total_pence > 0 && <Pill tone={PAY_TONE[o.payment_status]}>{PAYMENT_WORDS[o.payment_status]}</Pill>}
                  {o.status === 'confirmed' && o.total_pence === 0 && o.promo_code && <Pill tone="neutral">Free with code {o.promo_code}</Pill>}
                </div>
                {o.tickets.some((t) => t.attendee_name) && (
                  <p className="text-label-md text-on-surface-faint">For {o.tickets.map((t) => t.attendee_name).filter(Boolean).join(', ')}</p>
                )}
                {day && <p className="text-label-md text-on-surface-faint">{whenWords(day.starts_at, day.ends_at)}</p>}
                {owes && (
                  <p className="mt-1 text-body-sm text-accent-orange-soft">
                    {pounds(o.total_pence)} still to pay.
                    {o.payment_status === 'reported' && ` They say they paid${o.proof_reference ? ` (ref ${o.proof_reference})` : ''}; it has not been matched yet.`}
                  </p>
                )}
                {o.notes && <p className="mt-1 text-body-sm text-on-surface-variant">Note: {o.notes}</p>}
                <p className="mt-1 font-mono text-label-sm text-on-surface-faint">
                  {o.code}
                  {o.email && ` · ${o.email}`}
                  {o.phone && ` · ${o.phone}`}
                </p>
                {o.status === 'confirmed' && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!inToday && (
                      <ActionButton size="sm" tone="success" onClick={() => onCheckIn(o)} disabled={busy}>
                        Check in
                      </ActionButton>
                    )}
                    {owes && canTakePayment && (
                      <ActionButton size="sm" tone="quiet" onClick={() => onPaid(o, !inToday)} disabled={busy}>
                        {inToday ? 'Paid now' : 'Paid now, check in'}
                      </ActionButton>
                    )}
                    {inToday && (
                      <ActionButton size="sm" tone="ghost" onClick={() => onUndo(o)} disabled={busy}>
                        Undo check-in
                      </ActionButton>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Walk-in: somebody who did nothing online                             */
/* ------------------------------------------------------------------ */

interface Wanted {
  quantity: number
  donation: string
}

function WalkIn({
  eventId,
  dateMode,
  dates,
  ticketTypes,
  orders,
  refresh,
  canTakePayment,
}: {
  eventId: string
  dateMode: 'all' | 'choose'
  dates: EventDate[]
  ticketTypes: TicketType[]
  orders: OrderRow[]
  refresh: () => Promise<void>
  canTakePayment: boolean
}) {
  const errorText = useErrorText()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [phoneStatus, setPhoneStatus] = useState<PhoneStatus>('empty')
  const [email, setEmail] = useState('')
  const [dateId, setDateId] = useState<string | null>(() => todaysDate(dates))
  const [wanted, setWanted] = useState<Record<string, Wanted>>({})
  const [paidNow, setPaidNow] = useState(canTakePayment)
  const [here, setHere] = useState(true)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ code: string; name: string; email: string | null } | null>(null)
  // Counts the walk-ins taken: the phone field keeps its own text, so a new one is keyed afresh.
  const [round, setRound] = useState(0)

  const sold = (typeId: string) =>
    orders.filter((o) => dateMode !== 'choose' || o.date_id === dateId).reduce((n, o) => n + o.tickets.filter((t) => t.ticket_type_id === typeId).length, 0)
  const left = (t: TicketType) => (t.quantity === null ? null : Math.max(t.quantity - sold(t.id), 0))
  const setQuantity = (t: TicketType, quantity: number) =>
    setWanted((all) => ({ ...all, [t.id]: { ...(all[t.id] ?? { quantity: 0, donation: '' }), quantity: Math.max(0, quantity) } }))

  const lines: OrderLine[] = ticketTypes
    .filter((t) => (wanted[t.id]?.quantity ?? 0) > 0)
    .map((t) => ({
      ticket_type_id: t.id,
      quantity: wanted[t.id].quantity,
      attendee_names: [],
      ...(t.kind === 'donation' ? { donation_pence: parsePounds(wanted[t.id].donation) ?? 0 } : {}),
    }))
  const quantity = lines.reduce((n, l) => n + l.quantity, 0)
  const total = ticketTypes.reduce((n, t) => {
    const w = wanted[t.id]
    if (!w || w.quantity === 0) return n
    const unit = t.kind === 'free' ? 0 : t.kind === 'paid' ? t.price_pence : (parsePounds(w.donation) ?? 0)
    return n + unit * w.quantity
  }, 0)

  const problems: string[] = []
  if (!name.trim()) problems.push('Their name.')
  if (phoneStatus === 'invalid') problems.push('A phone number that looks right, or none.')
  if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) problems.push('An email address that looks right, or none.')
  if (dateMode === 'choose' && !dateId) problems.push('Which date they are here for.')
  if (quantity === 0) problems.push('At least one ticket.')
  for (const t of ticketTypes) {
    const w = wanted[t.id]
    if (!w || w.quantity === 0 || t.kind !== 'donation') continue
    const pence = parsePounds(w.donation)
    if (pence === null) problems.push(`How much for ${t.name}.`)
    else if (t.min_donation_pence && pence < t.min_donation_pence) problems.push(`At least ${pounds(t.min_donation_pence)} for ${t.name}.`)
  }

  const register = useMutation({
    mutationFn: () =>
      walkIn(eventId, {
        name: name.trim(),
        email: email.trim(),
        phone,
        date_id: dateMode === 'choose' ? dateId : null,
        lines,
        paid: total > 0 && paidNow,
        checked_in: here,
      }),
    onSuccess: (code) => {
      const address = email.trim() || null
      // Their ticket, to the address they gave; nothing waits on it.
      if (address) void sendTicketEmail(code)
      setDone({ code, name: name.trim(), email: address })
      setError(null)
      showToast(here ? 'Registered, and checked in' : 'Registered')
      return refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not register them.')),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (problems.length > 0 || register.isPending) return
    register.mutate()
  }
  const another = () => {
    setDone(null)
    setName('')
    setEmail('')
    setPhone('')
    setWanted({})
    setPaidNow(canTakePayment)
    setHere(true)
    setSubmitted(false)
    setRound((n) => n + 1)
  }

  if (done) {
    return (
      <section aria-label="Registered" className="rounded-[var(--radius-card)] bg-surface-lowest p-5 hairline">
        <Pill tone="green">Registered</Pill>
        <h3 className="mt-2 text-headline-md text-on-surface">{done.name}</h3>
        <p className="mt-1 font-mono text-body-md tracking-[0.15em] text-on-surface">{done.code}</p>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          {done.email ? `Their ticket is on its way to ${done.email}.` : 'No email address, so no ticket was sent; the code above is theirs.'}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <ActionButton onClick={another}>Another walk-in</ActionButton>
          <a href={ticketUrl(done.code)} target="_blank" rel="noopener noreferrer" className="tap text-label-md font-medium text-accent-blue-soft hover:underline">
            Open their ticket
          </a>
        </div>
      </section>
    )
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Walk-in" className="flex flex-col gap-4">
      <p className="text-body-sm text-on-surface-variant">Somebody at the door who did nothing online. An email address gets them their ticket; a phone number is for the church.</p>
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" maxLength={120} className={inputClasses} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <PhoneField key={round} value={phone} onChange={setPhone} onStatus={setPhoneStatus} showError={submitted} label="Phone (optional)" eyebrow />
        <Field label="Email (optional)">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoComplete="off" autoCapitalize="off" maxLength={254} className={inputClasses} />
        </Field>
      </div>

      {dateMode === 'choose' && (
        <FieldGroup label="Which date">
          <div role="radiogroup" aria-label="Which date" className="flex flex-col gap-1.5">
            {dates.map((d) => (
              <label key={d.id} className="flex items-center gap-2 text-body-sm text-on-surface">
                <input type="radio" name="date" checked={dateId === d.id} onChange={() => setDateId(d.id)} className="accent-[var(--color-primary)]" />
                {whenWords(d.starts_at, d.ends_at)}
                {d.label && <span className="text-on-surface-variant">· {d.label}</span>}
              </label>
            ))}
          </div>
        </FieldGroup>
      )}

      <FieldGroup label="Tickets">
        <ul className="flex flex-col gap-2">
          {ticketTypes.map((t) => {
            const w = wanted[t.id] ?? { quantity: 0, donation: '' }
            const remaining = left(t)
            const price = t.kind === 'free' ? 'Free' : t.kind === 'paid' ? pounds(t.price_pence) : `Donation${t.min_donation_pence ? ` · at least ${pounds(t.min_donation_pence)}` : ''}`
            return (
              <li key={t.id} aria-label={t.name} className="rounded-[var(--radius-row)] bg-surface-lowest p-3.5 hairline">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-body-md font-medium text-on-surface">{t.name}</p>
                    <p className="text-body-sm text-on-surface-variant">
                      {price}
                      {remaining !== null && (
                        <span className={remaining === 0 ? ' text-accent-red-soft' : ' text-on-surface-faint'}> · {remaining === 0 ? 'Sold out' : `${remaining} left`}</span>
                      )}
                    </p>
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
                      disabled={remaining === 0 || (remaining !== null && w.quantity >= remaining) || w.quantity >= 100}
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
              </li>
            )
          })}
        </ul>
      </FieldGroup>

      <div className="flex flex-col gap-2">
        {total > 0 && canTakePayment && (
          <label className="flex items-center gap-2 text-body-md text-on-surface">
            <input type="checkbox" checked={paidNow} onChange={(e) => setPaidNow(e.target.checked)} className="accent-[var(--color-primary)]" />
            Paid now · {pounds(total)}
          </label>
        )}
        <label className="flex items-center gap-2 text-body-md text-on-surface">
          <input type="checkbox" checked={here} onChange={(e) => setHere(e.target.checked)} className="accent-[var(--color-primary)]" />
          Here now — check them in
        </label>
        {total > 0 && !paidNow && <p className="text-body-sm text-on-surface-variant">They will owe {pounds(total)}; their ticket says so until it is paid.</p>}
      </div>

      {submitted && problems.length > 0 && (
        <div role="alert" className="rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          <p>Still needed:</p>
          <ul className="list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}
      <div>
        <ActionButton type="submit" disabled={register.isPending}>
          {register.isPending ? 'Registering…' : 'Register'}
        </ActionButton>
      </div>
    </form>
  )
}

/** The date happening today, when people pick one; else the first still to come. */
function todaysDate(dates: EventDate[]): string | null {
  const today = new Date().toDateString()
  const now = Date.now()
  return (
    dates.find((d) => new Date(d.starts_at).toDateString() === today)?.id ??
    dates.find((d) => new Date(d.ends_at ?? d.starts_at).getTime() >= now)?.id ??
    dates[0]?.id ??
    null
  )
}
