import { useLayoutEffect, useRef, useState } from 'react'
import type { ComponentType, ReactNode, SVGProps } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { MoreIcon } from './icons'
import { Overlay } from './Surface'
import { dockWindow } from '../lib/dockWindow'

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
 * A phone cannot hold twelve of those at once. It used to try, in a strip
 * that scrolled sideways with its scrollbar hidden, which meant most
 * destinations existed only for whoever thought to swipe a bar that gave
 * no sign it could be swiped. So below `md` the bar carries a few and
 * More opens the rest as a sheet.
 *
 * The few it carries slide with you rather than being the first three:
 * see lib/dockWindow. Standing on the third destination used to show
 * nothing at all to the right of you, so the only way onwards was to open
 * a menu and read it — while the bar sat there with two thirds of the app
 * one step away and no way to take the step.
 *
 * ## The blue thing that moves
 *
 * The highlight behind the current destination is one element, not a
 * background on each link. It measures where it has to be and travels
 * there, stretching along the way — leading edge first, trailing edge
 * catching up — so it reads as one thing flowing into the next rather
 * than a colour being switched off here and on over there. The label
 * fades in once it has arrived, which is what stops the pill sprinting
 * and the word appearing mid-flight.
 *
 * It settles with a little overshoot. That is the whole trick: a pill
 * that eases to a stop looks like a slider, and one that spills a few
 * pixels past and comes back looks like liquid.
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
  const barRef = useRef<HTMLDivElement>(null)
  /** Where the highlight is, in pixels along the bar. */
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)
  const [travelling, setTravelling] = useState(false)
  /** The last place we measured, so a re-render is not a journey. */
  const measured = useRef<{ left: number; width: number } | null>(null)

  const isCurrent = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to))
  const activeIndex = items.findIndex((item) => isCurrent(item.to))

  // The window that slides. Always the same number of slots, so the dock
  // never grows or shrinks as you walk along it.
  const shown = new Set(dockWindow(items.length, activeIndex, PHONE_SLOTS))
  const onPhoneBar = (index: number) => shown.has(index)

  /*
   * Measure, then move.
   *
   * The link's own box is the truth — it changes width when it takes the
   * label, and it moves when the window slides under it — so the pill
   * follows the layout rather than a copy of the rules that made it.
   * Layout effect, not effect: this runs before the browser paints, so
   * the pill is never seen a frame behind the thing it is meant to be on.
   */
  useLayoutEffect(() => {
    const bar = barRef.current
    const target = bar?.querySelector('[data-dock-active="true"]')
    if (!bar || !(target instanceof HTMLElement)) {
      setPill(null)
      return
    }
    const next = { left: target.offsetLeft, width: target.offsetWidth }
    const last = measured.current
    if (last && last.left === next.left && last.width === next.width) return

    // Only stretch when it is actually going somewhere: the first
    // measurement should place the pill, not launch it across the bar.
    // Held in a ref rather than read back out of state, so this decision
    // is made once — a setState inside another one's updater is a side
    // effect in a place React is allowed to run twice.
    if (last) setTravelling(true)
    measured.current = next
    setPill(next)
  }, [pathname, items.length, activeIndex])

  useLayoutEffect(() => {
    if (!travelling) return
    const id = window.setTimeout(() => setTravelling(false), 520)
    return () => window.clearTimeout(id)
  }, [travelling, pill])

  return (
    <nav
      aria-label={label}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
    >
      <div
        ref={barRef}
        className="pointer-events-auto relative flex max-w-full items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--color-surface-container)_88%,transparent)] p-2.5 shadow-[inset_0_0_0_1px_var(--color-outline-variant),var(--shadow-lifted)] backdrop-blur-2xl"
      >
        {/*
          The highlight, as one travelling object.
          
          `left` is animated rather than `transform` on purpose: the width
          changes at the same time (a pill wearing a label is wider than
          one that is not), and animating both as geometry keeps the two
          edges honest — a translate plus a scale would smear the round
          ends into ovals halfway across.
          
          The stretch is a scale applied only while it is in flight, from
          the edge it is leaving, so the shape reaches ahead of itself and
          gathers up behind. Cheap, and it is the whole illusion.
        */}
        {pill && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-2.5 h-11 rounded-full bg-primary shadow-[0_6px_18px_-6px_color-mix(in_oklab,var(--color-primary)_75%,transparent)]"
            style={{
              left: pill.left,
              width: pill.width,
              transform: travelling ? 'scaleX(1.08)' : 'scaleX(1)',
              transition:
                'left 520ms cubic-bezier(0.32, 1.42, 0.4, 1), width 520ms cubic-bezier(0.32, 1.42, 0.4, 1), transform 520ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        )}

        {items.map((item, index) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              title={item.label}
              // What the pill measures itself against.
              data-dock-active={isCurrent(item.to) ? 'true' : undefined}
              className={({ isActive }) =>
                [
                  'group/dock relative z-10 h-11 items-center justify-center gap-2 rounded-full transition-[color,background-color,width] duration-500 ease-[var(--ease-glide)]',
                  onPhoneBar(index) ? 'flex dock-slot' : 'hidden md:flex',
                  isActive
                    ? // No background of its own — the travelling pill is
                      // behind it, and two blues would fight.
                      'min-w-0 px-4 text-on-primary'
                    : 'w-11 shrink-0 text-on-surface-variant hover:bg-raised-strong hover:text-on-surface',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="shrink-0" width={19} height={19} />
                  {/* Only the current destination spells its name, so the
                      dock stays one line however much the app grows. */}
                  {isActive && (
                    // The one thing in the bar allowed to give, so a narrow
                    // phone loses a few letters of a label it can still read
                    // from the page rather than losing the More button off
                    // the edge entirely.
                    //
                    // It arrives after the pill does. A word appearing
                    // mid-flight reads as the highlight chasing the label;
                    // this way the label lands in something already there.
                    <span
                      className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-label-md transition-opacity duration-300"
                      style={{ opacity: travelling ? 0 : 1 }}
                    >
                      {item.label}
                    </span>
                  )}
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
            {/*
              An ordinary flex item, not `display: contents`.

              Contents was the tidier way to hang the assistant off the end
              of the bar — the wrapper vanishes and the button becomes a
              child of the row directly. But a box that is not there is a
              box that cannot be hit: WebKit has never reliably hit-tested
              through one, so Ask took focus and answered the keyboard
              while ignoring every click, which is precisely how it was
              reported. A wrapper that is really there costs nothing —
              it shrink-wraps the button and the row spaces it the same.

              `relative z-10` for the same reason the links carry it: the
              travelling pill is positioned, so anything unpositioned in
              this bar paints beneath it.
            */}
            <span className="relative z-10 hidden shrink-0 items-center md:flex">{trailing}</span>
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
