import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { countMyData, deleteMyAccount, fetchMyData, isOwnEmail, leaveAfterClosing, myDataFileName, saveMyData } from '../lib/myData'
import { useErrorText } from '../lib/useErrorText'
import { ActionButton, Field, SectionTile, inputClasses } from './Surface'

/**
 * Settings › Your account: a copy of what the app holds about you (0334).
 *
 * One press, one file. It is everything whose rows would be deleted with
 * the account: the profile, teams, answers, messages, clock-ins, prayer
 * requests. The file is the database's own rows, named as the database
 * names them, so nothing is left out by a summary.
 */
export function MyDataCard() {
  const errorText = useErrorText()
  const [made, setMade] = useState<{ file: string; tables: number; rows: number } | null>(null)
  const copy = useMutation({
    mutationFn: fetchMyData,
    onSuccess: (data) => {
      const now = new Date()
      saveMyData(data, now)
      setMade({ file: myDataFileName(now), ...countMyData(data) })
    },
  })

  return (
    <SectionTile
      title="A copy of what is kept about you"
      hint={
        <>
          Everything the app holds that is yours, as one file you can open and keep.{' '}
          <Link to="/privacy" className="font-medium text-accent-blue-soft hover:underline">
            What the app keeps, and for how long
          </Link>
          .
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {copy.error && (
          <p role="alert" className="text-body-sm text-accent-red-soft">
            {errorText(copy.error, 'Could not make the copy.')}
          </p>
        )}
        {made && !copy.isPending && (
          <p role="status" className="text-body-sm text-on-surface-variant">
            Saved as {made.file}: {made.rows} {made.rows === 1 ? 'entry' : 'entries'} from {made.tables}{' '}
            {made.tables === 1 ? 'list' : 'lists'}. It opens in any text editor.
          </p>
        )}
        <div>
          <ActionButton size="sm" tone="quiet" disabled={copy.isPending} onClick={() => copy.mutate()}>
            {copy.isPending ? 'Gathering…' : 'Download a copy'}
          </ActionButton>
        </div>
      </div>
    </SectionTile>
  )
}

/**
 * Settings › Your account: remove your own account (0334).
 *
 * The same removal the Owner does from People, done by the person
 * themselves. It cannot be put back, so it is not a button: the account's
 * own email address has to be typed, and the database checks it again.
 *
 * The Owner cannot: somebody has to hold the app, so it is handed on
 * first (Volunteers), and then this opens.
 */
export function CloseAccountCard() {
  const { session, isSuperAdmin, viewAs } = useAuth()
  const errorText = useErrorText()
  const email = session?.user.email ?? null
  const [typed, setTyped] = useState('')
  const close = useMutation({
    mutationFn: () => deleteMyAccount(typed.trim()),
    onSuccess: () => leaveAfterClosing(),
  })
  const matches = isOwnEmail(typed, email)

  return (
    <SectionTile
      tone="danger"
      title="Remove your account"
      hint="Your details, answers, messages, clock-ins and prayer requests go with it, at once. It cannot be put back."
    >
      {isSuperAdmin ? (
        <p className="text-body-md text-on-surface">
          You own this app, and somebody has to. Hand it to somebody else first, from Volunteers, and then your account
          can be removed here.
        </p>
      ) : viewAs ? (
        <p className="text-body-md text-on-surface">
          You are previewing the app as somebody else. Leave the preview to remove your own account.
        </p>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (matches && !close.isPending) close.mutate()
          }}
        >
          <p className="text-body-sm text-on-surface-variant">
            A line you wrote for a team, such as a debrief note, stays without your name. If you only want a break
            from the rota, speak to your team&rsquo;s head instead: nothing needs removing for that.
          </p>
          <Field label="Type your email address to confirm" hint={email ? `This account is ${email}.` : undefined}>
            <input
              type="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className={inputClasses}
            />
          </Field>
          {close.error && (
            <p role="alert" className="text-body-sm text-accent-red-soft">
              {errorText(close.error, 'Could not remove the account.')}
            </p>
          )}
          <div>
            <ActionButton type="submit" tone="danger" size="sm" disabled={!matches || close.isPending || close.isSuccess}>
              {close.isPending || close.isSuccess ? 'Removing…' : 'Remove my account'}
            </ActionButton>
          </div>
        </form>
      )}
    </SectionTile>
  )
}
