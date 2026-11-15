import { useEffect, useState } from 'react'
import { applyUpdate } from '../lib/pwa'
import { usePwa } from '../lib/usePwa'
import { fetchLatestReleases } from '../lib/latestReleases'
import { useUnseenReleases } from '../lib/useUnseenReleases'
import type { Release } from '../lib/releases'
import { ReleaseDetails } from './ReleaseDetails'
import { NOTICE_PRIMARY, NOTICE_QUIET, NOTICE_SECOND, TopNotice } from './TopNotice'

/** Signed out, nobody's account says what they have seen: the newest few. */
const SHOWN_TO_A_VISITOR = 3

/**
 * A new version is ready: a small line at the top of the screen, with the
 * button that takes it and one that says what it is.
 *
 * It has been two other things. First a pill at the foot of the screen,
 * which was ignored for as long as anybody liked. Then a dialog with no
 * way past it but Reload, on the reasoning that two people reading
 * different versions of the same morning is the confusion the app exists
 * to prevent. That was true and still cost too much: it stopped somebody
 * in the middle of what they were doing — a checklist half ticked, a
 * message half typed — for a release that had nothing to do with them.
 * The Owner asked for it to stop interrupting (November 2026).
 *
 * So it says so and waits. Nothing behind it is covered or held
 * (TopNotice). "Later" puts it away, and it comes back when the app is
 * next brought to the front — the moment somebody is between things,
 * which is when a reload costs nothing. An app closed and opened again
 * takes the new version by itself, as it always has.
 *
 * "Show details" is what the new version says is new, read from the
 * server (lib/latestReleases) because the build still running does not
 * have those notes — so nobody has to reload to find out what a reload
 * would bring. It is the choice the what's-new card used to make for
 * them, by opening over the page after every update. Having read them
 * here, they are not offered again after the reload.
 *
 * Nothing is lost by pressing Reload either: the update has already
 * downloaded, so it is a page swap, not a fetch.
 */
export function UpdateNotice() {
  const { updateReady } = usePwa()
  const { ready, unseenOf, markSeen } = useUnseenReleases()
  const [reloading, setReloading] = useState(false)
  const [later, setLater] = useState(false)
  const [asking, setAsking] = useState(false)
  const [details, setDetails] = useState<Release[] | null>(null)

  // Put away, it returns when the app comes back to the front.
  useEffect(() => {
    if (!later) return
    const back = () => {
      if (document.visibilityState === 'visible') setLater(false)
    }
    document.addEventListener('visibilitychange', back)
    return () => document.removeEventListener('visibilitychange', back)
  }, [later])

  if (!updateReady) return null

  const showDetails = async () => {
    setAsking(true)
    const latest = await fetchLatestReleases()
    setAsking(false)
    setDetails(ready ? unseenOf(latest) : latest.slice(0, SHOWN_TO_A_VISITOR))
  }

  return (
    <>
      {!later && (
        <TopNotice label="A new version is ready" text="New version ready">
          <button
            type="button"
            disabled={reloading}
            onClick={() => {
              setReloading(true)
              applyUpdate()
            }}
            className={NOTICE_PRIMARY}
          >
            {reloading ? 'Reloading…' : 'Reload'}
          </button>
          {!reloading && (
            <>
              <button type="button" disabled={asking} onClick={showDetails} className={NOTICE_SECOND}>
                Show details
              </button>
              <button type="button" onClick={() => setLater(true)} className={NOTICE_QUIET}>
                Later
              </button>
            </>
          )}
        </TopNotice>
      )}
      {details && (
        <ReleaseDetails
          releases={details}
          onClose={() => {
            markSeen(details.map((r) => r.key))
            setDetails(null)
          }}
        />
      )}
    </>
  )
}
