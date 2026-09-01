import { type FormEvent, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { ActionButton, Field, inputClasses } from './Surface'
import { useErrorText } from '../lib/useErrorText'
import type { Department } from '../lib/types'

/**
 * Asking somebody to join.
 *
 * The sending happens in an edge function, because inviting a user needs the
 * service role key and that key must never reach a browser. This is the part
 * that can: an address, optionally a team, and a button.
 *
 * Deliberately honest about what it did. "Invite sent" when the mail is away;
 * the actual reason when it is not — an address that already has an account,
 * or the project's own email limit, which is the failure a church on a free
 * Supabase tier will meet first.
 */
export function InviteDialog({
  open,
  onClose,
  departments,
  fixedDepartmentId,
}: {
  open: boolean
  onClose: () => void
  /** Teams the inviter may invite into. Empty means "the church", for Admins. */
  departments?: Department[]
  /** On a team's own page there is nothing to choose. */
  fixedDepartmentId?: string
}) {
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [departmentId, setDepartmentId] = useState(fixedDepartmentId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)

  const invite = useMutation({
    mutationFn: async () => {
      const { data, error: callError } = await supabase.functions.invoke('invite', {
        body: { email: email.trim(), department_id: departmentId || null },
      })
      // An edge function reports a refusal in the body, not by throwing, so a
      // "success" carrying an error is still a failure.
      if (callError) throw callError
      if (data?.error) throw new Error(data.error)
      return email.trim()
    },
    onSuccess: (address) => {
      setSent(address)
      setEmail('')
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['invitations'] })
    },
    onError: (err: unknown) => {
      setSent(null)
      setError(errorText(err, 'Could not send that invitation.'))
    },
  })

  if (!open) return null

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim().includes('@')) {
      setError("That doesn't look like an email address.")
      return
    }
    invite.mutate()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-[var(--radius-shell)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12"
      >
        <h2 id="invite-title" className="text-headline-md">
          Invite somebody
        </h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          They get an email with a link to set a password and sign in. Nothing happens to their
          account until they follow it.
        </p>

        <div className="mt-5 flex flex-col gap-4">
          <Field label="Their email">
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setSent(null)
              }}
              autoFocus
              placeholder="name@example.com"
              className={inputClasses}
            />
          </Field>

          {departments && departments.length > 0 && !fixedDepartmentId && (
            <Field label="Team (optional)">
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className={inputClasses}
              >
                <option value="">No team yet</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        {error && (
          <p className="mt-4 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
            {error}
          </p>
        )}
        {sent && (
          <p className="mt-4 rounded-[var(--radius-chip)] bg-[color-mix(in_oklab,var(--color-accent-green)_14%,transparent)] px-3 py-2 text-body-sm text-accent-green">
            Invitation sent to {sent}.
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              setError(null)
              setSent(null)
              onClose()
            }}
            className="rounded-full px-4 py-2.5 text-body-sm font-medium text-on-surface ring-1 ring-black/8 hover:ring-black/20 dark:ring-white/10"
          >
            {sent ? 'Done' : 'Cancel'}
          </button>
          <ActionButton type="submit" disabled={invite.isPending || !email.trim()} glyph="✉">
            {invite.isPending ? 'Sending' : 'Send invite'}
          </ActionButton>
        </div>
      </form>
    </div>
  )
}
