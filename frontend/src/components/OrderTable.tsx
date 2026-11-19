import { Fragment, useState, type ReactNode } from 'react'
import { ActionButton, Pill, TableScroll, Tile } from './Surface'
import { ActionMenu, type MenuAction } from './ActionMenu'
import { HEAD_IN_BOX, ON_CARD } from '../lib/stickyHead'
import { pounds } from '../lib/money'
import { PAYMENT_FILTERS } from '../lib/orderFilters'
import { paymentOf, wayOf, wayWords, type PaymentPlace } from '../lib/registrationBreakdown'
import { PAYMENT_TONE, type OrderRow } from '../lib/registrations'
import type { OrderSort, SortKey } from '../lib/orderSort'

/** The one thing a row is waiting for, as the card would offer it first. */
export interface RowStep {
  label: string
  onClick: () => void
  tone: 'primary' | 'quiet'
}

const stamp = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'name', label: 'Name' },
  { key: 'tickets', label: 'Tickets', numeric: true },
  { key: 'amount', label: 'Amount', numeric: true },
  { key: 'status', label: 'Status' },
  { key: 'method', label: 'Payment method' },
  { key: 'registered', label: 'Registered' },
]

const CELL = 'px-3 py-2.5 align-middle'

/** Where the payment stands, in the words the Status dropdown uses for the same thing. */
const STATUS_WORDS = Object.fromEntries(PAYMENT_FILTERS.map((p) => [p.key, p.label])) as Record<PaymentPlace, string>

/**
 * An event's registrations as a table: one line each, in whatever order
 * its headings are pressed into (lib/orderSort).
 *
 * The cards say everything about one registration; this says one line
 * about each, so they can be read down a column and put in order — who
 * owes the most, who registered first, everybody paying at reception
 * together. It is the same list the cards show: the search box and the
 * two dropdowns above narrow both.
 *
 * **Everything a card can do, a row can.** Its first next step is a
 * button in the row (Verify payment, Mark as received) — a quiet one
 * whatever the card makes it: thirteen receipts to check were thirteen
 * blue buttons down a column, and the Status tag beside each already
 * says which rows want something; the rest are in
 * its menu, the same menu the card has; and **Details** opens the whole
 * card under the row, for the receipt, the note, who took the money and
 * the ticket. (The ticket was a button in the row too, and with it the
 * table was a few pixels wider than a 1280px screen: one thing fewer in
 * every row, and it fits.) Nothing was written twice to make that
 * so: the page hands over the card, the menu and the steps it already
 * makes for the cards.
 *
 * A heading is a button that says which way it is sorted (`aria-sort`, and
 * an arrow for the eye). The table scrolls sideways inside itself on a
 * phone, with its headings pinned (`TableScroll`, `HEAD_IN_BOX`).
 */
export function OrderTable({
  orders,
  sort,
  onSort,
  onlineName,
  actionsFor,
  stepsFor,
  cardFor,
  busy = false,
}: {
  /** Already narrowed and already in order. */
  orders: readonly OrderRow[]
  sort: OrderSort
  onSort: (key: SortKey) => void
  /** What the event's online link is called, when it has one name. */
  onlineName?: string
  actionsFor: (order: OrderRow) => MenuAction[]
  stepsFor: (order: OrderRow) => RowStep[]
  /** The registration's whole card, as the cards view draws it (an `<li>`). */
  cardFor: (order: OrderRow) => ReactNode
  busy?: boolean
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const toggle = (id: string) =>
    setOpen((was) => {
      const next = new Set(was)
      if (!next.delete(id)) next.add(id)
      return next
    })

  return (
    <Tile padded={false} className="mt-3 overflow-hidden">
      <TableScroll>
        <table aria-label="Registrations" className="w-full border-collapse text-left text-body-sm">
          <thead>
            <tr>
              {COLUMNS.map((column) => {
                const on = sort.key === column.key
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={`whitespace-nowrap px-3 py-2 font-normal ${column.key === 'name' ? 'pl-4 sm:pl-5' : ''} ${column.numeric ? 'text-right' : ''} ${HEAD_IN_BOX} ${ON_CARD}`}
                  >
                    <button
                      type="button"
                      onClick={() => onSort(column.key)}
                      title={`Sort by ${column.label.toLowerCase()}`}
                      className={`tap inline-flex items-center gap-1 font-mono text-label-sm uppercase tracking-wide hover:text-on-surface ${on ? 'font-semibold text-on-surface' : 'text-on-surface-variant'}`}
                    >
                      {column.label}
                      {/* The arrow keeps its place when it is not this column's, so pressing a heading moves nothing sideways. */}
                      <span aria-hidden="true" className={`w-3 text-center ${on ? '' : 'opacity-0'}`}>
                        {on && sort.dir === 'asc' ? '↑' : '↓'}
                      </span>
                    </button>
                  </th>
                )
              })}
              <th scope="col" className={`px-3 py-2 text-right font-mono text-label-sm font-normal uppercase tracking-wide text-on-surface-variant ${HEAD_IN_BOX} ${ON_CARD}`}>
                <span className="sr-only">What can be done</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const live = order.status === 'confirmed'
              const way = live ? wayOf(order) : null
              const [step] = stepsFor(order)
              const shown = open.has(order.id)
              const detailsId = `order-details-${order.id}`
              return (
                <Fragment key={order.id}>
                  <tr aria-label={order.name} className={`border-t border-border-subtle ${live ? '' : 'opacity-60'}`}>
                    <th scope="row" className={`${CELL} max-w-[11rem] pl-4 font-normal sm:max-w-[14rem] sm:pl-5`}>
                      <span className="block truncate font-medium text-on-surface">{order.name}</span>
                      {order.email && <span className="block truncate text-label-md text-on-surface-faint">{order.email}</span>}
                    </th>
                    <td className={`${CELL} text-right font-mono tabular text-on-surface-variant`}>{order.quantity}</td>
                    <td className={`${CELL} whitespace-nowrap text-right font-mono tabular text-on-surface`}>{order.total_pence > 0 ? pounds(order.total_pence) : 'Free'}</td>
                    {/* One line, in the Status dropdown's own words: the cell that is filtered by and the thing it is filtered to read alike.
                        `whitespace-nowrap`, or the column is sized for a tag's longest word and the tag runs over the next column. */}
                    <td className={`${CELL} whitespace-nowrap`}>
                      <span className="flex items-center gap-1">
                        {!live ? <Pill tone="red">Cancelled</Pill> : <Pill tone={PAYMENT_TONE[order.payment_status]}>{STATUS_WORDS[paymentOf(order)]}</Pill>}
                        {live && order.checked_in_at && <Pill tone="green">Checked in</Pill>}
                      </span>
                    </td>
                    <td className={`${CELL} whitespace-nowrap text-on-surface-variant`}>{way && way !== 'none' ? wayWords(way, onlineName) : way === 'none' ? 'Not chosen yet' : '—'}</td>
                    <td className={`${CELL} whitespace-nowrap font-mono text-label-sm text-on-surface-faint`}>{stamp(order.created_at)}</td>
                    <td className={`${CELL} whitespace-nowrap`}>
                      <span className="flex items-center justify-end gap-1.5">
                        {step && (
                          <ActionButton size="sm" tone="quiet" onClick={step.onClick} disabled={busy}>
                            {step.label}
                          </ActionButton>
                        )}
                        <ActionButton size="sm" tone="ghost" className="min-w-[4.5rem]" onClick={() => toggle(order.id)} aria-expanded={shown} aria-controls={detailsId} aria-label={`${shown ? 'Hide' : 'Show'} ${order.name}’s details`}>
                          {shown ? 'Hide' : 'Details'}
                        </ActionButton>
                        <ActionMenu label={order.name} actions={actionsFor(order)} />
                      </span>
                    </td>
                  </tr>
                  {shown && (
                    <tr id={detailsId}>
                      <td colSpan={COLUMNS.length + 1} className="bg-raised px-3 pb-3 pt-1">
                        {/* The whole card, as the cards view has it: the receipt, the note, who took the money, every step. */}
                        <ul aria-label={`${order.name}’s details`} className="max-w-3xl">
                          {cardFor(order)}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </TableScroll>
    </Tile>
  )
}
