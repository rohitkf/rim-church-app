import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { Overlay } from './Surface'

/**
 * "Are you sure?", once, for the whole app.
 *
 * Deleting was a single press almost everywhere: a bin glyph beside a row
 * removed the row, and the only way back was to type it all in again.
 * Three screens had grown their own confirmation — an inline red strip, a
 * second click that changed the button's word — and each read differently
 * from the others, so the pause never became a habit anyone could rely on.
 *
 * This is that pause as one thing. A component asks for the hook once,
 * renders `dialog` somewhere inside itself, and turns a destructive
 * handler into a request:
 *
 *     onClick={() => ask({
 *       title: 'Remove Joel from Media?',
 *       body: 'They keep their account and can be added again.',
 *       confirmLabel: 'Remove',
 *       onConfirm: () => removeMember.mutate(member.id),
 *     })}
 *
 * Nothing here performs the deletion. It holds the request until somebody
 * says the word, and the word is always the verb of the act — "Delete",
 * "Remove", "Clear" — never "OK", so the button that does the thing says
 * what the thing is.
 */

export interface ConfirmRequest {
  /** A question naming what goes. */
  title: string
  /** What else the person should know before answering. */
  body?: ReactNode
  /** The verb on the button that does it. */
  confirmLabel?: string
  /** The word for backing out. */
  cancelLabel?: string
  onConfirm: () => void
}

export interface ConfirmAction {
  ask: (request: ConfirmRequest) => void
  dialog: ReactNode
}

export function useConfirmAction(): ConfirmAction {
  const [pending, setPending] = useState<ConfirmRequest | null>(null)

  const ask = useCallback((request: ConfirmRequest) => setPending(request), [])
  const close = useCallback(() => setPending(null), [])

  const dialog = pending ? (
    <ConfirmDialog request={pending} onClose={close} />
  ) : null

  return { ask, dialog }
}

function ConfirmDialog({ request, onClose }: { request: ConfirmRequest; onClose: () => void }) {
  const confirmLabel = request.confirmLabel ?? 'Delete'

  return (
    <Overlay onDismiss={onClose} label={request.title} closable={false}>
      <div
        role="alertdialog"
        aria-label={request.title}
        className="w-full max-w-sm rounded-[var(--radius-shell)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12"
      >
        <h2 className="text-headline-sm text-on-surface">{request.title}</h2>
        {request.body && (
          <div className="mt-2 text-body-sm text-on-surface-variant">{request.body}</div>
        )}

        {/* The safe answer sits where the thumb lands first, and the one
            that takes something away is the one you have to reach for. */}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="tap rounded-full bg-raised-strong px-4 py-2 text-label-md text-on-surface hairline-strong"
          >
            {request.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            onClick={() => {
              request.onConfirm()
              onClose()
            }}
            className="tap rounded-full bg-error px-4 py-2 text-label-md font-medium text-on-error"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Overlay>
  )
}
