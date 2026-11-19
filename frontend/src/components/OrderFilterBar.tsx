import { ActionButton } from './Surface'
import { Select, selectPillClasses, selectPillOnClasses, type SelectItem, type SelectOption } from './Select'
import {
  NO_FILTERS,
  ONLY_FILTERS,
  PAYMENT_FILTERS,
  STATUS_HEADINGS,
  anyFilter,
  filterWords,
  orderFits,
  statusOf,
  wayFilters,
  withStatus,
  type OrderFilters,
  type StatusChoice,
  type WayFilter,
} from '../lib/orderFilters'
import type { OrderRow } from '../lib/registrations'

/**
 * The filters over an event's registrations (lib/orderFilters): two
 * dropdowns in a row, **Status** and **Payment method**, each a pill that
 * says its answer.
 *
 * A dropdown is tinted while it is narrowing the list, so what is on is
 * seen without reading it. Its list says beside each choice how many it
 * would show **with the other dropdown as it is** — with At reception
 * chosen, "Paid" says how many paid at reception — and greys a choice
 * that would show nobody, so no pick ends in an empty list. A choice
 * nobody on the event is in is not listed at all (no "Waived" where
 * nothing was), and the payment-method dropdown is not drawn for an event
 * where nobody pays.
 *
 * Beside them, once anything is chosen or typed: how many are shown out
 * of how many, and one button that puts everything back.
 */
export function OrderFilterBar({
  orders,
  duplicates,
  filters,
  onChange,
  onlineName,
  shown,
  searching = false,
  onClear,
}: {
  orders: readonly OrderRow[]
  /** duplicateEmails() of the same orders. */
  duplicates: ReadonlySet<string>
  filters: OrderFilters
  onChange: (next: OrderFilters) => void
  /** What the event's online link is called, when it has one name. */
  onlineName?: string
  /** How many registrations the list is showing now, the typed words counted too. */
  shown: number
  /** Something is typed in the search box: the count is said, and Clear clears that as well. */
  searching?: boolean
  onClear: () => void
}) {
  const count = (f: OrderFilters) => orders.filter((o) => orderFits(o, f, duplicates)).length
  const status = statusOf(filters)

  /** A choice in a list: how many it would show as things stand; greyed at none; left out if nobody on the event is in it. */
  const option = (value: string, label: string, here: OrderFilters, alone: OrderFilters, chosen: boolean): SelectOption | null => {
    if (!chosen && count(alone) === 0) return null
    const n = count(here)
    return { value, label, hint: String(n), disabled: n === 0 && !chosen }
  }
  const present = (list: (SelectOption | null)[]) => list.filter((o): o is SelectOption => o !== null)

  // The Status list: everybody, then what there is under each heading.
  const payments = present(
    PAYMENT_FILTERS.filter((p) => p.key !== 'all').map((p) => {
      const choice: StatusChoice = `payment:${p.key as Exclude<typeof p.key, 'all'>}`
      return option(choice, p.label, withStatus(filters, choice), withStatus(NO_FILTERS, choice), status === choice)
    }),
  )
  const others = (kind: 'todo' | 'came') =>
    present(
      ONLY_FILTERS.filter((o) => o.kind === kind).map((o) => {
        const choice: StatusChoice = `only:${o.key}`
        return option(choice, o.label, withStatus(filters, choice), withStatus(NO_FILTERS, choice), status === choice)
      }),
    )
  const statusItems: SelectItem[] = [
    { value: 'all', label: PAYMENT_FILTERS[0].label },
    ...[
      { label: STATUS_HEADINGS.payment, options: payments },
      { label: STATUS_HEADINGS.todo, options: others('todo') },
      { label: STATUS_HEADINGS.came, options: others('came') },
    ].filter((group) => group.options.length > 0),
  ]

  const ways = present(
    wayFilters(onlineName).map((w) =>
      w.key === 'any' ? { value: 'any', label: w.label } : option(w.key, w.label, { ...filters, way: w.key }, { ...NO_FILTERS, way: w.key }, filters.way === w.key),
    ),
  )

  const on = anyFilter(filters)
  return (
    <div role="group" aria-label="Filter registrations" className="flex flex-wrap items-center gap-2">
      <Select
        aria-label="Status"
        value={status}
        onChange={(next) => onChange(withStatus(filters, next as StatusChoice))}
        options={statusItems}
        className={status === 'all' ? selectPillClasses : selectPillOnClasses}
      />
      {ways.length > 1 && (
        <Select
          aria-label="Payment method"
          value={filters.way}
          onChange={(next) => onChange({ ...filters, way: next as WayFilter })}
          options={ways}
          className={filters.way === 'any' ? selectPillClasses : selectPillOnClasses}
        />
      )}
      {(on || searching) && (
        <>
          <ActionButton size="sm" tone="ghost" onClick={onClear}>
            Clear
          </ActionButton>
          {/* Said for a screen reader with what is chosen; for the eye the tinted pills say that already. */}
          <p role="status" className="text-label-md text-on-surface-variant">
            <span className="sr-only">{on ? `${filterWords(filters, onlineName)}: ` : ''}</span>
            Showing {shown} of {orders.length}
          </p>
        </>
      )}
    </div>
  )
}
