import { useEffect } from 'react'
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { SERVING_TABS } from '../lib/serving'
import { usePageAccess } from '../lib/usePageAccess'

/**
 * The three steps of serving, as tabs across the top of each.
 *
 * Numbered, because the order is the point: the rota is built from the
 * answers, and a checklist exists only for somebody the rota put on. Only
 * the steps this person may open are offered; with one left there is
 * nothing to switch between, so no strip is drawn at all.
 */
export function ServingTabs() {
  const { canOpen } = usePageAccess()
  const tabs = SERVING_TABS.filter((tab) => canOpen(tab.to))
  if (tabs.length < 2) return null

  return (
    <nav aria-label="Serving" className="mb-6">
      {/* All three fit a 360px phone side by side: tight padding there,
          roomier from sm up. */}
      <ol className="flex w-full gap-0.5 rounded-full bg-inset p-1 hairline sm:inline-flex sm:w-auto sm:gap-1">
        {tabs.map((tab, index) => (
          <li key={tab.to} className="min-w-0 flex-1 sm:flex-none">
            <NavLink
              to={tab.to}
              title={tab.hint}
              className={({ isActive }) =>
                `tap flex items-center justify-center gap-1.5 rounded-full px-2 py-2 text-label-md sm:gap-2 sm:px-4 transition-colors duration-300 ease-[var(--ease-glide)] ${
                  isActive ? 'bg-primary font-medium text-on-primary' : 'text-on-surface-variant hover:text-on-surface'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    aria-hidden="true"
                    // On the narrowest phones the words matter more than
                    // the numbers; the order still reads left to right.
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-label-sm max-[379px]:hidden ${
                      isActive ? 'bg-on-primary/20' : 'bg-raised-strong'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="truncate whitespace-nowrap">{tab.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ol>
    </nav>
  )
}

const LAST_TAB = 'rim-serving-tab'

function lastTab(): string | null {
  try {
    return window.sessionStorage.getItem(LAST_TAB)
  } catch {
    return null
  }
}

/** The tabs above whichever of the three pages is open. */
export function ServingLayout() {
  const { pathname } = useLocation()
  // Remembered for this visit, so Serving in the menu brings you back to
  // the step you were on rather than to the first one every time.
  useEffect(() => {
    try {
      window.sessionStorage.setItem(LAST_TAB, pathname)
    } catch {
      // Private mode or blocked storage: Serving opens on the first step.
    }
  }, [pathname])
  return (
    <>
      <ServingTabs />
      <Outlet />
    </>
  )
}

/**
 * The menu's Serving entry: the first step this person may take.
 *
 * Back to the step they were last on, this visit; otherwise somebody on
 * a team starts where serving starts, with their answers, and a Church
 * Member the rota has been opened to starts on the rota, the only step
 * that is theirs.
 */
export function ServingStart() {
  const { canOpen, settled } = usePageAccess()
  if (!settled) return <p className="text-body-sm text-on-surface-variant">Loading…</p>
  const last = lastTab()
  const back = SERVING_TABS.find((tab) => tab.to === last && canOpen(tab.to))
  const first = back ?? SERVING_TABS.find((tab) => canOpen(tab.to))
  return <Navigate to={first?.to ?? '/'} replace />
}
