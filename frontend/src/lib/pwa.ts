/**
 * Installing, updating and losing the network.
 *
 * The three facts the shell needs to know about running as an installed app
 * live in one module-level store rather than in each component's own state,
 * because several places show them at once — the account menu offers the
 * install, a banner announces an update — and two views of one fact must
 * not be allowed to disagree.
 */

/** Chromium's install prompt event, which TypeScript's DOM lib has no type for. */
export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface PwaState {
  /** A new build is downloaded and waiting for permission to take over. */
  updateReady: boolean
  /** The browser has offered an install; null when it hasn't (or can't). */
  installPrompt: InstallPromptEvent | null
  /** Already running from the home screen. */
  installed: boolean
  offline: boolean
}

let state: PwaState = {
  updateReady: false,
  installPrompt: null,
  installed: false,
  offline: false,
}

const listeners = new Set<() => void>()

export function getPwaState(): PwaState {
  return state
}

export function subscribePwa(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function set(patch: Partial<PwaState>) {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

/** True when the app is running as an installed app rather than in a tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone
  return window.matchMedia?.('(display-mode: standalone)').matches === true || iosStandalone === true
}

/**
 * iOS has no install prompt event — Safari installs only through the Share
 * sheet — so it is the one platform where the app has to say how instead of
 * offering a button that would do nothing.
 */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iPadOs = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
  return /iPad|iPhone|iPod/.test(ua) || iPadOs
}

let waitingWorker: ServiceWorker | null = null
// Whether *we* asked for the swap. A controller can change without anyone
// asking — a worker claiming an uncontrolled page does it — and reloading
// on that is how a first visit after a deploy ends up as a blank screen.
// Only a reload the person actually pressed is allowed to happen.
let updateAccepted = false

/** Take the update that is already downloaded, then reload onto it. */
export function applyUpdate() {
  updateAccepted = true
  if (!waitingWorker) {
    window.location.reload()
    return
  }
  waitingWorker.postMessage('SKIP_WAITING')
  // If the new worker doesn't take over — an old browser, a worker that
  // died — the reload still has to happen, or the button did nothing.
  window.setTimeout(() => window.location.reload(), 3000)
}

/**
 * Ask a worker which build it is.
 *
 * Resolves to null if it cannot say — an older worker with no answer for
 * the question, or one that never replies. Null means "assume it is worth
 * announcing": a banner nobody needed is a smaller failure than an update
 * nobody hears about, which is the failure this whole path exists to fix.
 */
export function askBuildId(worker: ServiceWorker, timeoutMs = 2000): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof MessageChannel === 'undefined') return resolve(null)
    const channel = new MessageChannel()
    const timer = window.setTimeout(() => resolve(null), timeoutMs)
    channel.port1.onmessage = (event: MessageEvent) => {
      window.clearTimeout(timer)
      const id = (event.data as { buildId?: unknown } | null)?.buildId
      resolve(typeof id === 'string' ? id : null)
    }
    try {
      worker.postMessage({ type: 'BUILD_ID' }, [channel.port2])
    } catch {
      window.clearTimeout(timer)
      resolve(null)
    }
  })
}

/** This bundle's own build, written in at build time. */
export function ownBuildId(): string | null {
  return typeof __RIM_BUILD_ID__ === 'string' ? __RIM_BUILD_ID__ : null
}

/**
 * Whether a newly installed worker is worth telling somebody about.
 *
 * Only silence when both ids are known and they agree — that is the page
 * that has just loaded the very build being announced. Anything less
 * certain speaks up: being told about an update you already have wastes a
 * tap, and not being told about one you don't have is the bug.
 */
export function announcesUpdate(pageBuildId: string | null, workerBuildId: string | null): boolean {
  return !(pageBuildId && workerBuildId && pageBuildId === workerBuildId)
}

function watchWorker(registration: ServiceWorkerRegistration) {
  const found = (worker: ServiceWorker | null) => {
    if (!worker) return
    let announced = false
    const check = async () => {
      // An installed worker while one is already controlling the page means
      // a new build is ready. On the very first visit there is no
      // controller and nothing to announce.
      if (announced) return
      if (worker.state !== 'installed' || !navigator.serviceWorker.controller) return
      announced = true

      // …unless this page IS that build. Opening the app after a deploy
      // fetches the new index.html and its assets straight away, and the
      // worker installs a moment later — so without this check every
      // person's first visit after every deploy ended in being told to
      // reload onto what they were already running.
      if (!announcesUpdate(ownBuildId(), await askBuildId(worker))) return

      waitingWorker = worker
      set({ updateReady: true })
    }
    void check()
    worker.addEventListener('statechange', () => void check())
  }

  found(registration.waiting)
  registration.addEventListener('updatefound', () => found(registration.installing))
}

/**
 * Keep asking, for a tab that stays open.
 *
 * A browser checks sw.js on navigation and then rarely — which is no use
 * to the case this is for: the app open on a phone through a Sunday
 * morning, while a fix goes out. So the page asks, on a slow timer and
 * whenever somebody comes back to it, throttled so returning to the tab
 * ten times in a minute is still one request.
 */
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000
const UPDATE_CHECK_THROTTLE_MS = 5 * 60 * 1000

function pollForUpdates(registration: ServiceWorkerRegistration): () => void {
  let lastCheck = Date.now()
  const check = () => {
    if (Date.now() - lastCheck < UPDATE_CHECK_THROTTLE_MS) return
    lastCheck = Date.now()
    // A failed check is a network that is down; the next one will do.
    registration.update().catch(() => {})
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') check()
  }
  const timer = window.setInterval(check, UPDATE_CHECK_INTERVAL_MS)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)
  return () => {
    window.clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', onVisible)
  }
}

/**
 * Register the worker and start listening for everything that follows.
 * Returns a teardown so tests (and hot reloads) don't leak listeners.
 */
export function initPwa(): () => void {
  if (typeof window === 'undefined') return () => {}

  set({ installed: isStandalone(), offline: navigator.onLine === false })

  const onOnline = () => set({ offline: false })
  const onOffline = () => set({ offline: true })
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)

  const onBeforeInstall = (event: Event) => {
    // Keep the event: it can only be replayed later if the default
    // mini-infobar was prevented here, at the moment it fired.
    event.preventDefault()
    set({ installPrompt: event as InstallPromptEvent })
  }
  const onInstalled = () => set({ installPrompt: null, installed: true })
  window.addEventListener('beforeinstallprompt', onBeforeInstall)
  window.addEventListener('appinstalled', onInstalled)

  let reloading = false
  const onControllerChange = () => {
    // Only ever after applyUpdate(): see updateAccepted above. Guarded
    // as well, because Chrome can fire this more than once.
    if (!updateAccepted || reloading) return
    reloading = true
    window.location.reload()
  }

  let stopPolling: () => void = () => {}
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        watchWorker(registration)
        stopPolling = pollForUpdates(registration)
      })
      .catch(() => {
        // An unregistrable worker (private mode, an unsupported browser, a
        // bad deploy) costs offline support and nothing else. The app runs.
      })
  }

  return () => {
    stopPolling()
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    window.removeEventListener('beforeinstallprompt', onBeforeInstall)
    window.removeEventListener('appinstalled', onInstalled)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }
}

/** Show the browser's install dialogue. Resolves to whether they took it. */
export async function promptInstall(): Promise<boolean> {
  const event = state.installPrompt
  if (!event) return false
  await event.prompt()
  const { outcome } = await event.userChoice
  // The event is single-use either way; the browser fires a fresh one if
  // the person becomes eligible again.
  set({ installPrompt: null })
  return outcome === 'accepted'
}

/** Test seam: reset the store between cases. */
export function resetPwaStateForTests() {
  state = { updateReady: false, installPrompt: null, installed: false, offline: false }
  waitingWorker = null
  updateAccepted = false
  listeners.clear()
}
