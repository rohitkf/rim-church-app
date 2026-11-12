import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { isStandalone } from '../lib/pwa'
import { iconUrl } from '../lib/appIcon'
import { detectEnvironment } from '../lib/installGuide'
import { fetchPublishedIdentity, identityNotice, noticeWords, readKnownIdentity, rememberIdentity, type Known } from '../lib/installedIdentity'
import { CloseIcon, ImageIcon } from './icons'

/**
 * "The app has a new icon", said once on a device that already has the
 * app, in that device's terms (lib/installedIdentity).
 *
 * An installed app's icon and name are the device's own copy. Android and
 * a computer change them by themselves, in their own time, and ask first;
 * an iPhone never does. Nothing a page can call hurries any of them — so
 * this says what has changed, shows the new icon, and says what this
 * device will do about it or what the person has to. It sits with the
 * church's notices, above the page and never over it, and "Got it" puts
 * it away for good: the app cannot see the Home Screen, so it cannot know
 * when the change has landed, and will not ask twice.
 */
export function AppIdentityNotice() {
  // Running as the installed app, from the start: a tab that has just been told "installed" is not one.
  const [installed] = useState(isStandalone)
  const [known, setKnown] = useState<Known>(readKnownIdentity)
  const [openedAt] = useState(() => Date.now())
  const [env] = useState(detectEnvironment)
  const [showSteps, setShowSteps] = useState(false)
  const published = useQuery({
    queryKey: ['published-identity'],
    queryFn: fetchPublishedIdentity,
    // An installed app stays open for days: look again now and then, and when somebody comes back to it.
    staleTime: 60 * 60_000,
    enabled: installed,
  })
  const current = published.data ?? null
  const decision = identityNotice({ installed, current, known, now: openedAt })

  // Nothing to say and nothing remembered: note what this device has, so the next change is noticed.
  useEffect(() => {
    if (decision.remember && current) rememberIdentity(current)
  }, [decision.remember, current])

  if (!decision.change || !current) return null
  const words = noticeWords(decision.change, env, window.location.host)
  const gotIt = () => {
    rememberIdentity(current)
    setKnown(current)
  }

  return (
    <div
      role="note"
      aria-label={words.title}
      className="mb-4 flex items-start gap-3 rounded-[var(--radius-row)] bg-[color-mix(in_oklab,var(--color-accent-blue)_9%,var(--color-surface-lowest))] px-4 py-3 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent-blue)_26%,transparent)]"
    >
      {decision.change !== 'name' && current.set ? (
        <img
          src={iconUrl(current.set, 'icon-192.png')}
          alt="The new icon"
          width={40}
          height={40}
          className="mt-0.5 h-10 w-10 shrink-0 rounded-[22%] hairline"
          // A picture that will not load says nothing rather than a broken frame.
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      ) : (
        <ImageIcon className="mt-0.5 shrink-0 text-accent-blue-soft" width={18} height={18} />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-mono text-eyebrow uppercase text-accent-blue-soft">This device</p>
        <p className="mt-0.5 break-words text-body-md font-medium text-on-surface">
          {words.title}
          {decision.change !== 'icon' && (current.shortName ?? current.name) ? `: ${current.shortName ?? current.name}` : ''}
        </p>
        <p className="mt-0.5 break-words text-body-sm text-on-surface-variant">{words.body}</p>
        {words.steps.length > 0 && showSteps && (
          <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-body-sm text-on-surface">
            {words.steps.map((step) => (
              <li key={step} className="break-words">
                {step}
              </li>
            ))}
          </ol>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <button type="button" onClick={gotIt} className="tap text-label-md font-semibold text-accent-blue-soft hover:underline">
            Got it
          </button>
          {words.steps.length > 0 && (
            <button type="button" onClick={() => setShowSteps((s) => !s)} aria-expanded={showSteps} className="tap text-label-md font-medium text-accent-blue-soft hover:underline">
              {showSteps ? 'Hide the steps' : 'Show me how'}
            </button>
          )}
        </div>
      </div>
      <button type="button" onClick={gotIt} aria-label={`Dismiss: ${words.title}`} className="tap-square -mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-on-surface-faint hover:text-on-surface">
        <CloseIcon width={16} height={16} />
      </button>
    </div>
  )
}
