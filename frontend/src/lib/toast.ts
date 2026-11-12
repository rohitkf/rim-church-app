/*
 * A short line that says something happened — "Saved" — and goes away.
 *
 * A store rather than a context, so anything can say it (a mutation's
 * onSuccess, a plain function) without being inside a provider. The one
 * <Toaster /> in the shell draws whatever is here.
 *
 * A toast can carry one thing to press — "Undo" — for as long as it is
 * showing (0281). That is the only action it takes: a toast is gone in
 * seconds, so anything that must be reachable later belongs on the page.
 */

export type ToastTone = 'success' | 'error'

export interface ToastAction {
  /** The verb on the button: "Undo". */
  label: string
  /** Run once; the toast goes as it is pressed. */
  run: () => void
}

export interface Toast {
  id: number
  text: string
  tone: ToastTone
  action?: ToastAction
}

/** How many toasts with something to press are kept at once: the newest. */
const ACTIONS_KEPT = 3

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<(list: Toast[]) => void>()

const emit = () => {
  for (const listener of listeners) listener(toasts)
}

/**
 * Show a toast for a couple of seconds. The same words twice replace each
 * other — unless there is something to press on them: two people checked
 * in one after the other are two things to undo, so both stay.
 */
export function showToast(text: string, tone: ToastTone = 'success', ms = 2600, action?: ToastAction): number {
  const toast: Toast = { id: nextId++, text, tone, ...(action ? { action } : {}) }
  const kept = toasts.filter((t) => t.action || t.text !== text)
  const withActions = kept.filter((t) => t.action)
  const overflow = action ? withActions.slice(0, Math.max(0, withActions.length - (ACTIONS_KEPT - 1))) : []
  toasts = [...kept.filter((t) => !overflow.includes(t)), toast]
  emit()
  setTimeout(() => dismissToast(toast.id), ms)
  return toast.id
}

/** Take a toast down now: its button was pressed. */
export function dismissToast(id: number): void {
  if (!toasts.some((t) => t.id === id)) return
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function subscribeToasts(listener: (list: Toast[]) => void): () => void {
  listeners.add(listener)
  listener(toasts)
  return () => {
    listeners.delete(listener)
  }
}
