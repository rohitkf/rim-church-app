/**
 * What the church needs to know about somebody, and when it needs it.
 *
 * Signing up used to take an email and a password and leave a profile with
 * two names in it. Everything else sat empty on a Settings page nobody
 * visits twice, so a rota was built on whatever people had got round to
 * typing — and the compliance half of that is not something anybody should
 * be guessing at.
 *
 * The vocabulary lives here rather than in the form, because the same
 * words have to appear on the profile afterwards. A list of visa types in
 * two places is a list that disagrees with itself by the spring.
 */

export const MARITAL_STATUSES = [
  { value: 'single', label: 'Single' },
  { value: 'married', label: 'Married' },
  { value: 'widowed', label: 'Widowed' },
  { value: 'divorced', label: 'Divorced' },
] as const

export type MaritalStatus = (typeof MARITAL_STATUSES)[number]['value']

/**
 * The ways somebody is here.
 *
 * Not an exhaustive list of every UK route — that is a Home Office
 * document, not a dropdown — but the ones a church congregation actually
 * holds, with "Other" for the rest so nobody is forced into a wrong
 * answer. `settled` marks the statuses that do not run out: those people
 * are never asked for an expiry date, because asking implies there is one.
 */
export const VISA_TYPES: { value: string; label: string; settled: boolean }[] = [
  { value: 'british_citizen', label: 'British citizen', settled: true },
  { value: 'irish_citizen', label: 'Irish citizen', settled: true },
  { value: 'ilr', label: 'Indefinite leave to remain', settled: true },
  { value: 'eu_settled', label: 'EU settled status', settled: true },
  { value: 'eu_pre_settled', label: 'EU pre-settled status', settled: false },
  { value: 'skilled_worker', label: 'Skilled Worker visa', settled: false },
  { value: 'health_and_care', label: 'Health and Care Worker visa', settled: false },
  { value: 'student', label: 'Student visa', settled: false },
  { value: 'graduate', label: 'Graduate visa', settled: false },
  { value: 'dependant', label: 'Dependant visa', settled: false },
  { value: 'spouse_partner', label: 'Spouse or partner visa', settled: false },
  { value: 'minister_of_religion', label: 'Minister of Religion visa', settled: false },
  { value: 'visitor', label: 'Visitor visa', settled: false },
  { value: 'refugee', label: 'Refugee or humanitarian protection', settled: false },
  { value: 'other', label: 'Other', settled: false },
]

/** Whether this status runs out, and so whether an expiry is worth asking about. */
export function isSettledStatus(visaType: string | null | undefined): boolean {
  return VISA_TYPES.find((v) => v.value === visaType)?.settled ?? false
}

/** How a stored value reads on a page. Unknown values are shown as they are. */
export function visaLabel(value: string | null | undefined): string | null {
  if (!value) return null
  return VISA_TYPES.find((v) => v.value === value)?.label ?? value
}

export function maritalLabel(value: string | null | undefined): string | null {
  if (!value) return null
  return MARITAL_STATUSES.find((m) => m.value === value)?.label ?? value
}

export interface JoiningAnswers {
  firstName: string
  lastName: string
  phone: string
  dob: string
  maritalStatus: MaritalStatus | ''
  anniversary: string
  visaType: string
  /** Null until the question has been put to them. */
  visaHasExpiry: boolean | null
  visaExpiry: string
  hasDbs: boolean | null
}

/**
 * What is still missing, in the order the form asks for it.
 *
 * Returned as a list of field names rather than a boolean so the form can
 * point at the field rather than say "something is missing" — which is the
 * difference between a form that can be finished and one that cannot.
 *
 * The conditional questions are the point of doing this here: an
 * anniversary is required of somebody married and meaningless otherwise,
 * and an expiry date is required only of somebody whose status runs out
 * and who says theirs has one.
 */
export function missingAnswers(answers: JoiningAnswers): (keyof JoiningAnswers)[] {
  const missing: (keyof JoiningAnswers)[] = []
  if (!answers.firstName.trim()) missing.push('firstName')
  if (!answers.lastName.trim()) missing.push('lastName')
  if (!answers.phone.trim()) missing.push('phone')
  if (!answers.dob) missing.push('dob')
  if (!answers.maritalStatus) missing.push('maritalStatus')
  if (answers.maritalStatus === 'married' && !answers.anniversary) missing.push('anniversary')
  if (!answers.visaType) missing.push('visaType')
  if (!isSettledStatus(answers.visaType)) {
    if (answers.visaHasExpiry === null) missing.push('visaHasExpiry')
    if (answers.visaHasExpiry === true && !answers.visaExpiry) missing.push('visaExpiry')
  }
  if (answers.hasDbs === null) missing.push('hasDbs')
  return missing
}

export function isComplete(answers: JoiningAnswers): boolean {
  return missingAnswers(answers).length === 0
}

/**
 * The answers as the two tables want them.
 *
 * An anniversary belongs to somebody married — if they were married and
 * are no longer, the date goes rather than lingering on a Celebrations
 * page. Likewise an expiry date is cleared for a status that does not run
 * out, so a stale one from an older visa cannot outlive it.
 */
export function toProfileRows(answers: JoiningAnswers): {
  profile: Record<string, unknown>
  sensitive: Record<string, unknown>
} {
  const settled = isSettledStatus(answers.visaType)
  return {
    profile: {
      first_name: answers.firstName.trim(),
      last_name: answers.lastName.trim(),
      phone: answers.phone.trim() || null,
      dob: answers.dob || null,
      marital_status: answers.maritalStatus || null,
      anniversary: answers.maritalStatus === 'married' ? answers.anniversary || null : null,
    },
    sensitive: {
      visa_type: answers.visaType || null,
      visa_has_expiry: settled ? false : answers.visaHasExpiry,
      visa_expiry: settled || answers.visaHasExpiry !== true ? null : answers.visaExpiry || null,
      has_dbs: answers.hasDbs === true,
    },
  }
}
