import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePwa } from '../lib/usePwa'
import { useUnseenReleases } from '../lib/useUnseenReleases'
import type { Release } from '../lib/releases'
import { subscribeTour } from '../lib/tour'
import { ReleaseDetails } from './ReleaseDetails'
import { NOTICE_PRIMARY, NOTICE_QUIET, TopNotice } from './TopNotice'

/**
 * Says there is something new, once per person — and leaves it to them
 * whether to read it.
 *
 * It was a card that opened over the page the first time the app was
 * used after a release. Nobody had asked for it at that moment, and it
 * had to be closed before anything else could be done. Now it is a line
 * at the top of the screen (TopNotice): "Show details" opens what is new
 * (ReleaseDetails — every release they have not been told about, in one
 * sheet), "Dismiss" puts it away. Either way it is remembered on the
 * account and not offered again.
 *
 * Waits its turn: not while the tour is running (a new account meets the
 * app before it meets the changelog), not for somebody still on the
 * joining form, not for an Admin previewing as somebody else, and not
 * while a new version is waiting to be reloaded into — that notice sits
 * in the same place and offers the newer version's details itself.
 */
export function WhatsNew() {
  const { updateReady } = usePwa()
  const { ready, unseenOf, markSeen } = useUnseenReleases()
  const navigate = useNavigate()
  const [touring, setTouring] = useState(false)
  // What the sheet is showing. Held apart from the account's answer, which
  // changes under it the moment they are marked seen.
  const [reading, setReading] = useState<Release[] | null>(null)
  useEffect(() => subscribeTour((run) => setTouring(run !== null)), [])

  if (reading) {
    return <ReleaseDetails releases={reading} onClose={() => setReading(null)} onGo={(to) => navigate(to)} />
  }
  if (!ready || touring || updateReady) return null
  const unseen = unseenOf()
  if (unseen.length === 0) return null
  const told = () => markSeen(unseen.map((r) => r.key))

  return (
    <TopNotice label="The app was updated" text="The app was updated">
      <button
        type="button"
        onClick={() => {
          setReading(unseen)
          told()
        }}
        className={NOTICE_PRIMARY}
      >
        Show details
      </button>
      <button type="button" onClick={told} className={NOTICE_QUIET}>
        Dismiss
      </button>
    </TopNotice>
  )
}
