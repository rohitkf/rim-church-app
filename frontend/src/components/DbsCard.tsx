import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { SectionTile } from './Surface'
import { QueryState } from './QueryState'
import { YesNoSwitch } from './YesNoSwitch'
import { DbsFields } from './DbsFields'
import { useErrorText } from '../lib/useErrorText'
import { showToast } from '../lib/toast'
import { todayIso } from '../lib/monthGrid'
import {
  DBS_ORDER,
  DBS_TEXT,
  dbsAge,
  dbsAnswersOf,
  dbsChecksText,
  dbsDate,
  dbsInvalid,
  dbsKey,
  dbsKindLabel,
  dbsMissing,
  fetchDbs,
  saveMyDbs,
  type DbsAnswers,
  type DbsField,
} from '../lib/dbs'

const quietButton =
  'tap rounded-full px-4 py-2.5 text-body-sm font-medium text-on-surface ring-1 ring-black/8 transition-[background-color,color,box-shadow,opacity,transform] duration-200 ease-[var(--ease-glide)] hover:ring-black/20 disabled:opacity-50 dark:ring-white/10'
const primaryButton =
  'tap rounded-full bg-primary px-5 py-2.5 text-body-sm font-semibold text-on-primary transition-transform duration-300 ease-[var(--ease-glide)] active:scale-[0.97] active:duration-[80ms] disabled:opacity-50'
const dangerButton =
  'tap rounded-full bg-error px-5 py-2.5 text-body-sm font-semibold text-on-error transition-transform duration-300 ease-[var(--ease-glide)] active:scale-[0.97] active:duration-[80ms] disabled:opacity-50'

const fieldId = (field: DbsField) => `profile-dbs-${field}`

/**
 * One's own DBS, on the profile (0324).
 *
 * The rest of the profile saves itself a moment after a change. This does
 * not: saying yes is the certificate's details and permission to check
 * them, given together, and permission is not something to take from a
 * half-typed form. So it has a button, like the family card below it.
 *
 * "No" was a switch that saved on a tap. With details behind the yes a
 * tap would throw them away and the check with them, so it asks first.
 */
export function DbsCard() {
  const { profile } = useAuth()
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const userId = profile?.id
  const query = useQuery({ queryKey: dbsKey(userId), queryFn: () => fetchDbs(userId ?? ''), enabled: !!userId })
  const record = query.data
  /** The details being typed: open when they have said yes and not saved, or are changing what is saved. */
  const [draft, setDraft] = useState<DbsAnswers | null>(null)
  const [tried, setTried] = useState(false)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const today = todayIso()
  const details = record?.details ?? null
  // A yes from before the details were asked for, with nothing behind it: the form is open.
  const answers = draft ?? (record?.has_dbs && !details ? dbsAnswersOf(null, profile?.last_name ?? '') : null)
  const missing = answers ? dbsMissing(answers) : []
  const bad = answers ? dbsInvalid(answers, today) : {}
  const messageFor = (field: DbsField) => bad[field] ?? (tried && missing.includes(field) ? DBS_TEXT[field].message : null)

  const settled = async (words: string) => {
    await queryClient.invalidateQueries({ queryKey: dbsKey(userId) })
    setDraft(null)
    setTried(false)
    setAsking(false)
    setError(null)
    showToast(words)
  }

  const save = useMutation({
    mutationFn: (what: DbsAnswers) => saveMyDbs(what),
    onSuccess: () => settled('DBS details saved'),
    onError: (err) => setError(errorText(err, 'Could not save your DBS details.')),
  })

  const sayNo = useMutation({
    mutationFn: async () => {
      const { error: failed } = await supabase.from('profile_sensitive').update({ has_dbs: false }).eq('user_id', userId ?? '')
      if (failed) throw failed
    },
    onSuccess: () => settled('Saved'),
    onError: (err) => setError(errorText(err, 'Could not save your answer.')),
  })

  const busy = save.isPending || sayNo.isPending

  const submit = () => {
    if (!answers) return
    setTried(true)
    setError(null)
    const first = DBS_ORDER.find((field) => missing.includes(field) || bad[field])
    if (first) {
      const place = document.getElementById(fieldId(first))
      if (place && typeof place.scrollIntoView === 'function') place.scrollIntoView({ block: 'center', behavior: 'smooth' })
      return
    }
    save.mutate(answers)
  }

  const answer = (yes: boolean) => {
    setError(null)
    if (yes) {
      setAsking(false)
      if (!record?.has_dbs && !draft) setDraft(dbsAnswersOf(null, profile?.last_name ?? ''))
      return
    }
    // Not saved as a yes yet: nothing to take back but the open form.
    if (!record?.has_dbs) {
      setDraft(null)
      setTried(false)
      return
    }
    if (details) setAsking(true)
    else sayNo.mutate()
  }

  const age = dbsAge(details?.issued_on, today)

  return (
    <SectionTile title="DBS check" hint="Only you, the Owner and a Pastor can see these, and whoever else the Owner has checking them.">
      <QueryState isLoading={query.isLoading} error={query.error}>
        <div className="flex flex-col gap-4">
          {error && (
            <p role="alert" className="rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
              {error}
            </p>
          )}

          {/* Yes or No, the way an availability answer is given: a box
              left unticked could mean "no" or "never looked". */}
          <div className="flex flex-col gap-2">
            <span className="text-body-sm text-on-surface-variant">Do you have a valid DBS check?</span>
            <YesNoSwitch
              value={answers ? true : (record?.has_dbs ?? false)}
              onChange={answer}
              label="Do you have a valid DBS check?"
              disabled={busy}
            />
          </div>

          {asking && (
            <div role="group" aria-label="Remove your DBS details" className="flex flex-col gap-3 rounded-[var(--radius-row)] bg-error-container/40 p-4">
              <p className="text-body-sm text-on-surface">
                Answering no removes your DBS details from the app{details?.verified_at ? ', and the record that they were checked' : ''}.
                If you say yes again later you give them again.
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => setAsking(false)} disabled={busy} className={quietButton}>
                  Keep them
                </button>
                <button type="button" onClick={() => sayNo.mutate()} disabled={busy} className={dangerButton}>
                  {sayNo.isPending ? 'Removing…' : 'Remove my DBS details'}
                </button>
              </div>
            </div>
          )}

          {answers ? (
            <>
              {details?.verified_at && (
                <p className="text-body-sm text-on-surface-variant">
                  These have been checked. Changing the certificate’s details means they are checked again.
                </p>
              )}
              <DbsFields
                value={answers}
                // Permission is for the details as they stand: a change unticks the box.
                onChange={(patch) => setDraft({ ...answers, ...patch, ...('consent' in patch ? {} : { consent: false }) })}
                messageFor={messageFor}
                idFor={fieldId}
                dob={profile?.dob ?? record?.dob}
              />
              <div className="flex flex-wrap justify-end gap-2">
                {details && (
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(null)
                      setTried(false)
                      setError(null)
                    }}
                    disabled={busy}
                    className={quietButton}
                  >
                    Cancel
                  </button>
                )}
                <button type="button" onClick={submit} disabled={busy} className={primaryButton}>
                  {save.isPending ? 'Saving…' : 'Save DBS details'}
                </button>
              </div>
            </>
          ) : (
            details && (
              <div className="flex flex-col gap-3">
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-body-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-label-sm text-on-surface-faint">Check</dt>
                    <dd className="text-on-surface">{dbsKindLabel(details.kind)}</dd>
                  </div>
                  {details.certificate_number && (
                    <div>
                      <dt className="text-label-sm text-on-surface-faint">Certificate number</dt>
                      <dd className="break-all font-mono text-on-surface">{details.certificate_number}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-label-sm text-on-surface-faint">Issued</dt>
                    <dd className="text-on-surface">
                      {dbsDate(details.issued_on)}
                      {age ? ` · ${age}` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-label-sm text-on-surface-faint">Surname on it</dt>
                    <dd className="break-words text-on-surface">{details.surname}</dd>
                  </div>
                </dl>
                {details.verified_at ? (
                  <p className="rounded-[var(--radius-row)] bg-status-coordinator/15 px-4 py-3 text-body-sm text-on-surface">
                    <span className="font-semibold text-status-coordinator">Verified</span>
                    {' '}on {dbsDate(details.verified_at)}
                    {details.verified_by_name ? ` by ${details.verified_by_name}` : ''}
                    {dbsChecksText(details) ? `: ${dbsChecksText(details)}.` : '.'}
                  </p>
                ) : (
                  <p className="rounded-[var(--radius-row)] bg-raised px-4 py-3 text-body-sm text-on-surface-variant">
                    <span className="font-semibold text-on-surface">Waiting to be checked.</span> Have the original
                    certificate and photo ID to hand when you are next at church: whoever checks it has to see both.
                  </p>
                )}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setError(null)
                      // The box starts unticked: saving is giving permission, and that is theirs to do.
                      setDraft({ ...dbsAnswersOf(details, profile?.last_name ?? ''), consent: false })
                    }}
                    disabled={busy}
                    className={quietButton}
                  >
                    Change details
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      </QueryState>
    </SectionTile>
  )
}
