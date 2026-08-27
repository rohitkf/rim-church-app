import { useSyncExternalStore } from 'react'
import { getPwaState, subscribePwa, type PwaState } from './pwa'

const SERVER_STATE: PwaState = {
  updateReady: false,
  installPrompt: null,
  installed: false,
  offline: false,
}

/** The install / update / offline facts, shared by every view of them. */
export function usePwa(): PwaState {
  return useSyncExternalStore(subscribePwa, getPwaState, () => SERVER_STATE)
}
