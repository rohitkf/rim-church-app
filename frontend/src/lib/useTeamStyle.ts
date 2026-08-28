import { useCallback, useSyncExternalStore } from 'react'
import { readTeamStyle, writeTeamStyle, type TeamStylePreference } from './teamStyle'

// One preference shared by every team mark on the screen, the same way the
// theme is: a page holding its own useState would leave half the app in
// dots and half in gradients until the next navigation.
let current: TeamStylePreference = readTeamStyle()
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Whether teams are drawn as dots or as gradient washes, per browser. */
export function useTeamStyle() {
  const preference = useSyncExternalStore(
    subscribe,
    () => current,
    () => 'dot' as TeamStylePreference,
  )

  const choose = useCallback((next: TeamStylePreference) => {
    current = next
    writeTeamStyle(next)
    for (const listener of listeners) listener()
  }, [])

  return { teamStyle: preference, choose }
}
