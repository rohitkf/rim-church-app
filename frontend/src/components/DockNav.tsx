import { useState } from 'react'
import type { ComponentType, ReactNode, SVGProps } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { MoreIcon } from './icons'
import { Overlay } from './Surface'

export interface DockItem {
  to: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  /** A small dot on the icon: something here wants attention. */
  badge?: boolean
}

/**
 * How many destinations the bar itself carries on a phone.
 *
 * The rest go behind More. Three is what survives the widest label
 * ("Service Planner") being spelled out next to two icons and the More
 * button on a 360px screen, which is the narrowest phone worth designing
 * for.
 */
const PHONE_SLOTS = 3

/**
 * The floating dock.
 *
 * Navigation is a single object hovering over the content rather than a
 * column beside it: it costs no horizontal space, it sits where a thumb
 * already is on a phone, and the destination you are on is the only one
 * wearing a label — which is what lets the others be icons alone without
 * the row becoming a puzzle.
 *
 * A phone cannot hold nine of those at once. It used to try, in a strip
 * that scrolled sideways with its scrollbar hidden, which meant four
 * destinations existed only for whoever thought to swipe a bar that gave
 * no sign it could be swiped. So below `md` the bar carries the first few
 * and More opens the rest as a sheet — always including wherever you are,
 * so the dock still answers "where am I" from any page.
 */
export function DockNav({
  items,
  trailing,
  label = 'Main',
}: {
  items: DockItem[]
  /** The assistant, or anything else that is not a destination. */
  trailing?: ReactNode
  label?: string
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  const { pathname } = useLocation()

  const isCurrent = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to))
  const activeIndex = items.findIndex((item) => isCurrent(item.to))

  // The bar keeps a fixed number of slots on a phone. When you are
  // somewhere that would not have made the cut, it takes the last slot
  // rather than being added to them — a dock that grows by one on certain
  // pages is a dock that jumps.
  const overflowActive = activeIndex >= PHONE_SLOTS
  const onPhoneBar = (index: number) =>
    index === activeIndex || (index < PHONE_SLOTS && !(overflowActive && index === PHONE_SLOTS - 1))

  return (
    <nav
      aria-label={label}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
    >
      <div className="pointer-events-auto flex max-w-full items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--color-surface-container)_88%,transparent)] p-2.5 shadow-[inset_0_0_0_1px_var(--color-outline-variant),var(--shadow-lifted)] backdrop-blur-2xl">
        {items.map((item, index) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              title={item.label}
              className={({ isActive }) =>
                [
                  'group/dock relative h-11 shrink-0 items-center justify-center gap-2 rounded-full transition-all duration-500 ease-[var(--ease-glide)]',
                  onPhoneBar(index) ? 'flex' : 'hidden md:flex',
                  isActive
                    ? 'bg-primary px-4 text-on-primary'
                    : 'w-11 text-on-surface-variant hover:bg-raised-strong hover:text-on-surface',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="shrink-0" width={19} height={19} />
                  {/* Only the current destination spells its name, so the
                      dock stays one line however much the app grows. */}
                  {isActive && <span className="whitespace-nowrap text-label-md">{item.label}</span>}
                  {item.badge && !isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-accent-orange"
                    />
                  )}
                </>
              )}
            </NavLink>
          )
        })}

        {/* Everything the bar could not hold, plus whatever is trailing —
            the assistant has no room on a phone bar either. */}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-label="More"
          aria-expanded={moreOpen}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors duration-300 ease-[var(--ease-glide)] hover:bg-raised-strong hover:text-on-surface md:hidden"
        >
          <MoreIcon width={19} height={19} />
        </button>

        {trailing && (
          <>
            <span aria-hidden="true" className="mx-1 hidden h-7 w-px shrink-0 bg-outline-variant md:block" />
            <span className="hidden md:contents">{trailing}</span>
          </>
        )}
      </div>

      {moreOpen && (
        <Overlay label="All destinations" align="sheet" onDismiss={() => setMoreOpen(false)}>
          <div className="pointer-events-auto w-full rounded-t-[var(--radius-card)] bg-surface-lowest p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[inset_0_0_0_1px_var(--color-outline-variant),var(--shadow-lifted)] sm:max-w-sm sm:rounded-[var(--radius-card)] sm:pb-5">
            <div
              aria-hidden="true"
              className="mx-auto mb-4 h-1 w-9 rounded-full bg-outline-variant sm:hidden"
            />
            <ul className="flex flex-col gap-1">
              {items.map((item) => {
                const Icon = item.icon
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      // The sheet has done its job once you have picked
                      // something out of it.
                      onClick={() => setMoreOpen(false)}
                      className={({ isActive }) =>
                        [
                          'flex min-h-12 items-center gap-3 rounded-[var(--radius-chip)] px-3 text-body-md transition-colors duration-300 ease-[var(--ease-glide)]',
                          isActive
                            ? 'bg-primary text-on-primary'
                            : 'text-on-surface hover:bg-raised-strong',
                        ].join(' ')
                      }
                    >
                      <Icon className="shrink-0" width={19} height={19} />
                      {item.label}
                      {item.badge && (
                        <span
                          aria-hidden="true"
                          className="ml-auto h-2 w-2 rounded-full bg-accent-orange"
                        />
                      )}
                    </NavLink>
                  </li>
                )
              })}
            </ul>
            {trailing && <div className="mt-3 flex justify-center border-t border-outline-variant pt-3">{trailing}</div>}
          </div>
        </Overlay>
      )}
    </nav>
  )
}
