import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ACCOUNT_BLOCKS_KEY, BLOCK_REASON_MAX, blockAccount } from '../lib/accountBlocks'
import { useErrorText } from '../lib/useErrorText'
import { Overlay } from './Surface'

/**
 * "Block this account?", with what that means said before the button.
 *
 * Blocking is not removing (0279): the person can still sign in and meets
 * a page that says their account is blocked; their teams, rota and
 * history stay, and unblocking puts everything back. That difference is
 * the whole reason to choose it, so the dialog says it.
 *
 * The note is for the people who may block — why, for whoever looks at
 * this in a month. The person blocked never sees it.
 */
export function BlockAccountDialog({
  person,
  onClose,
}: {
  person: { id: string; first_name: string; last_name: string }
  onClose: () => void
}) {
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [why, setWhy] = useState('')
  const [error, setError] = useState<string | null>(null)

  const block = useMutation({
    mutationFn: () => blockAccount(person.id, why),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ACCOUNT_BLOCKS_KEY })
      onClose()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not block that account.')),
  })

  const name = `${person.first_name} ${person.last_name}`.trim()

  return (
    <Overlay closable={!block.isPending} onDismiss={onClose} label={`Block ${name}?`}>
      <form
        className="w-full max-w-md rounded-[var(--radius-shell)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12"
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          block.mutate()
        }}
      >
        <h2 className="break-words text-headline-md">Block {name}?</h2>
        <p className="mt-2 text-body-sm text-on-surface-variant">
          They will still be able to sign in, and will meet a page saying their account has been blocked by an
          administrator and to contact an Admin. Nothing else in the app opens for them.
        </p>
        <p className="mt-2 text-body-sm text-on-surface-variant">
          Nothing of theirs is removed: their teams, rota and history stay, and you can unblock them at any time.
        </p>

        <label htmlFor="block-reason" className="mt-4 block text-label-md font-medium text-on-surface">
          Reason <span className="font-normal text-on-surface-faint">(optional)</span>
        </label>
        <textarea
          id="block-reason"
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          maxLength={BLOCK_REASON_MAX}
          rows={3}
          aria-describedby="block-reason-help"
          className="mt-1.5 w-full resize-y rounded-[var(--radius-row)] bg-raised px-3 py-2 text-body-sm text-on-surface hairline placeholder:text-on-surface-faint focus:outline-none focus:ring-2 focus:ring-secondary"
          placeholder="For your own record"
        />
        <p id="block-reason-help" className="mt-1 text-label-md text-on-surface-faint">
          Only people who can block accounts see this. {name.split(' ')[0] || 'They'} never will.
        </p>

        {error && (
          <p role="alert" className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={block.isPending}
            className="rounded-full px-4 py-2.5 text-body-sm font-medium text-on-surface ring-1 ring-black/8 transition-[background-color,color,box-shadow,opacity,transform] duration-200 ease-[var(--ease-glide)] hover:ring-black/20 disabled:opacity-50 dark:ring-white/10"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={block.isPending}
            className="rounded-full bg-error px-5 py-2.5 text-body-sm font-semibold text-on-error transition-transform duration-300 ease-[var(--ease-glide)] active:scale-[0.97] active:duration-[80ms] disabled:opacity-50"
          >
            {block.isPending ? 'Blocking…' : 'Block account'}
          </button>
        </div>
      </form>
    </Overlay>
  )
}
