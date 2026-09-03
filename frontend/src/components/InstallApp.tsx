import { useEffect, useState } from 'react'
import { Overlay } from './Surface'
import {
  CloseIcon,
  DotsVerticalIcon,
  MonitorDownIcon,
  PhoneAddIcon,
  ShareIosIcon,
} from './icons'
import { promptInstall } from '../lib/pwa'
import { usePwa } from '../lib/usePwa'
import {
  GUIDES,
  detectPlatform,
  hasSeenInstallGuide,
  markInstallGuideSeen,
  type Platform,
} from '../lib/installGuide'

/**
 * Getting the app onto a home screen.
 *
 * Most of the church opens this in a browser tab and never learns that it
 * can be an app — which costs them the icon, the full screen, and on an
 * iPhone notifications altogether, since Apple sends none to a site that
 * has not been installed. Nothing in the app said so: the offer was one
 * line inside the account menu, which is the last place somebody who does
 * not know the feature exists would go looking for it.
 *
 * So it sits in the header instead, beside the two toggles, and it glows
 * until it has been opened. It disappears the moment the app is running
 * from the home screen, because at that point it is advice somebody has
 * already taken.
 */

const PLATFORM_ICONS: Record<Platform, typeof PhoneAddIcon> = {
  ios: ShareIosIcon,
  android: DotsVerticalIcon,
  desktop: MonitorDownIcon,
}

const ORDER: Platform[] = ['android', 'ios', 'desktop']

/**
 * The header button. Absent once installed — `installed` is display-mode
 * standalone, which is exactly the question "are they using it as an app".
 */
export function InstallAppBadge() {
  const { installed } = usePwa()
  const [open, setOpen] = useState(false)
  // Read once, on mount: storage that changes underneath us is not worth a
  // subscription, and the glow is a nudge rather than state.
  const [glow, setGlow] = useState(() => !hasSeenInstallGuide())

  const show = () => {
    setOpen(true)
    setGlow(false)
    markInstallGuideSeen()
  }

  if (installed) return null

  return (
    <>
      <button
        type="button"
        onClick={show}
        title="Add this app to your home screen"
        aria-label="Install app"
        className={`tap flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--color-accent-blue)_18%,transparent)] px-2.5 text-accent-blue-soft transition-colors duration-300 hover:bg-[color-mix(in_oklab,var(--color-accent-blue)_28%,transparent)] hover:text-on-surface sm:h-9 sm:px-3 ${
          glow ? 'install-glow' : ''
        }`}
      >
        <PhoneAddIcon width={17} height={17} aria-hidden="true" />
        <span className="hidden text-label-sm font-medium sm:inline">Install app</span>
      </button>

      {open && <InstallAppGuide onClose={() => setOpen(false)} />}
    </>
  )
}

/**
 * The directions themselves.
 *
 * Three tabs rather than one set of steps, because the person holding the
 * phone is often not the person reading the screen — a head walking a
 * volunteer through it on a Sunday needs to be able to reach the other
 * platform's steps without borrowing their device.
 */
export function InstallAppGuide({ onClose }: { onClose: () => void }) {
  const { installPrompt } = usePwa()
  const here = detectPlatform()
  const [platform, setPlatform] = useState<Platform>(here)
  const [landed, setLanded] = useState(false)
  const guide = GUIDES[platform]

  useEffect(() => {
    const id = window.setTimeout(() => setLanded(true), 20)
    return () => window.clearTimeout(id)
  }, [])

  // Chromium can do the whole thing on a tap. Only ever offered on the
  // device we are actually on: an "Install now" button under the iPhone
  // steps would install it on the laptop reading them.
  const canInstallHere = installPrompt !== null && platform === here

  return (
    <Overlay onDismiss={onClose} label="How to install the app" align="sheet">
      <div
        className={`sheen relative w-full max-w-lg overflow-hidden rounded-t-[var(--radius-shell)] bg-surface-lowest shadow-[var(--shadow-lifted)] ring-1 ring-black/10 transition-all duration-500 ease-[var(--ease-glide)] sm:rounded-[var(--radius-shell)] dark:ring-white/12 ${
          landed ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
        }`}
      >
        <div className="max-h-[85vh] overflow-y-auto p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:p-7">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-accent-blue)_22%,transparent)] text-accent-blue-soft"
            >
              <PhoneAddIcon width={20} height={20} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-headline-sm">Keep this on your home screen</h2>
              <p className="mt-1.5 text-body-sm text-on-surface-variant">
                It becomes a proper app: its own icon, no address bar, opens in one tap — and it is
                the only way notifications reach an iPhone.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="tap -mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
            >
              <CloseIcon width={17} height={17} aria-hidden="true" />
            </button>
          </div>

          {canInstallHere && (
            <div className="mt-5 rounded-[var(--radius-chip)] bg-secondary-container p-4">
              <p className="text-body-sm text-on-surface">
                Your browser can do this for you — no steps needed.
              </p>
              <button
                type="button"
                onClick={() => void promptInstall()}
                className="mt-3 rounded-full bg-primary px-5 py-2.5 text-body-sm font-medium text-on-primary shadow-[var(--shadow-ambient)] transition-transform duration-500 ease-[var(--ease-glide)] active:scale-[0.98]"
              >
                Install now
              </button>
              <p className="mt-3 text-label-sm text-on-surface-faint">
                If nothing happens, or you would rather see where it lives, the steps are below.
              </p>
            </div>
          )}

          {/* Which device the steps are for. The one you are holding comes
              preselected, so most people never touch this row. */}
          <div
            role="tablist"
            aria-label="Choose your device"
            className="mt-5 flex gap-1 rounded-full hairline p-1"
          >
            {ORDER.map((key) => {
              const Icon = PLATFORM_ICONS[key]
              const active = key === platform
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPlatform(key)}
                  className={`tap flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-label-sm transition-colors duration-300 ${
                    active
                      ? 'bg-primary font-medium text-on-primary'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <Icon width={14} height={14} aria-hidden="true" />
                  {GUIDES[key].label}
                </button>
              )
            })}
          </div>

          <p className="mt-4 text-label-sm uppercase tracking-wide text-on-surface-faint">
            In {guide.browser}
          </p>

          <ol className="mt-3 flex flex-col gap-4">
            {guide.steps.map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-container text-label-sm font-medium tabular text-on-surface-variant"
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-body-sm font-medium text-on-surface">{step.title}</p>
                  <p className="mt-0.5 text-body-sm text-on-surface-variant">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>

          {guide.footnote && (
            <p className="mt-5 rounded-[var(--radius-chip)] bg-surface-container p-4 text-body-sm text-on-surface-variant">
              {guide.footnote}
            </p>
          )}

          <button
            type="button"
            onClick={onClose}
            className="mt-6 w-full rounded-full bg-surface-container px-5 py-2.5 text-body-sm font-medium text-on-surface transition-transform duration-500 ease-[var(--ease-glide)] active:scale-[0.98]"
          >
            Done
          </button>
        </div>
      </div>
    </Overlay>
  )
}
