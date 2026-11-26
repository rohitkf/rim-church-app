import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  beginEnrolment,
  codeDigits,
  codeErrorWords,
  fetchMyAuthenticators,
  giveCode,
  isWholeCode,
  removeAuthenticator,
  secretInFours,
  type Enrolment,
} from '../lib/secondStep'
import { showToast } from '../lib/toast'
import { useErrorText } from '../lib/useErrorText'
import { useConfirmAction } from './ConfirmAction'
import { QrCode } from './QrCode'
import { QueryState } from './QueryState'
import { ActionButton, Field, SectionTile, inputClasses } from './Surface'

const MY_AUTHENTICATORS_KEY = ['my-authenticators']

/**
 * Settings › Your account: a second step at sign-in (0334, lib/secondStep).
 *
 * Off, it offers to set one up: a QR code for the authenticator app to
 * read, the same secret in letters for where a camera cannot be used, and
 * a box for the first code, which is what proves the app and the account
 * agree. Nothing is on until that code is right, so a set-up left half
 * way locks nobody out.
 *
 * On, it says since when and offers to take it off.
 */
export function SecondStepCard() {
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const { ask, dialog } = useConfirmAction()
  const mine = useQuery({ queryKey: MY_AUTHENTICATORS_KEY, queryFn: fetchMyAuthenticators })
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null)
  const [typed, setTyped] = useState('')

  const begin = useMutation({
    mutationFn: beginEnrolment,
    onSuccess: (next) => {
      setEnrolment(next)
      setTyped('')
    },
  })
  const confirm = useMutation({
    mutationFn: ({ factorId, code }: { factorId: string; code: string }) => giveCode(factorId, code),
    onSuccess: () => {
      setEnrolment(null)
      setTyped('')
      showToast('Second step is on')
      return queryClient.invalidateQueries({ queryKey: MY_AUTHENTICATORS_KEY })
    },
    onError: () => setTyped(''),
  })
  const remove = useMutation({
    mutationFn: removeAuthenticator,
    onSuccess: () => {
      showToast('Second step is off')
      return queryClient.invalidateQueries({ queryKey: MY_AUTHENTICATORS_KEY })
    },
  })
  // Leaving a set-up half way: what was started never worked, so it is taken away.
  const abandon = useMutation({
    mutationFn: removeAuthenticator,
    onSettled: () => {
      setEnrolment(null)
      setTyped('')
      confirm.reset()
    },
  })

  const on = mine.data?.[0] ?? null

  return (
    <SectionTile
      title="A second step at sign-in"
      hint="After your password, a six-digit code from an authenticator app on your phone. Somebody who learns your password still cannot sign in as you."
    >
      <QueryState isLoading={mine.isLoading} error={mine.error}>
        {on ? (
          <div className="flex flex-col gap-3">
            <p className="text-body-md text-on-surface">
              On since{' '}
              {new Date(on.since).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}. Every
              sign-in to this account asks for the code.
            </p>
            <p className="text-body-sm text-on-surface-variant">
              If you lose the phone it is on, ask the church&rsquo;s Owner to clear it. Changing phones? Turn it off
              here first, then set it up again on the new one.
            </p>
            {remove.error && (
              <p role="alert" className="text-body-sm text-accent-red-soft">
                {errorText(remove.error, 'Could not turn it off.')}
              </p>
            )}
            <div>
              <ActionButton
                tone="danger-quiet"
                size="sm"
                disabled={remove.isPending}
                onClick={() =>
                  ask({
                    title: 'Turn the second step off?',
                    body: 'Your password alone will sign you in. You can set it up again at any time.',
                    confirmLabel: 'Turn it off',
                    onConfirm: () => remove.mutate(on.id),
                  })
                }
              >
                {remove.isPending ? 'Turning it off…' : 'Turn it off'}
              </ActionButton>
            </div>
          </div>
        ) : enrolment ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (isWholeCode(typed)) confirm.mutate({ factorId: enrolment.factorId, code: typed })
            }}
          >
            <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-body-sm text-on-surface-variant">
              <li>Open an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, 1Password, or the one built into your phone&rsquo;s passwords).</li>
              <li>Add an account, and point the camera at this code.</li>
              <li>Type the six digits it then shows.</li>
            </ol>
            <div className="flex flex-wrap items-start gap-5">
              <QrCode text={enrolment.uri} label="A code for your authenticator app to scan" className="h-44 w-44 shrink-0 rounded-[var(--radius-chip)]" />
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-label-md text-on-surface-faint">No camera? Type this in instead:</p>
                <p className="mt-1 select-all font-mono text-body-sm text-on-surface [overflow-wrap:anywhere]">
                  {secretInFours(enrolment.secret)}
                </p>
              </div>
            </div>
            <Field label="The six digits it shows">
              <input
                type="text"
                name="one-time-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                value={typed}
                onChange={(e) => setTyped(codeDigits(e.target.value))}
                className={`${inputClasses} max-w-48 font-mono tracking-[0.25em] tabular-nums`}
              />
            </Field>
            {confirm.error && (
              <p role="alert" className="text-body-sm text-accent-red-soft">
                {codeErrorWords(confirm.error)}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <ActionButton type="submit" size="sm" disabled={!isWholeCode(typed) || confirm.isPending}>
                {confirm.isPending ? 'Checking…' : 'Turn it on'}
              </ActionButton>
              <ActionButton tone="quiet" size="sm" disabled={abandon.isPending} onClick={() => abandon.mutate(enrolment.factorId)}>
                Cancel
              </ActionButton>
            </div>
            <p className="text-label-md text-on-surface-faint">
              Nothing changes until the code is accepted. Once it is, other devices signed in as you are signed out
              and asked for a code too.
            </p>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-body-md text-on-surface">Off. Your password alone signs you in.</p>
            {begin.error && (
              <p role="alert" className="text-body-sm text-accent-red-soft">
                {errorText(begin.error, 'Could not start setting it up.')}
              </p>
            )}
            <div>
              <ActionButton size="sm" disabled={begin.isPending} onClick={() => begin.mutate()}>
                {begin.isPending ? 'Starting…' : 'Set up an authenticator app'}
              </ActionButton>
            </div>
          </div>
        )}
      </QueryState>
      {dialog}
    </SectionTile>
  )
}
