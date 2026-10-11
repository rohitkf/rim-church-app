/*
 * A short line that says something happened — "Saved" — and goes away.
 *
 * A store rather than a context, so anything can say it (a mutation's
 * onSuccess, a plain function) without being inside a provider. The one
 * <Toaster /> in the shell draws whatever is here.
 */

export type ToastTone = 'success' | 'error'

export interface Toast {
  id: number
  text: string
  tone: ToastTone
}

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<(list: Toast[]) => void>()

const emit = () => {
  for (const listener of listeners) listener(toasts)
}

/** Show a toast for a couple of seconds. The same words twice replace each other. */
export function showToast(text: string, tone: ToastTone = 'success', ms = 2600): void {
  const toast = { id: nextId++, text, tone }
  toasts = [...toasts.filter((t) => t.text !== text), toast]
  emit()
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== toast.id)
    emit()
  }, ms)
}

export function subscribeToasts(listener: (list: Toast[]) => void): () => void {
  listeners.add(listener)
  listener(toasts)
  return () => {
    listeners.delete(listener)
  }
}
