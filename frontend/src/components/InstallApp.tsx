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
  GUIDE_ORDER,
  detectEnvironment,
  type GuideId,
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
 * So it sits in the header instead, beside the two toggles, and it keeps
 * catching the light for as long as the offer stands. It disappears the
 * moment the app is running from the home screen, because at that point it
 * is advice somebody has already taken — and that, rather than "you have
 * looked at this once", is the thing worth switching the animation off.
 */

const PLATFORM_ICONS: Record<Platform, typeof PhoneAddIcon> = {
  ios: ShareIosIcon,
  android: DotsVerticalIcon,
  desktop: MonitorDownIcon,
}

/**
 * The header button. Absent once installed — `installed` is display-mode
 * standalone, which is exactly the question "are they using it as an app".
 */
export function InstallAppBadge() {
  const { installed } = usePwa()
  const [open, setOpen] = useState(false)

  if (installed) return null

  return (
    <>
      {/*
        Two animations, and neither of them stops.

        The glow breathes around the outside on a four-second cycle; the
        glisten is a narrow band of light that crosses the face of it in
        the first half of one and waits out the rest. Two small movements
        at different rates get noticed; one movement repeated at one rate
        is a warning light. Both are the quietest version
        of themselves that still reads as alive — see the keyframes in
        index.css — and both end the moment the app is installed, which
        is when this button stops existing.

        This used to stop after the guide had been opened once, on the
        grounds that a thing which keeps moving at you is nagging. But
        opening the directions is not installing the app: whoever read
        them and did not follow through is exactly the person the button
        is still for, and for them it had gone quiet for good.
      */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Add this app to your home screen"
        aria-label="Install app"
        className="glisten install-glow tap relative flex h-10 shrink-0 items-center gap-1.5 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--color-accent-blue)_18%,transparent)] px-2.5 text-accent-blue-soft transition-colors duration-300 hover:bg-[color-mix(in_oklab,var(--color-accent-blue)_28%,transparent)] hover:text-on-surface sm:h-9 sm:px-3"
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
  // Read once: the browser does not change under somebody's hands.
  const [here] = useState(detectEnvironment)
  const [guideId, setGuideId] = useState<GuideId>(here.guide)
  const [picking, setPicking] = useState(false)
  const [landed, setLanded] = useState(false)
  const guide = GUIDES[guideId]
  const Icon = PLATFORM_ICONS[guide.platform]

  useEffect(() => {
    const id = window.setTimeout(() => setLanded(true), 20)
    return () => window.clearTimeout(id)
  }, [])

  // Chromium can do the whole thing on a tap. Only ever offered while the
  // steps on screen are the ones for the browser we are actually in: an
  // "Install now" button under the iPhone steps would install it on the
  // laptop reading them.
  const canInstallHere = installPrompt !== null && guideId === here.guide

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

          {/*
            Which browser these steps are for, said out loud.
            
            The directions used to be chosen by platform alone and headed
            "In Chrome" whatever you were holding. Naming what we detected
            does two things: it is right for almost everybody without a
            tap, and when it is wrong it is visibly wrong, which is what
            the button beside it is for.
          */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[var(--radius-chip)] bg-surface-container px-4 py-3">
            <span className="flex min-w-0 items-center gap-2.5">
              <Icon width={15} height={15} aria-hidden="true" className="shrink-0 text-on-surface-faint" />
              <span className="min-w-0 text-body-sm text-on-surface">
                {guideId === here.guide ? (
                  <>
                    Steps for <strong className="font-medium">{here.name}</strong>
                  </>
                ) : (
                  <>
                    Steps for{' '}
                    <strong className="font-medium">
                      {guide.label} · {guide.group}
                    </strong>
                  </>
                )}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setPicking((was) => !was)}
              aria-expanded={picking}
              aria-controls="install-guide-picker"
              className="tap shrink-0 rounded-full px-2.5 py-1 text-label-md font-medium text-secondary hover:underline"
            >
              {picking ? 'Never mind' : 'Not this one?'}
            </button>
          </div>

          {/* Every set, for the person whose browser we guessed wrong —
              and for a head walking a volunteer through it on a Sunday,
              who needs the other device's steps without borrowing it. */}
          <div id="install-guide-picker" hidden={!picking} className="mt-3">
            {GROUPS.map((group) => (
              <div key={group} className="mt-3 first:mt-0">
                <p className="font-mono text-label-sm uppercase tracking-[0.14em] text-on-surface-faint">
                  {group}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {GUIDE_ORDER.filter((id) => GUIDES[id].group === group).map((id) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={id === guideId}
                      onClick={() => {
                        setGuideId(id)
                        setPicking(false)
                      }}
                      className={`tap rounded-full px-3 py-1.5 text-label-md transition-colors duration-300 ${
                        id === guideId
                          ? 'bg-primary font-medium text-on-primary'
                          : 'bg-raised text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      {GUIDES[id].label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <ol className="mt-5 flex flex-col gap-4">
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

/** The device families, in the order the picker lists them. */
const GROUPS = [...new Set(GUIDE_ORDER.map((id) => GUIDES[id].group))]
