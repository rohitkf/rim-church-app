import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { usePwa } from '../lib/usePwa'
import { isIos, isStandalone } from '../lib/pwa'
import { ONBOARDING_KEY, fetchMyOnboarding, tourStatusOf } from '../lib/onboarding'
import { closeSetupPrompt, setupCardDue } from '../lib/gettingSetUp'
import { useLocationPermission } from '../lib/locationPermission'
import { notificationsSupported, permissionState, requestPermission, type PushPermission } from '../lib/push'
import { registerPushDevice } from '../lib/pushDevice'
import { subscribeTour } from '../lib/tour'
import { useStartTour } from '../lib/useStartTour'
import { Overlay } from './Surface'
import { BellIcon, MapPinIcon, PhoneAddIcon, SparklesIcon } from './icons'
import { InstallAppGuide } from './InstallApp'

/**
 * "A few things are left" — the card somebody gets when they have been
 * asked to finish setting up (0276, Settings › Onboarding).
 *
 * It lists what is left *on this phone*: the tour, location, notifications,
 * the app on the home screen — each with the one button that does it. It is
 * a reminder and never a door: "Not now" closes it until somebody asks
 * again. Who they are is not on it, because a blank there is asked by the
 * joining form before the app opens at all.
 *
 * It waits its turn like the other cards: not during the tour, not for an
 * Admin previewing as somebody else, not while a new version is waiting.
 * And it waits a moment before appearing, because whether location is
 * allowed is only known once the phone has answered — a card that opens
 * and shuts again within a second is worse than none.
 */

const SETTLE_MS = 1_500

function Item({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode
  title: string
  body: string
  action?: { label: string; onClick: () => void; busy?: boolean }
}) {
  return (
    <li className="flex items-start gap-3 rounded-[var(--radius-row)] bg-raised p-3">
      <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-accent-blue)_22%,transparent)] text-accent-blue-soft">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body-sm font-medium text-on-surface">{title}</p>
        <p className="mt-0.5 text-label-md text-on-surface-variant">{body}</p>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            disabled={action.busy}
            className="tap mt-2 rounded-full bg-raised-strong px-3.5 py-1.5 text-label-md font-medium text-on-surface hairline-strong disabled:opacity-50"
          >
            {action.label}
          </button>
        )}
      </div>
    </li>
  )
}

export function SetupPrompt() {
  const { profile, viewAs } = useAuth()
  const { updateReady } = usePwa()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const startTour = useStartTour()
  const location = useLocationPermission()
  const [touring, setTouring] = useState(false)
  const [settled, setSettled] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [alerts, setAlerts] = useState<PushPermission>(permissionState)
  const [asking, setAsking] = useState(false)

  useEffect(() => subscribeTour((run) => setTouring(run !== null)), [])
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(true), SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [])

  const myId = profile?.id
  const query = useQuery({
    queryKey: [...ONBOARDING_KEY, myId],
    queryFn: () => fetchMyOnboarding(myId!),
    enabled: !!myId,
  })
  const close = useMutation({
    mutationFn: closeSetupPrompt,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ONBOARDING_KEY }),
  })

  const due = !!profile?.onboarded_at && !viewAs && query.isSuccess && setupCardDue(query.data)

  const tourLeft = tourStatusOf(query.data ?? undefined).kind !== 'taken'
  const locationLeft = location !== 'granted'
  // An iPhone only takes notifications once the app is on its home screen,
  // so there the install line is the notifications line too.
  const alertsUnavailable = isIos() && !isStandalone()
  const alertsLeft = !alertsUnavailable && notificationsSupported() && alerts !== 'granted' && alerts !== 'unsupported'
  const installLeft = !isStandalone()
  const nothingLeft = !tourLeft && !locationLeft && !alertsLeft && !installLeft

  /*
   * Everything on this phone is done: the ask has served its purpose, so
   * it is closed for them rather than left to come up on another device.
   */
  const { mutate: closeNow, isIdle } = close
  useEffect(() => {
    if (due && settled && nothingLeft && isIdle) closeNow()
  }, [due, settled, nothingLeft, isIdle, closeNow])

  if (installing) return <InstallAppGuide onClose={() => setInstalling(false)} />
  if (!due || !settled || hidden || touring || updateReady || nothingLeft) return null

  const later = () => {
    setHidden(true)
    close.mutate()
  }
  const go = (to: string) => {
    setHidden(true)
    navigate(to)
  }
  const turnOnAlerts = async () => {
    setAsking(true)
    try {
      const next = await requestPermission()
      // Permission is the half the phone asks about; registering is the
      // half that lets an alert arrive while the app is shut.
      if (next === 'granted') await registerPushDevice().catch(() => false)
      setAlerts(next)
    } finally {
      setAsking(false)
    }
  }

  return (
    <Overlay onDismiss={later} label="A few things are left to set up">
      <div className="w-full max-w-[460px] rounded-[var(--radius-shell)] bg-surface-lowest p-7 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 sm:p-8 dark:ring-white/12">
        <h2 className="text-headline-md">A few things are left to set up</h2>
        <p className="mt-2 text-body-md text-on-surface-variant">
          The church has asked you to finish these on this phone. None of them stops you using the
          app — but each one is why something works on a Sunday.
        </p>
        <ul className="mt-5 flex flex-col gap-2">
          {tourLeft && (
            <Item
              icon={<SparklesIcon width={16} height={16} />}
              title="Take the tour"
              body="A walk round the pages you can open, a couple of minutes."
              action={{ label: 'Start the tour', onClick: () => { setHidden(true); startTour() } }}
            />
          )}
          {locationLeft && (
            <Item
              icon={<MapPinIcon width={16} height={16} />}
              title="Allow location"
              body="Clocking in on a Sunday needs to know this phone is at church."
              action={{ label: 'Show me how', onClick: () => go('/location') }}
            />
          )}
          {alertsLeft && (
            <Item
              icon={<BellIcon width={16} height={16} />}
              title="Turn on notifications"
              body={
                alerts === 'denied'
                  ? 'They are blocked for this site. Your browser’s site settings can undo that.'
                  : 'So a rota change or an alert reaches you while the app is shut.'
              }
              action={alerts === 'denied' ? undefined : { label: 'Turn on notifications', onClick: () => void turnOnAlerts(), busy: asking }}
            />
          )}
          {installLeft && (
            <Item
              icon={<PhoneAddIcon width={16} height={16} />}
              title="Add the app to your home screen"
              body={
                alertsUnavailable
                  ? 'Its own icon, one tap to open — and the only way notifications reach an iPhone.'
                  : 'Its own icon, no address bar, one tap to open.'
              }
              action={{ label: 'Show me how', onClick: () => setInstalling(true) }}
            />
          )}
        </ul>
        <button
          type="button"
          onClick={later}
          className="tap mt-6 w-full text-center text-label-md text-on-surface-faint hover:text-on-surface"
        >
          Not now
        </button>
      </div>
    </Overlay>
  )
}
