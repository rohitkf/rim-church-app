import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  PRIVACY_DETAILS_KEY,
  PRIVACY_LIMITS,
  fetchPrivacyDetails,
  privacyDetailsFault,
  samePrivacyDetails,
  savePrivacyDetails,
  tidyPrivacyDetails,
  type PrivacyDetails,
  type PrivacyField,
} from '../lib/privacyDetails'
import { usePermissions } from '../lib/usePermissions'
import { showToast } from '../lib/toast'
import { useErrorText } from '../lib/useErrorText'
import { QueryState } from './QueryState'
import { ActionButton, Field, SectionTile, inputClasses } from './Surface'

/**
 * Settings › General: what the church says about itself on the page that
 * tells people what is kept about them (0334, lib/privacyDetails).
 *
 * Four boxes, all optional, each shown on /privacy only when filled in.
 * Plain text: the page is open to anybody, so nothing typed here is ever
 * treated as anything but words.
 */
export function PrivacyDetailsCard() {
  const mayChange = usePermissions().can('settings.general')
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const stored = useQuery({ queryKey: PRIVACY_DETAILS_KEY, queryFn: fetchPrivacyDetails, enabled: mayChange })
  // Untouched, the boxes show what is saved; typing makes a draft.
  const [typed, setTyped] = useState<PrivacyDetails | null>(null)
  const save = useMutation({
    mutationFn: (details: PrivacyDetails) => savePrivacyDetails(tidyPrivacyDetails(details)),
    onSuccess: (kept) => {
      setTyped(null)
      queryClient.setQueryData(PRIVACY_DETAILS_KEY, kept)
      showToast('Saved. It is on the page now.')
    },
  })

  if (!mayChange) return null

  const saved = stored.data ?? {}
  const draft = typed ?? saved
  const set = (key: PrivacyField, value: string) => setTyped({ ...draft, [key]: value })
  const fault = privacyDetailsFault(draft)
  const changed = !samePrivacyDetails(draft, saved)

  return (
    <SectionTile
      title="On the page about what is kept"
      hint={
        <>
          Who people should ask about their information, where to write, and anything the church wants said in its own
          words. Each shows on{' '}
          <Link to="/privacy" className="font-medium text-accent-blue-soft hover:underline">
            What the app keeps about you
          </Link>{' '}
          once it is filled in. That page is open to anybody, so put nothing here that is not for everybody.
        </>
      }
    >
      <QueryState isLoading={stored.isLoading} error={stored.error}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!fault && changed && !save.isPending) save.mutate(draft)
          }}
        >
          <Field label="Who to ask" hint="A name or a role: “The church office”, “Jo Smith, Data Lead”.">
            <input
              type="text"
              value={draft.contact_name ?? ''}
              maxLength={PRIVACY_LIMITS.contact_name}
              onChange={(e) => set('contact_name', e.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field label="Their email address">
            <input
              type="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              value={draft.contact_email ?? ''}
              maxLength={PRIVACY_LIMITS.contact_email}
              onChange={(e) => set('contact_email', e.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field label="The church’s postal address">
            <textarea
              rows={3}
              value={draft.postal_address ?? ''}
              maxLength={PRIVACY_LIMITS.postal_address}
              onChange={(e) => set('postal_address', e.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field
            label="In the church’s own words"
            hint="Shown under its own heading, as typed. For what only the church can say: its reasons in law for keeping each thing, its charity number, its own policy."
          >
            <textarea
              rows={6}
              value={draft.note ?? ''}
              maxLength={PRIVACY_LIMITS.note}
              onChange={(e) => set('note', e.target.value)}
              className={inputClasses}
            />
          </Field>
          {fault && changed && <p className="text-body-sm text-accent-red-soft">{fault}</p>}
          {save.error && (
            <p role="alert" className="text-body-sm text-accent-red-soft">
              {errorText(save.error, 'Could not save that.')}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <ActionButton type="submit" size="sm" disabled={!!fault || !changed || save.isPending}>
              {save.isPending ? 'Saving…' : 'Save'}
            </ActionButton>
            {changed && (
              <ActionButton tone="quiet" size="sm" disabled={save.isPending} onClick={() => setTyped(null)}>
                Undo changes
              </ActionButton>
            )}
          </div>
        </form>
      </QueryState>
    </SectionTile>
  )
}
