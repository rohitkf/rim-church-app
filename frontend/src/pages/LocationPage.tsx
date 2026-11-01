import { useEffect, useRef, useState } from 'react'
import { detectEnvironment } from '../lib/installGuide'
import { reportLocation, useLocationPermission } from '../lib/locationPermission'
import { ALLOW_STEPS } from '../lib/locationAccess'
import { ActionButton, PageHeader, SectionTile } from '../components/Surface'

/**
 * Allowing location on this phone (0228) — where the "please allow
 * location" notification lands.
 *
 * One button that asks the phone, which is all a phone that has never been
 * asked needs; and, for a phone that said no, the steps to undo it, this
 * phone's kind first. Asking reads the position once and keeps nothing:
 * the yes or no is what the app remembers.
 */
export function LocationPage() {
  const known = useLocationPermission()
  const platform = detectEnvironment().platform
  const [asking, setAsking] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const supported = typeof navigator !== 'undefined' && !!navigator.geolocation

  const ask = () => {
    if (!supported) return
    setAsking(true)
    setFailed(null)
    navigator.geolocation.getCurrentPosition(
      () => {
        setAsking(false)
        reportLocation('granted')
      },
      (err) => {
        setAsking(false)
        if (err.code === err.PERMISSION_DENIED) reportLocation('denied')
        else setFailed('The phone could not find where it is just now. Check Location is on, then try again.')
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    )
  }

  // Asked once on arrival: on an iPhone that is the only way to learn the
  // answer, and a phone never asked shows its own Allow message straight away.
  const askedOnce = useRef(false)
  useEffect(() => {
    if (askedOnce.current || known === 'granted') return
    askedOnce.current = true
    ask()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const order: ('ios' | 'android')[] = platform === 'android' ? ['android', 'ios'] : ['ios', 'android']

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <PageHeader
        eyebrow="This phone"
        title="Allow location"
        description="Clocking in on Sunday reads where your phone is, once, when you press CLOCK IN. It is never read in the background."
      />

      <div className="flex flex-col gap-5">
        <SectionTile title="Location on this phone">
          <p role="status" className="text-body-md text-on-surface">
            {known === 'granted'
              ? 'Allowed. You are all set to clock in.'
              : known === 'denied'
                ? 'Blocked. Follow the steps below to allow it, then press Allow location.'
                : supported
                  ? 'Not allowed yet. Press Allow location, then choose Allow on the message your phone shows.'
                  : 'This browser cannot read location. Open the app in Safari on an iPhone, or Chrome on Android.'}
          </p>
          {failed && (
            <p role="alert" className="mt-2 text-body-sm text-accent-red-soft">
              {failed}
            </p>
          )}
          {known !== 'granted' && supported && (
            <div className="mt-3">
              <ActionButton onClick={ask} disabled={asking}>
                {asking ? 'Asking the phone…' : 'Allow location'}
              </ActionButton>
            </div>
          )}
        </SectionTile>

        {known !== 'granted' &&
          order.map((kind) => (
            <SectionTile key={kind} title={ALLOW_STEPS[kind].title}>
              <ol className="list-decimal pl-5 text-body-sm text-on-surface-variant marker:text-on-surface-faint">
                {ALLOW_STEPS[kind].steps.map((step) => (
                  <li key={step} className="py-0.5">
                    {step}
                  </li>
                ))}
              </ol>
            </SectionTile>
          ))}
      </div>
    </div>
  )
}
