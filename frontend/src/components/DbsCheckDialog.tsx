import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { Overlay } from './Surface'
import { QueryState } from './QueryState'
import { useErrorText } from '../lib/useErrorText'
import { todayIso } from '../lib/monthGrid'
import {
  DBS_ROWS_KEY,
  dbsAge,
  dbsChecksText,
  dbsDate,
  dbsKey,
  dbsKindLabel,
  dbsMoment,
  dbsWorkforceLabel,
  fetchDbs,
  unverifyDbs,
  verifyDbs,
  type DbsChecks,
  type DbsLogEntry,
} from '../lib/dbs'

const quietButton =
  'tap rounded-full px-4 py-2.5 text-body-sm font-medium text-on-surface ring-1 ring-black/8 transition-[background-color,color,box-shadow,opacity,transform] duration-200 ease-[var(--ease-glide)] hover:ring-black/20 disabled:opacity-50 dark:ring-white/10'
const primaryButton =
  'tap rounded-full bg-primary px-5 py-2.5 text-body-sm font-semibold text-on-primary transition-transform duration-300 ease-[var(--ease-glide)] active:scale-[0.97] active:duration-[80ms] disabled:opacity-50'

/** Where GOV.UK's guide to the Update Service is: the status check starts from it. */
const UPDATE_SERVICE_URL = 'https://www.gov.uk/dbs-update-service'

const EVENT_TEXT: Record<string, string> = {
  consent: 'Gave permission for the check',
  verified: 'Marked verified',
  unverified: 'No longer verified',
  removed: 'Details removed',
}

function Fact({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-label-sm text-on-surface-faint">{label}</dt>
      <dd className={`break-words text-body-sm text-on-surface ${mono ? 'break-all font-mono' : ''}`}>{children}</dd>
    </div>
  )
}

function logLine(entry: DbsLogEntry): string {
  const what = EVENT_TEXT[entry.event] ?? entry.event
  const by = entry.event !== 'consent' && entry.by_name ? ` by ${entry.by_name}` : ''
  // The words of a permission are shown once, above; a check says what was looked at.
  const detail = entry.event !== 'consent' && entry.wording ? `: ${entry.wording.replace(/\.$/, '')}` : ''
  return `${what}${by}${detail}`
}

/**
 * Somebody's DBS, for whoever checks it (0324).
 *
 * Everything a check needs is on one screen, in the order GOV.UK asks for
 * it: the certificate number, the surname as the certificate has it, the
 * date of birth. Then what the checker did, ticked by them, and a button
 * that puts their name and the time to it.
 *
 * Nobody marks their own verified, bar the Owner (0325): `people.compliance`
 * is the Owner's alone out of the box, and there is nobody above them to
 * do it. The record then has their own name against their own certificate.
 *
 * It does not run the check. The Update Service is GOV.UK's, used by a
 * person who has the original certificate and the holder's ID in front of
 * them; this is where the result is written down.
 */
export function DbsCheckDialog({
  person,
  onClose,
}: {
  person: { id: string; first_name: string; last_name: string }
  onClose: () => void
}) {
  const { profile, isSuperAdmin } = useAuth()
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [checks, setChecks] = useState<DbsChecks>({ statusChecked: false, certificateSeen: false, idSeen: false })
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const name = [person.first_name, person.last_name].filter(Boolean).join(' ') || 'This person'
  const first = person.first_name || 'They'
  const query = useQuery({ queryKey: dbsKey(person.id), queryFn: () => fetchDbs(person.id) })
  const record = query.data
  const details = record?.details ?? null
  // Nobody marks their own verified, bar the Owner (0325): there is nobody above them to do it.
  const own = profile?.id === person.id
  const ownRefused = own && !isSuperAdmin
  const today = todayIso()

  const settled = async () => {
    setError(null)
    setChecks({ statusChecked: false, certificateSeen: false, idSeen: false })
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: dbsKey(person.id) }),
      queryClient.invalidateQueries({ queryKey: DBS_ROWS_KEY }),
    ])
  }

  const verify = useMutation({
    mutationFn: () => verifyDbs(person.id, checks),
    onSuccess: settled,
    onError: (err) => setError(errorText(err, 'Could not mark it verified.')),
  })
  const takeBack = useMutation({
    mutationFn: () => unverifyDbs(person.id),
    onSuccess: settled,
    onError: (err) => setError(errorText(err, 'Could not take the check back.')),
  })
  const busy = verify.isPending || takeBack.isPending
  const ticked = checks.statusChecked || checks.certificateSeen || checks.idSeen

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // No clipboard here: the number is on the screen to be read.
    }
  }

  const age = dbsAge(details?.issued_on, today)
  const basic = details?.kind === 'basic'

  return (
    <Overlay closable={!busy} onDismiss={onClose} label={`${name}’s DBS`}>
      <div className="max-h-[calc(100svh-2rem)] w-full max-w-md overflow-y-auto rounded-[var(--radius-shell)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12">
        <h2 className="break-words pr-8 text-headline-md">{name}’s DBS</h2>

        <QueryState isLoading={query.isLoading} error={query.error}>
          {record && !record.has_dbs && (
            <p className="mt-3 text-body-sm text-on-surface-variant">{first} says they do not have a DBS check.</p>
          )}
          {record && record.has_dbs && !details && (
            <p className="mt-3 text-body-sm text-on-surface-variant">
              {first} says they have a DBS check and has not given its details yet. The app asks for them the next time
              they open it, and does not let them past until they are given.
            </p>
          )}

          {record && details && (
            <div className="mt-4 flex flex-col gap-5">
              {details.verified_at ? (
                <p className="rounded-[var(--radius-row)] bg-status-coordinator/15 px-4 py-3 text-body-sm text-on-surface">
                  <span className="font-semibold text-status-coordinator">Verified</span> on {dbsMoment(details.verified_at)}
                  {details.verified_by_name ? ` by ${details.verified_by_name}` : ''}
                  {dbsChecksText(details) ? `: ${dbsChecksText(details)}.` : '.'}
                </p>
              ) : (
                <p className="rounded-[var(--radius-row)] bg-raised px-4 py-3 text-body-sm text-on-surface">
                  <span className="font-semibold">Not checked yet.</span>
                </p>
              )}

              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                <Fact label="Check">{dbsKindLabel(details.kind)}</Fact>
                <Fact label="Issued">
                  {dbsDate(details.issued_on)}
                  {age ? ` · ${age}` : ''}
                </Fact>
                {details.certificate_number && (
                  <div className="min-w-0 sm:col-span-2">
                    <dt className="text-label-sm text-on-surface-faint">Certificate number</dt>
                    <dd className="flex flex-wrap items-center gap-3">
                      <span className="break-all font-mono text-body-md text-on-surface">{details.certificate_number}</span>
                      <button
                        type="button"
                        onClick={() => void copy(details.certificate_number ?? '')}
                        className="tap rounded-full px-3 py-1.5 text-label-md font-medium text-on-surface ring-1 ring-black/8 dark:ring-white/10"
                      >
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </dd>
                  </div>
                )}
                {details.share_code && (
                  <Fact label="Share code" mono>
                    {details.share_code}
                  </Fact>
                )}
                <Fact label="Surname on the certificate">{details.surname}</Fact>
                <Fact label="Date of birth">{record.dob ? dbsDate(record.dob) : 'Not given'}</Fact>
                {!basic && <Fact label="Workforce">{dbsWorkforceLabel(details.workforce)}</Fact>}
                {!basic && <Fact label="On the Update Service">{details.update_service ? 'Yes' : 'No'}</Fact>}
              </dl>

              <div className="text-body-sm text-on-surface-variant">
                <p>
                  <span className="font-medium text-on-surface">Permission given</span> on {dbsMoment(details.consented_at)}:
                </p>
                <p className="mt-1 border-l-2 border-border-subtle pl-3 italic">“{details.consent_wording}”</p>
              </div>

              <div className="rounded-[var(--radius-row)] bg-raised p-4 text-body-sm text-on-surface-variant">
                <p className="font-medium text-on-surface">How to check it</p>
                {basic ? (
                  <p className="mt-1">
                    A Basic certificate is checked by seeing the original with {first}’s photo ID. If they applied online
                    they can also share it from their DBS online account: GOV.UK sends you a link, and asks for the share
                    code{details.certificate_number ? ', the certificate number' : ''}, their surname and date of birth.
                  </p>
                ) : details.update_service ? (
                  <p className="mt-1">
                    See the original certificate and {first}’s photo ID first: GOV.UK asks you to confirm you have. Then
                    run a status check on the{' '}
                    <a href={UPDATE_SERVICE_URL} target="_blank" rel="noreferrer" className="font-medium text-primary underline">
                      DBS Update Service
                    </a>{' '}
                    with the certificate number, the surname as above and the date of birth. It is free.
                  </p>
                ) : (
                  <p className="mt-1">
                    It is not on the Update Service, so it cannot be checked online. See the original certificate and{' '}
                    {first}’s photo ID, and check the name, date of birth and certificate number against what is here.
                  </p>
                )}
              </div>

              {error && (
                <p role="alert" className="rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
                  {error}
                </p>
              )}

              {ownRefused ? (
                <p className="text-body-sm text-on-surface-variant">
                  Somebody else has to check your own DBS: the Owner, or anybody else the Owner has given “Safeguarding
                  details” in Settings › Permissions.
                </p>
              ) : details.verified_at ? (
                <div className="flex justify-end">
                  <button type="button" onClick={() => takeBack.mutate()} disabled={busy} className={quietButton}>
                    {takeBack.isPending ? 'Taking it back…' : 'Take the check back'}
                  </button>
                </div>
              ) : (
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-body-sm font-medium text-on-surface">What you checked</legend>
                  {own && (
                    <p className="mb-1 text-body-sm text-on-surface-variant">
                      This is your own. As the Owner you can mark it yourself; the record will show your name against it.
                    </p>
                  )}
                  {(
                    [
                      ['statusChecked', basic ? 'Seen the shared certificate online' : 'Checked online, and it is current'],
                      ['certificateSeen', 'Seen the original certificate'],
                      ['idSeen', 'Seen their photo ID'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex cursor-pointer items-start gap-3 py-1 text-body-sm text-on-surface">
                      <input
                        type="checkbox"
                        checked={checks[key]}
                        onChange={(e) => setChecks((was) => ({ ...was, [key]: e.target.checked }))}
                        disabled={busy}
                        className="mt-0.5 h-4 w-4 shrink-0"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                  <div className="mt-2 flex justify-end">
                    <button type="button" onClick={() => verify.mutate()} disabled={busy || !ticked} className={primaryButton}>
                      {verify.isPending ? 'Saving…' : 'Mark as verified'}
                    </button>
                  </div>
                </fieldset>
              )}
            </div>
          )}

          {record && record.log.length > 0 && (
            <details className="mt-5 text-body-sm text-on-surface-variant">
              <summary className="cursor-pointer font-medium text-on-surface">History</summary>
              <ul className="mt-2 flex flex-col gap-1.5">
                {record.log.map((entry, index) => (
                  <li key={index} className="break-words">
                    <span className="text-on-surface-faint">{dbsMoment(entry.at)}</span> · {logLine(entry)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </QueryState>

        <div className="mt-6 flex justify-end">
          <button type="button" onClick={onClose} disabled={busy} className={quietButton}>
            Done
          </button>
        </div>
      </div>
    </Overlay>
  )
}
