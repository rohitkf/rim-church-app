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

import { nameProblem, tidyName } from './personName'
import { ownDobProblem } from './ownAge'

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
  /** Optional: what a date cannot say about the visa. */
  visaNote: string
  /** Where they live: their household's address (0149), asked of everybody since 0301. */
  addressLine1: string
  /** Optional. */
  addressLine2: string
  town: string
  postcode: string
  /** Who to ring if something happens to them, and on what number (0301). */
  emergencyName: string
  /** What that person is to them (0302): one of EMERGENCY_RELATIONS. */
  emergencyRelation: EmergencyRelation | ''
  emergencyPhone: string
}

/**
 * What the person to ring is to them (0302), one word for one person
 * (0305).
 *
 * A short list rather than a sentence: the word is read at a glance by
 * somebody about to make a hard phone call, and a list is the same word
 * for the same thing on every profile. It began with two people to a word
 * — "Husband or wife", "Brother or sister" — which confused whoever was
 * choosing (they look for the one word that is theirs) and told whoever
 * was ringing less than they wanted. "Other" is there so nobody is forced
 * into a wrong answer.
 */
export const EMERGENCY_RELATIONS = [
  { value: 'husband', label: 'Husband' },
  { value: 'wife', label: 'Wife' },
  { value: 'partner', label: 'Partner' },
  { value: 'father', label: 'Father' },
  { value: 'mother', label: 'Mother' },
  { value: 'son', label: 'Son' },
  { value: 'daughter', label: 'Daughter' },
  { value: 'brother', label: 'Brother' },
  { value: 'sister', label: 'Sister' },
  { value: 'relative', label: 'Other relative' },
  { value: 'friend', label: 'Friend' },
  { value: 'other', label: 'Other' },
] as const

/**
 * The four answers the list offered until 0305, each two people to a
 * word. They are not offered now, and an answer given is not thrown away:
 * it is kept, read as the words it was chosen as, and can be changed for a
 * closer one. The database's check holds this list and the one above;
 * joining.test.ts fails if the three differ.
 */
export const EMERGENCY_RELATIONS_BEFORE = [
  { value: 'spouse', label: 'Husband or wife' },
  { value: 'parent', label: 'Parent' },
  { value: 'child', label: 'Son or daughter' },
  { value: 'sibling', label: 'Brother or sister' },
] as const

export type EmergencyRelation =
  | (typeof EMERGENCY_RELATIONS)[number]['value']
  | (typeof EMERGENCY_RELATIONS_BEFORE)[number]['value']

const EVERY_RELATION: readonly { value: EmergencyRelation; label: string }[] = [...EMERGENCY_RELATIONS, ...EMERGENCY_RELATIONS_BEFORE]

/** A stored relationship as a known one, or blank: a value this app has never heard of is asked again. */
export function emergencyRelationOf(value: string | null | undefined): EmergencyRelation | '' {
  return EVERY_RELATION.find((r) => r.value === value)?.value ?? ''
}

/**
 * What the picker offers: the list, and — for somebody whose answer is one
 * of the four from before — that answer too, at the end, so their own
 * choice is shown as chosen rather than as a blank to be filled in again.
 */
export function emergencyRelationOptions(current: string | null | undefined): { value: string; label: string }[] {
  const before = EMERGENCY_RELATIONS_BEFORE.find((r) => r.value === current)
  return [...EMERGENCY_RELATIONS, ...(before ? [before] : [])].map((r) => ({ value: r.value, label: r.label }))
}

/** How a stored relationship reads on a page. Unknown values are shown as they are. */
export function emergencyRelationLabel(value: string | null | undefined): string | null {
  if (!value) return null
  return EVERY_RELATION.find((r) => r.value === value)?.label ?? value
}

/**
 * Which form this app puts to people, by number (0301).
 *
 * The database holds an app to the questions it can ask: the door asks
 * `my_profile_gaps_for(JOINING_FORM)`, and an app from before a question
 * existed is never told about it — told, it would show a form with no box
 * for the answer and no way past. Add a question here and in
 * `profile_gaps()`, and this number goes up with it.
 *
 * Form 4 (0321) asks nothing new: its date of birth has to be one that
 * can be theirs, so somebody who left the picker on today is asked again.
 */
export const JOINING_FORM = 4

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
  if (!answers.addressLine1.trim()) missing.push('addressLine1')
  if (!answers.town.trim()) missing.push('town')
  if (!answers.postcode.trim()) missing.push('postcode')
  if (!answers.emergencyName.trim()) missing.push('emergencyName')
  if (!answers.emergencyRelation) missing.push('emergencyRelation')
  if (!answers.emergencyPhone.trim()) missing.push('emergencyPhone')
  return missing
}

/**
 * What each unanswered question says once somebody has tried to go in, and
 * what it is called in the list of what is still to do.
 *
 * A red outline alone left people tapping "Finish and go in" again and
 * again: on a phone the empty box is usually off the screen, and an outline
 * does not say what it wants. So each blank says so in words, under itself,
 * and the list by the button names them.
 */
export const MISSING_TEXT: Record<keyof JoiningAnswers, { label: string; message: string }> = {
  firstName: { label: 'First name', message: 'Enter your first name.' },
  lastName: { label: 'Last name', message: 'Enter your last name.' },
  phone: { label: 'Phone number', message: 'Enter your phone number.' },
  dob: { label: 'Date of birth', message: 'Choose your date of birth.' },
  maritalStatus: { label: 'Marital status', message: 'Choose your marital status.' },
  anniversary: { label: 'Wedding anniversary', message: 'Choose your wedding anniversary.' },
  visaType: { label: 'Your status in the UK', message: 'Choose your status in the UK.' },
  visaHasExpiry: { label: 'Whether your status has an expiry date', message: 'Answer yes or no.' },
  visaExpiry: { label: 'Expiry date', message: 'Choose the expiry date.' },
  hasDbs: { label: 'DBS check', message: 'Answer yes or no.' },
  visaNote: { label: 'Comment', message: '' },
  addressLine1: { label: 'Address line 1', message: 'Enter the first line of your address.' },
  addressLine2: { label: 'Address line 2', message: '' },
  town: { label: 'Town or city', message: 'Enter your town or city.' },
  postcode: { label: 'Postcode', message: 'Enter your postcode.' },
  emergencyName: { label: 'Emergency contact’s name', message: 'Enter the name of somebody we can ring in an emergency.' },
  emergencyRelation: { label: 'Emergency contact’s relationship to you', message: 'Choose who they are to you.' },
  emergencyPhone: { label: 'Emergency contact’s number', message: 'Enter their phone number.' },
}

/** The id of the place on the form a question lives, for "take me there". */
export const joiningFieldId = (field: keyof JoiningAnswers) => `joining-${field}`

/** A name here is a name everywhere: lib/personName.ts is the one rule (0306). This adds the form's own length. */
function ownNameProblem(value: string, what: string): string | null {
  if (tidyName(value).length > 50) return 'Keep it to 50 letters or fewer.'
  return nameProblem(value, what)
}

/**
 * What is filled in but cannot be right, in words, by field.
 *
 * Separate from `missingAnswers`: a blank is "still to answer", this is
 * "answered, and wrong". Phone is checked by its own field, which knows
 * the country. An expiry that has already passed is allowed — people do
 * hold a visa they are renewing, and refusing to record that would be
 * refusing the truth — so it is not an error here.
 */
export function invalidAnswers(
  answers: JoiningAnswers,
  today: Date = new Date(),
): Partial<Record<keyof JoiningAnswers, string>> {
  const bad: Partial<Record<keyof JoiningAnswers, string>> = {}
  const first = ownNameProblem(answers.firstName, 'First name')
  if (first) bad.firstName = first
  const last = ownNameProblem(answers.lastName, 'Last name')
  if (last) bad.lastName = last

  const year = (iso: string) => Number(iso.slice(0, 4))
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  // A date of birth has to be one that can be theirs (0321): not today, not this year, not 1850.
  const dobProblem = ownDobProblem(answers.dob, today)
  if (dobProblem) bad.dob = dobProblem
  if (answers.maritalStatus === 'married' && answers.anniversary) {
    if (answers.anniversary > todayIso) bad.anniversary = 'The anniversary can’t be in the future.'
    else if (answers.dob && year(answers.anniversary) < year(answers.dob) + 14) {
      bad.anniversary = 'That’s too soon after your date of birth.'
    }
  }
  if (answers.visaHasExpiry === true && answers.visaExpiry && !isSettledStatus(answers.visaType)) {
    const y = year(answers.visaExpiry)
    if (y < 2000 || y > today.getFullYear() + 20) bad.visaExpiry = 'That date doesn’t look right.'
  }
  const ring = emergencyProblems(answers.emergencyName, answers.emergencyPhone, answers.phone)
  if (ring.name) bad.emergencyName = ring.name
  if (ring.phone) bad.emergencyPhone = ring.phone
  return bad
}

/** The household's address, as the database keeps it (0149): the lengths its columns allow. */
export const ADDRESS_LIMITS = { line: 120, town: 80, postcode: 12 } as const
/** How long an emergency contact's name may be (0301's check). */
export const EMERGENCY_NAME_LIMIT = 100

/**
 * What is wrong with an emergency contact that has been typed, by part.
 *
 * Shared by the joining form and the profile, so the two cannot hold the
 * same person to different rules. The number has to be somebody else's:
 * a person's own number is the one that will not be answered when it is
 * needed. Whether the number is a number at all is its field's to say.
 */
export function emergencyProblems(
  name: string,
  phone: string,
  ownPhone: string | null | undefined,
): { name?: string; phone?: string } {
  const problems: { name?: string; phone?: string } = {}
  if (name.trim().length > EMERGENCY_NAME_LIMIT) problems.name = `Keep it to ${EMERGENCY_NAME_LIMIT} letters or fewer.`
  else {
    const wrong = nameProblem(name, 'Their name')
    if (wrong) problems.name = wrong
  }
  const digits = (value: string | null | undefined) => (value ?? '').replace(/[^\d+]/g, '')
  if (phone.trim() && digits(phone) === digits(ownPhone)) {
    problems.phone = 'That is your own number. Give somebody else’s, who can be rung about you.'
  }
  return problems
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
  /** For save_household_address(): the household's, shared by a linked couple. */
  address: { line1: string; line2: string; town: string; postcode: string }
} {
  const settled = isSettledStatus(answers.visaType)
  return {
    profile: {
      first_name: tidyName(answers.firstName),
      last_name: tidyName(answers.lastName),
      phone: answers.phone.trim() || null,
      dob: answers.dob || null,
      marital_status: answers.maritalStatus || null,
      anniversary: answers.maritalStatus === 'married' ? answers.anniversary || null : null,
      emergency_contact_name: tidyName(answers.emergencyName) || null,
      emergency_contact_relation: answers.emergencyRelation || null,
      emergency_contact_phone: answers.emergencyPhone.trim() || null,
    },
    sensitive: {
      visa_type: answers.visaType || null,
      visa_has_expiry: settled ? false : answers.visaHasExpiry,
      visa_expiry: settled || answers.visaHasExpiry !== true ? null : answers.visaExpiry || null,
      has_dbs: answers.hasDbs === true,
      visa_note: answers.visaNote.trim() || null,
    },
    address: {
      line1: answers.addressLine1.trim(),
      line2: answers.addressLine2.trim(),
      town: answers.town.trim(),
      postcode: answers.postcode.trim().toUpperCase(),
    },
  }
}
