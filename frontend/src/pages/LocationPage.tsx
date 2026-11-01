import { useLocationPermission } from '../lib/locationPermission'
import { stepsFor, stepsForThisPhone } from '../lib/locationHelp'
import type { BrowserId, Platform } from '../lib/installGuide'
import { AllowLocation } from '../components/AllowLocation'
import { PageHeader, SectionTile } from '../components/Surface'

/**
 * Allowing location on this phone (0228) — where the "please allow
 * location" notification lands.
 *
 * It asks the phone on arrival, which is all a phone that was never asked
 * needs, and says plainly what came back (lib/locationHelp): a phone that
 * refuses without asking was blocked before, and only its settings can
 * undo that. The steps for this phone and browser come first; every other
 * kind follows, for whoever is helping somebody else.
 */

const OTHERS: { platform: Platform; browser: BrowserId; installed: boolean }[] = [
  { platform: 'ios', browser: 'safari', installed: true },
  { platform: 'ios', browser: 'safari', installed: false },
  { platform: 'ios', browser: 'chrome', installed: false },
  { platform: 'android', browser: 'chrome', installed: true },
  { platform: 'android', browser: 'chrome', installed: false },
  { platform: 'android', browser: 'samsung', installed: false },
  { platform: 'android', browser: 'firefox', installed: false },
  { platform: 'android', browser: 'inapp', installed: false },
]

export function LocationPage() {
  const known = useLocationPermission()
  const mine = stepsForThisPhone()
  const others = OTHERS.map((o) => stepsFor(o.platform, o.browser, o.installed)).filter((s) => s.title !== mine.title)

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <PageHeader
        eyebrow="This phone"
        title="Allow location"
        description="Clocking in on Sunday reads where your phone is, once, when you press CLOCK IN. It is never read in the background."
      />

      <div className="flex flex-col gap-5">
        <SectionTile title="Location on this phone">
          {known === 'granted' ? (
            <p role="status" className="text-body-md text-on-surface">
              Allowed. You are all set to clock in.
            </p>
          ) : (
            <AllowLocation autoAsk showSteps="always" size="md" linkToSteps={false} />
          )}
        </SectionTile>

        {known !== 'granted' && (
          <SectionTile title="Other phones and browsers" collapsible defaultOpen={false}>
            <div className="flex flex-col gap-4">
              {others.map((s) => (
                <div key={s.title}>
                  <p className="text-body-sm font-medium text-on-surface">{s.title}</p>
                  <ol className="mt-1 list-decimal pl-5 text-body-sm text-on-surface-variant marker:text-on-surface-faint">
                    {s.steps.map((step) => (
                      <li key={step} className="py-0.5">
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </SectionTile>
        )}
      </div>
    </div>
  )
}
