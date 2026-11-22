import { DateField } from './DateTimeFields'
import { SegmentedControl, fieldTriggerClasses, inputClasses } from './Surface'
import { YesNoSwitch } from './YesNoSwitch'
import { todayIso } from '../lib/monthGrid'
import {
  DBS_CONSENT_WORDING,
  DBS_EARLIEST,
  DBS_KINDS,
  DBS_WORKFORCES,
  dbsAge,
  dbsDate,
  type DbsAnswers,
  type DbsField,
  type DbsKind,
  type DbsWorkforce,
} from '../lib/dbs'

const labelClasses = 'flex flex-col gap-1.5 text-body-sm text-on-surface-variant'
const hintClasses = 'text-label-sm text-on-surface-faint'

/**
 * The questions behind "yes, I have a DBS check" (0324).
 *
 * One set, on the joining form and on the profile, so the two cannot ask
 * for different things. What a check needs is GOV.UK's list: a Standard
 * or Enhanced certificate is checked by its number, the surname on it and
 * the date of birth, and a Basic one is shown with a share code from the
 * holder's DBS online account. The date of birth is the profile's own and
 * is not asked again here.
 *
 * Nothing but the first question is drawn until a check is chosen: the
 * rest depend on which it is, and a page of boxes that turn out not to
 * apply is its own confusion.
 *
 * It holds no state. Whoever uses it keeps the answers, says what is
 * wrong with each, and unticks the permission box when a detail changes:
 * permission is for the details as they stand.
 */
export function DbsFields({
  value,
  onChange,
  messageFor,
  idFor,
  dob,
  inputClassName = inputClasses,
  triggerClassName = fieldTriggerClasses,
}: {
  value: DbsAnswers
  onChange: (patch: Partial<DbsAnswers>) => void
  /** What is wrong with a question, in words, once that is due to be said. */
  messageFor: (field: DbsField) => string | null
  /** The id of the place a question lives, for "take me there". */
  idFor: (field: DbsField) => string
  /** The profile's date of birth, shown so they can see what the check will use. */
  dob?: string | null
  inputClassName?: string
  triggerClassName?: string
}) {
  const today = todayIso()
  const basic = value.kind === 'basic'
  const ring = (field: DbsField) => (messageFor(field) ? 'field-error' : '')
  const problem = (field: DbsField) => {
    const text = messageFor(field)
    return text ? (
      <span id={`${idFor(field)}-error`} className="text-label-sm text-error">
        {text}
      </span>
    ) : null
  }
  const described = (field: DbsField) =>
    messageFor(field) ? { 'aria-invalid': true, 'aria-describedby': `${idFor(field)}-error` } : {}
  const age = dbsAge(value.issued, today)

  return (
    <div className="flex flex-col gap-4">
      <div id={idFor('kind')} className={labelClasses}>
        <span>Which DBS check is it?</span>
        <div className={`rounded-full ${ring('kind')}`}>
          <SegmentedControl<DbsKind>
            label="Which DBS check is it?"
            value={value.kind || null}
            onChange={(kind) => onChange({ kind })}
            options={DBS_KINDS}
          />
        </div>
        {problem('kind')}
        <span className={hintClasses}>It is printed on the certificate, near the top.</span>
      </div>

      {value.kind && (
        <>
          <label id={idFor('certificate')} className={labelClasses}>
            {basic ? 'Certificate number (if you have the certificate)' : 'Certificate number'}
            <input
              value={value.certificate}
              onChange={(e) => onChange({ certificate: e.target.value })}
              inputMode="numeric"
              autoComplete="off"
              maxLength={20}
              placeholder="12 digits"
              {...described('certificate')}
              className={`${inputClassName} font-mono ${ring('certificate')}`}
            />
            {problem('certificate')}
            <span className={hintClasses}>The 12-digit number at the top right of the certificate.</span>
          </label>

          {basic && (
            <label id={idFor('shareCode')} className={labelClasses}>
              Share code (if you applied online)
              <input
                value={value.shareCode}
                onChange={(e) => onChange({ shareCode: e.target.value })}
                autoComplete="off"
                autoCapitalize="characters"
                maxLength={30}
                {...described('shareCode')}
                className={`${inputClassName} font-mono ${ring('shareCode')}`}
              />
              {problem('shareCode')}
              <span className={hintClasses}>
                From your DBS online account on GOV.UK, where you can share your certificate. Give the code, the
                certificate number, or both.
              </span>
            </label>
          )}

          <label id={idFor('surname')} className={labelClasses}>
            Surname on the certificate
            <input
              value={value.surname}
              onChange={(e) => onChange({ surname: e.target.value })}
              autoComplete="off"
              maxLength={80}
              {...described('surname')}
              className={`${inputClassName} ${ring('surname')}`}
            />
            {problem('surname')}
            <span className={hintClasses}>Exactly as the certificate has it, if it differs from your name here.</span>
          </label>

          <label id={idFor('issued')} className={labelClasses}>
            Date it was issued
            <DateField
              value={value.issued}
              onChange={(issued) => onChange({ issued })}
              label="Date the certificate was issued"
              min={DBS_EARLIEST}
              max={today}
              className={`${triggerClassName} ${ring('issued')}`}
            />
            {problem('issued')}
            {age && !messageFor('issued') && <span className={hintClasses}>{age}.</span>}
          </label>

          {!basic && (
            <>
              <div id={idFor('workforce')} className={labelClasses}>
                <span>Which workforce is it for?</span>
                <div className={`rounded-[var(--radius-chip)] ${ring('workforce')}`}>
                  <SegmentedControl<DbsWorkforce>
                    label="Which workforce is the certificate for?"
                    value={value.workforce || null}
                    onChange={(workforce) => onChange({ workforce })}
                    options={DBS_WORKFORCES}
                    wraps
                  />
                </div>
                {problem('workforce')}
                <span className={hintClasses}>Printed on the certificate as “Child Workforce”, “Adult Workforce” and so on.</span>
              </div>

              <div id={idFor('updateService')} className={labelClasses}>
                <span>Is it on the DBS Update Service?</span>
                <div className={`max-w-xs rounded-full ${ring('updateService')}`}>
                  <YesNoSwitch
                    label="Is it on the DBS Update Service?"
                    value={value.updateService}
                    onChange={(updateService) => onChange({ updateService })}
                  />
                </div>
                {problem('updateService')}
                <span className={hintClasses}>
                  The yearly subscription that keeps a certificate up to date. If you are not sure, answer no.
                </span>
              </div>
            </>
          )}

          <p className={hintClasses}>
            {dob
              ? `The check also uses your date of birth, ${dbsDate(dob)}, from your details above.`
              : 'The check also uses your date of birth, from your details above.'}{' '}
            Whoever checks it will ask to see the original certificate and photo ID, so have both to hand when you are
            next at church.
          </p>

          {/* Unticked until they tick it, and unticked again when a detail changes. */}
          <div id={idFor('consent')} className="flex flex-col gap-1.5">
            <label className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-chip)] p-1 ${ring('consent')}`}>
              <input
                type="checkbox"
                checked={value.consent}
                onChange={(e) => onChange({ consent: e.target.checked })}
                {...described('consent')}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span className="text-body-sm text-on-surface">{DBS_CONSENT_WORDING}</span>
            </label>
            {problem('consent')}
          </div>
        </>
      )}
    </div>
  )
}
