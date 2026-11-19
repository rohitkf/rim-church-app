import type { ReactNode } from 'react'
import { Eyebrow, SegmentedControl } from './Surface'
import {
  NO_FILTERS,
  ONLY_FILTERS,
  PAYMENT_FILTERS,
  orderFits,
  wayFilters,
  type OnlyFilter,
  type OrderFilters,
  type PaymentFilter,
  type WayFilter,
} from '../lib/orderFilters'
import type { OrderRow } from '../lib/registrations'

/** A row of choices under its question. It scrolls sideways on a phone rather than squeeze its labels. */
function Question({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Eyebrow>{title}</Eyebrow>
      <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">{children}</div>
    </div>
  )
}

const counted = (label: string, n: number | null) =>
  n === null ? (
    label
  ) : (
    <>
      {label} <span className="font-mono text-label-sm tabular opacity-70">{n}</span>
    </>
  )

/**
 * The filters over an event's registrations (lib/orderFilters): where the
 * money stands, how it is paid, and one thing more to show only.
 *
 * Each choice says how many it would show **with the other rows as they
 * are**: with At reception chosen, "Paid" says how many paid at reception.
 * A choice nobody on the event is in is not offered at all — an event
 * with no waived payment has no "Waived" — and a row with nothing to
 * choose is not drawn.
 */
export function OrderFilterBar({
  orders,
  duplicates,
  filters,
  onChange,
  onlineName,
}: {
  orders: readonly OrderRow[]
  /** duplicateEmails() of the same orders. */
  duplicates: ReadonlySet<string>
  filters: OrderFilters
  onChange: (next: OrderFilters) => void
  /** What the event's online link is called, when it has one name. */
  onlineName?: string
}) {
  const count = (f: OrderFilters) => orders.filter((o) => orderFits(o, f, duplicates)).length
  // Offered: somebody on the event is in it (whatever else is chosen), or it is the one chosen.
  const payments = PAYMENT_FILTERS.filter((p) => p.key === 'all' || p.key === filters.payment || count({ ...NO_FILTERS, payment: p.key }) > 0)
  const ways = wayFilters(onlineName).filter((w) => w.key === 'any' || w.key === filters.way || count({ ...NO_FILTERS, way: w.key }) > 0)
  const onlys = ONLY_FILTERS.filter((o) => o.key === filters.only || count({ ...NO_FILTERS, only: o.key }) > 0)

  return (
    <div className="flex flex-col gap-3">
      {payments.length > 1 && (
        <Question title="Payment">
          <SegmentedControl<PaymentFilter>
            label="Payment"
            value={filters.payment}
            onChange={(payment) => onChange({ ...filters, payment })}
            options={payments.map((p) => ({ value: p.key, label: counted(p.label, p.key === 'all' ? null : count({ ...filters, payment: p.key })) }))}
            scrolls
          />
        </Question>
      )}
      {ways.length > 1 && (
        <Question title="Way of paying">
          <SegmentedControl<WayFilter>
            label="Way of paying"
            value={filters.way}
            onChange={(way) => onChange({ ...filters, way })}
            options={ways.map((w) => ({ value: w.key, label: counted(w.label, w.key === 'any' ? null : count({ ...filters, way: w.key })) }))}
            scrolls
          />
        </Question>
      )}
      {onlys.length > 0 && (
        <Question title="Show only">
          {/* Pressed again, it is let go: there is no "none" to look for. */}
          <SegmentedControl<OnlyFilter>
            label="Show only"
            kind="pressed"
            value={filters.only}
            onChange={(only) => onChange({ ...filters, only: filters.only === only ? null : only })}
            options={onlys.map((o) => ({ value: o.key, label: counted(o.label, count({ ...filters, only: o.key })) }))}
            scrolls
          />
        </Question>
      )}
    </div>
  )
}
