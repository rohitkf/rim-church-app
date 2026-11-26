import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import {
  deleteMyAccount,
  fetchMyData,
  fetchMyDataLookups,
  isOwnEmail,
  leaveAfterClosing,
  myDataDocumentName,
  myDataFileName,
  saveMyData,
  saveMyDataDocument,
} from '../lib/myData'
import { countReadable, readableData } from '../lib/myDataReadable'
import { useErrorText } from '../lib/useErrorText'
import { ActionButton, Field, SectionTile, inputClasses } from './Surface'

/**
 * Settings › Your account: a copy of what the app holds about you (0334).
 *
 * One press, one document: everything whose rows would be deleted with
 * the account, under plain headings, with a name where the database keeps
 * an id (lib/myDataReadable). It opens in any browser and prints.
 *
 * The first version handed over the database's rows as they are stored,
 * and the Owner sent theirs back the same day: all there, none of it
 * readable. That file is still offered, second and quietly, for whoever
 * wants every column.
 */
export function MyDataCard() {
  const { session, profile } = useAuth()
  const errorText = useErrorText()
  const me = session?.user.id ?? null
  const [made, setMade] = useState<{ file: string; sections: number; entries: number } | null>(null)
  const copy = useMutation({
    mutationFn: async (as: 'document' | 'data') => {
      const data = await fetchMyData()
      const now = new Date()
      const doc = readableData(data, as === 'document' ? await fetchMyDataLookups(me) : undefined)
      if (as === 'document') {
        saveMyDataDocument(doc, `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim(), now)
        return { file: myDataDocumentName(now), ...countReadable(doc) }
      }
      saveMyData(data, now)
      return { file: myDataFileName(now), ...countReadable(doc) }
    },
    onSuccess: setMade,
  })

  return (
    <SectionTile
      title="A copy of what is kept about you"
      hint={
        <>
          Everything the app holds that is yours, as one document you can read, print and keep.{' '}
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
            Saved as {made.file}: {made.entries} {made.entries === 1 ? 'entry' : 'entries'} under {made.sections}{' '}
            {made.sections === 1 ? 'heading' : 'headings'}.{' '}
            {made.file.endsWith('.html') ? 'Open it from your downloads; it opens in your browser.' : 'It opens in any text editor.'}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton size="sm" disabled={copy.isPending} onClick={() => copy.mutate('document')}>
            {copy.isPending && copy.variables === 'document' ? 'Gathering…' : 'Download a copy'}
          </ActionButton>
          <ActionButton size="sm" tone="quiet" disabled={copy.isPending} onClick={() => copy.mutate('data')}>
            {copy.isPending && copy.variables === 'data' ? 'Gathering…' : 'As a data file'}
          </ActionButton>
        </div>
        <p className="text-label-md text-on-surface-faint">
          The data file is the same information as the database stores it, column by column, for another program to
          read.
        </p>
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
