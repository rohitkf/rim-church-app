import { Tile } from './Surface'
import { HEAD_ON_PAGE, ON_CARD } from '../lib/stickyHead'
import { pounds } from '../lib/money'
import { amountWords, ticketBreakdown } from '../lib/registrationBreakdown'
import type { OrderRow } from '../lib/registrations'

// The sticking and the colour are written on each heading itself: stickyHead.test.tsx reads the cells.
const HEAD = 'py-2 font-mono text-label-sm font-normal uppercase tracking-wide text-on-surface-variant'
const NUMBER = 'w-16 whitespace-nowrap py-2 pl-3 text-right font-mono text-label-md tabular'
const AMOUNT = 'hidden whitespace-nowrap py-2 pl-4 text-right font-mono text-label-md tabular sm:table-cell'

/**
 * An event's tickets by how each is paid for (lib/registrationBreakdown):
 * free with a code, and for each way of paying what is in, what has a
 * receipt to check and what is not paid yet.
 *
 * A table, because it is one: the same three things said of every line.
 * It is never wider than its place — on a phone the money goes under the
 * line's name instead of in a fourth column — so nothing here scrolls
 * sideways and the headings stay under the app's top strip
 * (lib/stickyHead). Nothing is drawn for an event nobody has registered
 * for.
 */
export function RegistrationBreakdown({ orders }: { orders: readonly OrderRow[] }) {
  const { groups, orders: allOrders, tickets } = ticketBreakdown(orders)
  if (groups.length === 0) return null

  return (
    <section aria-labelledby="breakdown-heading" className="mt-8">
      <h2 id="breakdown-heading" className="text-headline-md text-on-surface">
        How the tickets are paid for
      </h2>
      <p className="mt-1 text-body-sm text-on-surface-variant">Every live registration, counted once. Cancelled ones are left out.</p>
      <Tile className="mt-3">
        <table className="w-full border-collapse text-left text-body-sm">
          <thead>
            <tr>
              <th scope="col" className={`${HEAD} pr-2 ${HEAD_ON_PAGE} ${ON_CARD}`}>
                How
              </th>
              <th scope="col" className={`${HEAD} w-16 pl-3 text-right ${HEAD_ON_PAGE} ${ON_CARD}`}>
                Orders
              </th>
              <th scope="col" className={`${HEAD} w-16 pl-3 text-right ${HEAD_ON_PAGE} ${ON_CARD}`}>
                Tickets
              </th>
              <th scope="col" className={`${HEAD} hidden pl-4 text-right sm:table-cell ${HEAD_ON_PAGE} ${ON_CARD}`}>
                Money
              </th>
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.key} className="border-b border-border-subtle">
              <tr>
                <th scope="rowgroup" className="pb-1 pr-2 pt-3 font-semibold text-on-surface">
                  {group.title}
                </th>
                <td className={`${NUMBER} pb-1 pt-3 font-semibold text-on-surface`}>{group.orders}</td>
                <td className={`${NUMBER} pb-1 pt-3 font-semibold text-on-surface`}>{group.tickets}</td>
                <td className={`${AMOUNT} pb-1 pt-3`} />
              </tr>
              {group.lines.map((line) => {
                const amount = amountWords(line, pounds)
                return (
                  <tr key={line.key}>
                    <th scope="row" className="py-2 pl-3 pr-2 font-normal text-on-surface-variant">
                      {line.label}
                      {/* On a phone the money sits here: a fourth column would not fit beside the name. */}
                      {amount && <span className="block font-mono text-label-sm text-on-surface-faint sm:hidden">{amount}</span>}
                    </th>
                    <td className={`${NUMBER} text-on-surface-variant`}>{line.orders}</td>
                    <td className={`${NUMBER} text-on-surface-variant`}>{line.tickets}</td>
                    <td className={`${AMOUNT} text-on-surface-variant`}>{amount}</td>
                  </tr>
                )
              })}
            </tbody>
          ))}
          <tfoot>
            <tr>
              <th scope="row" className="pr-2 pt-3 font-semibold text-on-surface">
                All live registrations
              </th>
              <td className={`${NUMBER} pb-0 pt-3 font-semibold text-on-surface`}>{allOrders}</td>
              <td className={`${NUMBER} pb-0 pt-3 font-semibold text-on-surface`}>{tickets}</td>
              <td className={`${AMOUNT} pb-0 pt-3`} />
            </tr>
          </tfoot>
        </table>
      </Tile>
    </section>
  )
}
