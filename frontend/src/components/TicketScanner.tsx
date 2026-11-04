import { type FormEvent, useCallback, useRef, useState } from 'react'
import { ActionButton, Overlay, Pill, inputClasses } from './Surface'
import { useQrCamera } from '../lib/qrCamera'
import { codeFromScan } from '../lib/registrationLinks'
import { pounds } from '../lib/money'
import { PAYMENT_WORDS, checkedInToday, isPaid, whenWords, type EventDate, type OrderRow } from '../lib/registrations'

/**
 * The door (0246, 0247): the camera reads the QR code on each ticket —
 * which says its /ticket/<code> link — and the order comes up: who, how
 * many, whether it is paid, whether they are here already. A paid ticket
 * is checked in the moment it is read, no tap; one that still owes is
 * held up with Check in and Paid now, check in, for whoever pays at
 * reception. The camera keeps running; the next ticket in view replaces
 * the last. A code can also be typed, for a phone whose camera will not
 * read. A check-in is a day's: on the second day of a two-day event the
 * same ticket is checked in again.
 *
 * ScannerPanel is the working part, which Reception (/door) lays into its
 * own page; TicketScanner is the same in a sheet, for the event's page.
 * On Reception the camera waits for a tap (`askFirst`): a page opened to
 * look somebody up should not start the camera. The sheet opens from its
 * own Scan tickets button, so it starts at once.
 */
export interface ScannerProps {
  orders: OrderRow[]
  dates: EventDate[]
  busy: boolean
  onCheckIn: (order: OrderRow) => void
  onPaidAndCheckIn: (order: OrderRow) => void
  /** May take the money there and then (0251); off, an owing ticket is only held up. */
  canTakePayment?: boolean
  /** The camera runs only while this is on (a hidden tab keeps its hands off it). */
  active?: boolean
  /** Wait for a tap before starting the camera, and offer a way to stop it. */
  askFirst?: boolean
}

export function ScannerPanel({ orders, dates, busy, onCheckIn, onPaidAndCheckIn, canTakePayment = true, active = true, askFirst = false }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [cameraOn, setCameraOn] = useState(!askFirst)
  const [found, setFound] = useState<{ code: string; id: string | null; auto: boolean } | null>(null)
  const [typed, setTyped] = useState('')
  const lastRef = useRef<string | null>(null)

  const take = useCallback(
    (code: string) => {
      if (lastRef.current === code) return
      lastRef.current = code
      const order = orders.find((o) => o.code === code) ?? null
      // Paid (or nothing to pay), live, not yet here, and for today — or
      // for every date: in they go, no tap. Anything else is held up.
      const day = order?.date_id ? dates.find((d) => d.id === order.date_id) : undefined
      const forAnotherDay = !!day && new Date(day.starts_at).toDateString() !== new Date().toDateString()
      const walkIn = !!order && order.status === 'confirmed' && !checkedInToday(order) && isPaid(order) && !forAnotherDay
      setFound({ code, id: order?.id ?? null, auto: walkIn })
      if (walkIn) onCheckIn(order)
      try {
        navigator.vibrate?.(order ? 40 : [30, 40, 30])
      } catch {
        // No haptics here; the card is enough.
      }
    },
    [orders, dates, onCheckIn],
  )
  const onText = useCallback(
    (text: string) => {
      const code = codeFromScan(text)
      if (code) take(code)
    },
    [take],
  )
  const phase = useQrCamera(videoRef, onText, active && cameraOn)

  const submitTyped = (e: FormEvent) => {
    e.preventDefault()
    const code = codeFromScan(typed)
    if (!code) return
    lastRef.current = null
    take(code)
    setTyped('')
  }
  const next = () => {
    lastRef.current = null
    setFound(null)
  }

  // Always the order as it now stands — a check-in refreshes the list.
  const order = found?.id ? (orders.find((o) => o.id === found.id) ?? null) : null
  const today = new Date().toDateString()
  const orderDate = order?.date_id ? dates.find((d) => d.id === order.date_id) : undefined
  const otherDay = !!orderDate && new Date(orderDate.starts_at).toDateString() !== today
  const owes = !!order && order.status === 'confirmed' && order.total_pence > 0 && !isPaid(order)
  const inToday = !!order && checkedInToday(order)

  return (
    <div>
      {!cameraOn ? (
        <button
          type="button"
          onClick={() => setCameraOn(true)}
          className="tap flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-[var(--radius-chip)] bg-surface-container text-on-surface hairline hover:bg-raised"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-10 w-10 text-accent-blue-soft" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M7 12h10" />
          </svg>
          <span className="text-headline-sm">Start scanning</span>
          <span className="text-body-sm text-on-surface-variant">Opens the camera to read tickets</span>
        </button>
      ) : (
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-chip)] bg-black">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-8 rounded-[var(--radius-chip)] shadow-[0_0_0_2px_rgba(255,255,255,0.65)]" />
        {askFirst && (
          <button
            type="button"
            onClick={() => setCameraOn(false)}
            className="tap absolute right-3 top-3 rounded-full bg-black/60 px-4 text-label-md font-medium text-white backdrop-blur hover:bg-black/75"
          >
            Stop camera
          </button>
        )}
        {phase !== 'scanning' && (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-body-sm text-white/80">
            {phase === 'starting' && 'Starting the camera…'}
            {phase === 'denied' && 'The camera was refused. Allow camera access for this site, or type the code below.'}
            {phase === 'unavailable' && 'This browser will not give the page a camera. Type the code below.'}
          </p>
        )}
      </div>
      )}

      {found && (
        <section aria-label="Ticket found" className="mt-4 rounded-[var(--radius-chip)] bg-surface-container p-4">
          {!order ? (
            <>
              <Pill tone="red">Not a ticket for this event</Pill>
              <p className="mt-2 font-mono text-body-sm text-on-surface-variant">{found.code}</p>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {order.status === 'cancelled' ? (
                  <Pill tone="red">Cancelled — not valid</Pill>
                ) : found.auto ? (
                  <Pill tone="green">Checked in</Pill>
                ) : inToday ? (
                  <Pill tone="blue">Already checked in {new Date(order.checked_in_at!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Pill>
                ) : order.checked_in_at ? (
                  <Pill tone="neutral">Checked in {new Date(order.checked_in_at).toLocaleDateString([], { weekday: 'short' })} · not yet today</Pill>
                ) : (
                  <Pill tone="green">Valid</Pill>
                )}
                {order.status === 'confirmed' && order.total_pence === 0 && order.promo_code && <Pill tone="neutral">Free with code {order.promo_code}</Pill>}
                {order.status === 'confirmed' && order.total_pence > 0 && (
                  <Pill tone={order.payment_status === 'received' || order.payment_status === 'waived' ? 'green' : 'orange'}>{PAYMENT_WORDS[order.payment_status]}</Pill>
                )}
              </div>
              <h3 className="mt-2 text-headline-sm text-on-surface">
                {order.name}
                <span className="text-on-surface-variant">
                  {' '}
                  · {order.quantity} {order.quantity === 1 ? 'ticket' : 'tickets'}
                </span>
              </h3>
              {order.tickets.some((t) => t.attendee_name) && (
                <p className="text-body-sm text-on-surface-variant">For {order.tickets.map((t) => t.attendee_name).filter(Boolean).join(', ')}</p>
              )}
              {orderDate && (
                <p className={`text-body-sm ${otherDay ? 'text-accent-orange-soft' : 'text-on-surface-variant'}`}>
                  {otherDay ? 'For another day: ' : ''}
                  {whenWords(orderDate.starts_at, orderDate.ends_at)}
                </p>
              )}
              {owes && (
                <p className="mt-1 text-body-sm text-accent-orange-soft">
                  {pounds(order.total_pence)} still to pay.
                  {order.payment_status === 'reported' && ` They say they paid${order.proof_reference ? ` (ref ${order.proof_reference})` : ''}; it has not been matched yet.`}
                </p>
              )}
              {order.notes && <p className="mt-1 text-body-sm text-on-surface-variant">Note: {order.notes}</p>}
              <p className="mt-1 font-mono text-label-sm text-on-surface-faint">{order.code}</p>
            </>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {order && order.status === 'confirmed' && !inToday && !found.auto && (
              <ActionButton tone="success" onClick={() => onCheckIn(order)} disabled={busy}>
                Check in
              </ActionButton>
            )}
            {order && order.status === 'confirmed' && !inToday && owes && canTakePayment && (
              <ActionButton tone="quiet" onClick={() => onPaidAndCheckIn(order)} disabled={busy}>
                Paid now, check in
              </ActionButton>
            )}
            <ActionButton tone="ghost" onClick={next}>
              Next
            </ActionButton>
          </div>
        </section>
      )}

      <form onSubmit={submitTyped} className="mt-4 flex items-center gap-2">
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value.toUpperCase())}
          aria-label="Ticket code"
          placeholder="Or type the code"
          autoCapitalize="characters"
          autoCorrect="off"
          maxLength={80}
          className={`${inputClasses} flex-1`}
        />
        <ActionButton type="submit" tone="quiet" disabled={!codeFromScan(typed)}>
          Find
        </ActionButton>
      </form>
    </div>
  )
}

/** The scanner in a sheet over the event's page. */
export function TicketScanner({ onClose, ...panel }: ScannerProps & { onClose: () => void }) {
  return (
    <Overlay label="Scan tickets" align="sheet" onDismiss={onClose}>
      <div className="w-full rounded-t-[var(--radius-card)] bg-surface-lowest p-5 shadow-[inset_0_0_0_1px_var(--color-outline-variant),var(--shadow-lifted)] sm:max-w-md sm:rounded-[var(--radius-card)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-headline-md">Scan tickets</h2>
            <p className="mt-1 text-body-sm text-on-surface-variant">Point the camera at the QR code on a ticket.</p>
          </div>
          <button type="button" onClick={onClose} className="tap rounded-full hairline px-4 py-2 text-body-sm font-medium text-on-surface">
            Done
          </button>
        </div>
        <div className="mt-4">
          <ScannerPanel {...panel} />
        </div>
      </div>
    </Overlay>
  )
}
