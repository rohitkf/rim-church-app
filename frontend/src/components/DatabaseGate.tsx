import { useEffect, useState, type ReactNode } from 'react'
import { OPEN_ANYWAY_AFTER_MS } from '../lib/databaseVersion'
import { useDatabaseVersion } from '../lib/useDatabaseVersion'
import { UpdatingPage } from '../pages/UpdatingPage'

/**
 * The app, or — while the database is behind this build — the page that
 * says it is being updated (lib/databaseVersion, 0285).
 *
 * Around everything, signed in or not: a registration page is as broken
 * by a missing function as the rota is. The app is drawn until the
 * database has clearly said it is behind, so nobody waits on the
 * question, and a question that cannot be asked changes nothing.
 *
 * Somebody who chooses "Open the app anyway" is let in for as long as
 * this page load lasts. It is not remembered: the next load asks again,
 * and by then the update has almost always finished.
 */
export function DatabaseGate({ children }: { children: ReactNode }) {
  const { behind, checking, recheck } = useDatabaseVersion()
  const [openedAnyway, setOpenedAnyway] = useState(false)
  // How long the page has been showing: the way past it is offered only to somebody who has waited.
  const [waited, setWaited] = useState(false)

  useEffect(() => {
    if (!behind) return
    const timer = setTimeout(() => setWaited(true), OPEN_ANYWAY_AFTER_MS)
    return () => {
      clearTimeout(timer)
      setWaited(false)
    }
  }, [behind])

  if (behind && !openedAnyway) {
    return <UpdatingPage checking={checking} mayOpenAnyway={waited} onRetry={recheck} onOpenAnyway={() => setOpenedAnyway(true)} />
  }
  return <>{children}</>
}
