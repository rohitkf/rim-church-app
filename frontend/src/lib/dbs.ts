import { z } from 'zod'
import { supabase } from './supabaseClient'

/*
 * A DBS is details, and somebody checks it (0324).
 *
 * "Do you have a valid DBS check?" was a yes or a no. Somebody who says
 * yes now gives what a check needs — which certificate, its number, the
 * surname on it, when it was issued — and permission to check it; and
 * whoever holds `people.compliance` marks it verified once they have.
 *
 * The rules here are the form's copy of `save_my_dbs()`: the database
 * refuses the same things in the same words, and `dbs.test.ts` holds the
 * two together.
 */

export type DbsKind = 'enhanced' | 'standard' | 'basic'
export type DbsWorkforce = 'child' | 'adult' | 'both' | 'other'

export const DBS_KINDS: { value: DbsKind; label: string }[] = [
  { value: 'enhanced', label: 'Enhanced' },
  { value: 'standard', label: 'Standard' },
  { value: 'basic', label: 'Basic' },
]

export const DBS_WORKFORCES: { value: DbsWorkforce; label: string }[] = [
  { value: 'child', label: 'Children' },
  { value: 'adult', label: 'Adults' },
  { value: 'both', label: 'Children and adults' },
  { value: 'other', label: 'Other' },
]

export const dbsKindLabel = (kind: string | null | undefined) =>
  DBS_KINDS.find((k) => k.value === kind)?.label ?? ''
export const dbsWorkforceLabel = (workforce: string | null | undefined) =>
  DBS_WORKFORCES.find((w) => w.value === workforce)?.label ?? ''

/**
 * What the person agrees to. The words kept with their permission are the
 * database's own (`dbs_consent_wording()`), so these have to be the same
 * ones: what is on the screen is what goes on record.
 */
export const DBS_CONSENT_WORDING =
  'I give the church permission to use these details to check my DBS certificate, and to keep a record that it was checked.'

/** The first of these certificates were issued in March 2002. */
export const DBS_EARLIEST = '2002-03-01'

/** The answers as the form holds them. */
export interface DbsAnswers {
  kind: DbsKind | ''
  certificate: string
  surname: string
  /** The date on the certificate, as yyyy-mm-dd. */
  issued: string
  workforce: DbsWorkforce | ''
  updateService: boolean | null
  shareCode: string
  /** Theirs to tick, every time the details change. */
  consent: boolean
}

export type DbsField = keyof DbsAnswers

export const EMPTY_DBS: DbsAnswers = {
  kind: '',
  certificate: '',
  surname: '',
  issued: '',
  workforce: '',
  updateService: null,
  shareCode: '',
  consent: false,
}

/** As typed, less the spaces and dashes a number is copied with. */
export const tidyCertificate = (value: string) => value.replace(/[\s-]/g, '')
export const tidyShareCode = (value: string) => value.replace(/[\s-]/g, '').toUpperCase()

/** What each question is called, and what it says when it is blank. */
export const DBS_TEXT: Record<DbsField, { label: string; message: string }> = {
  kind: { label: 'Which DBS check', message: 'Choose which DBS check you have.' },
  certificate: { label: 'DBS certificate number', message: 'Enter the 12-digit certificate number.' },
  surname: { label: 'Surname on the certificate', message: 'Enter the surname on the certificate.' },
  issued: { label: 'Date the certificate was issued', message: 'Choose the date the certificate was issued.' },
  workforce: { label: 'Workforce on the certificate', message: 'Choose the workforce the certificate is for.' },
  updateService: { label: 'Whether it is on the Update Service', message: 'Say whether it is on the Update Service.' },
  shareCode: { label: 'Share code', message: 'Give the share code or the certificate number.' },
  consent: { label: 'Permission to check it', message: 'Tick the box to give permission for the check.' },
}

/** The order the questions sit in on the page. */
export const DBS_ORDER: DbsField[] = [
  'kind', 'certificate', 'shareCode', 'surname', 'issued', 'workforce', 'updateService', 'consent',
]

/**
 * Which questions are on the screen for this certificate. Nothing but the
 * first until a check is chosen; a Basic check is not asked about a
 * workforce or the Update Service, which are not things it has.
 */
export function dbsAsked(answers: DbsAnswers): DbsField[] {
  if (!answers.kind) return ['kind']
  if (answers.kind === 'basic') return ['kind', 'certificate', 'shareCode', 'surname', 'issued', 'consent']
  return ['kind', 'certificate', 'surname', 'issued', 'workforce', 'updateService', 'consent']
}

/** The questions with no answer that need one. */
export function dbsMissing(answers: DbsAnswers): DbsField[] {
  if (!answers.kind) return ['kind']
  const missing: DbsField[] = []
  const number = tidyCertificate(answers.certificate)
  if (answers.kind === 'basic') {
    // A share code only exists for somebody who applied online themselves: either will do.
    if (!number && !tidyShareCode(answers.shareCode)) missing.push('shareCode')
  } else if (!number) {
    missing.push('certificate')
  }
  if (!answers.surname.trim()) missing.push('surname')
  if (!answers.issued) missing.push('issued')
  if (answers.kind !== 'basic') {
    if (!answers.workforce) missing.push('workforce')
    if (answers.updateService === null) missing.push('updateService')
  }
  if (!answers.consent) missing.push('consent')
  return missing
}

/** The questions answered with something that cannot be right, and why. */
export function dbsInvalid(answers: DbsAnswers, today: string): Partial<Record<DbsField, string>> {
  const problems: Partial<Record<DbsField, string>> = {}
  if (!answers.kind) return problems
  const number = tidyCertificate(answers.certificate)
  if (number && !/^[0-9]{12}$/.test(number)) {
    const digits = number.replace(/\D/g, '').length
    problems.certificate = /^[0-9]+$/.test(number)
      ? `A DBS certificate number is 12 digits. That is ${digits}.`
      : 'A DBS certificate number is 12 digits.'
  }
  const code = tidyShareCode(answers.shareCode)
  if (answers.kind === 'basic' && code && !/^[A-Z0-9]{4,20}$/.test(code)) {
    problems.shareCode = 'That share code does not look right. Copy it exactly as GOV.UK gave it.'
  }
  if (answers.surname.trim().length > 80) problems.surname = 'Keep the surname to 80 letters or fewer.'
  if (answers.issued) {
    if (answers.issued > today) problems.issued = 'The date of issue cannot be in the future.'
    else if (answers.issued < DBS_EARLIEST) problems.issued = 'No certificate is that old. Check the year.'
  }
  return problems
}

export const dbsComplete = (answers: DbsAnswers, today: string) =>
  dbsMissing(answers).length === 0 && Object.keys(dbsInvalid(answers, today)).length === 0

/**
 * How old a certificate is, in whole years and months: "3 years 8 months
 * old". Null for no date, or one that is not in the past.
 */
export function dbsAge(issued: string | null | undefined, today: string): string | null {
  if (!issued || !/^\d{4}-\d{2}-\d{2}$/.test(issued) || issued > today) return null
  const [fy, fm, fd] = issued.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  let months = (ty - fy) * 12 + (tm - fm)
  if (td < fd) months -= 1
  if (months <= 0) return 'Less than a month old'
  const years = Math.floor(months / 12)
  const rest = months % 12
  const parts = [
    years > 0 ? `${years} ${years === 1 ? 'year' : 'years'}` : '',
    rest > 0 ? `${rest} ${rest === 1 ? 'month' : 'months'}` : '',
  ].filter(Boolean)
  return `${parts.join(' ')} old`
}

/** "14 March 2023" from 2023-03-14. Its own, so a date never shifts a day by time zone. */
export function dbsDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return ''
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  return `${Number(match[3])} ${months[Number(match[2]) - 1]} ${match[1]}`
}

/** A moment, as a person reads one: "22 November 2026, 21:14". */
export function dbsMoment(iso: string | null | undefined): string {
  if (!iso) return ''
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  return at.toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ---------------------------------------------------------------------------
// What is on record
// ---------------------------------------------------------------------------

export const dbsDetailsSchema = z.object({
  kind: z.enum(['enhanced', 'standard', 'basic']),
  certificate_number: z.string().nullable(),
  surname: z.string(),
  issued_on: z.string(),
  workforce: z.enum(['child', 'adult', 'both', 'other']).nullable(),
  update_service: z.boolean().nullable(),
  share_code: z.string().nullable(),
  consented_at: z.string(),
  consent_wording: z.string(),
  verified_at: z.string().nullable(),
  verified_by: z.string().nullable(),
  verified_by_name: z.string().nullable(),
  status_checked: z.boolean(),
  certificate_seen: z.boolean(),
  id_seen: z.boolean(),
})
export type DbsDetails = z.infer<typeof dbsDetailsSchema>

const dbsLogSchema = z.object({
  at: z.string(),
  event: z.string(),
  kind: z.string().nullable(),
  wording: z.string().nullable(),
  by_name: z.string().nullable(),
})
export type DbsLogEntry = z.infer<typeof dbsLogSchema>

export const dbsRecordSchema = z.object({
  user_id: z.string(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  dob: z.string().nullable(),
  has_dbs: z.boolean(),
  details: dbsDetailsSchema.nullable(),
  log: z.array(dbsLogSchema),
})
export type DbsRecord = z.infer<typeof dbsRecordSchema>

const DBS_KEY = ['dbs'] as const
export const dbsKey = (userId: string | null | undefined) => [...DBS_KEY, userId ?? ''] as const

/** One person's: their own, or anybody's for whoever may check. */
export async function fetchDbs(userId: string): Promise<DbsRecord> {
  const { data, error } = await supabase.rpc('dbs_of', { p_person: userId })
  if (error) throw error
  return dbsRecordSchema.parse(data)
}

/** The details and the permission, together: the database takes neither alone. */
export async function saveMyDbs(answers: DbsAnswers): Promise<void> {
  const basic = answers.kind === 'basic'
  const { error } = await supabase.rpc('save_my_dbs', {
    p_kind: answers.kind,
    p_certificate: tidyCertificate(answers.certificate) || null,
    p_surname: answers.surname.trim(),
    p_issued_on: answers.issued || null,
    p_workforce: basic ? null : answers.workforce || null,
    p_update_service: basic ? null : answers.updateService,
    p_share_code: basic ? tidyShareCode(answers.shareCode) || null : null,
    p_consent: answers.consent,
  })
  if (error) throw error
}

export interface DbsChecks {
  statusChecked: boolean
  certificateSeen: boolean
  idSeen: boolean
}

export async function verifyDbs(userId: string, checks: DbsChecks): Promise<void> {
  const { error } = await supabase.rpc('verify_dbs', {
    p_person: userId,
    p_status_checked: checks.statusChecked,
    p_certificate_seen: checks.certificateSeen,
    p_id_seen: checks.idSeen,
  })
  if (error) throw error
}

export async function unverifyDbs(userId: string): Promise<void> {
  const { error } = await supabase.rpc('unverify_dbs', { p_person: userId })
  if (error) throw error
}

/** What is on record, as the form holds it: permission already given for what is saved. */
export function dbsAnswersOf(details: DbsDetails | null | undefined, lastName: string): DbsAnswers {
  if (!details) return { ...EMPTY_DBS, surname: lastName }
  return {
    kind: details.kind,
    certificate: details.certificate_number ?? '',
    surname: details.surname,
    issued: details.issued_on.slice(0, 10),
    workforce: details.workforce ?? '',
    updateService: details.update_service,
    shareCode: details.share_code ?? '',
    consent: true,
  }
}

/** What was looked at, in words: "checked online, original certificate seen". */
export function dbsChecksText(details: Pick<DbsDetails, 'status_checked' | 'certificate_seen' | 'id_seen'>): string {
  return [
    details.status_checked ? 'checked online' : '',
    details.certificate_seen ? 'original certificate seen' : '',
    details.id_seen ? 'photo ID seen' : '',
  ]
    .filter(Boolean)
    .join(', ')
}

// ---------------------------------------------------------------------------
// Everybody's, for whoever may see it
// ---------------------------------------------------------------------------

const dbsRowSchema = z.object({
  user_id: z.string(),
  kind: z.enum(['enhanced', 'standard', 'basic']),
  certificate_number: z.string().nullable(),
  surname: z.string(),
  issued_on: z.string(),
  workforce: z.string().nullable(),
  update_service: z.boolean().nullable(),
  consented_at: z.string(),
  verified_at: z.string().nullable(),
  verified_by: z.string().nullable(),
  status_checked: z.boolean(),
  certificate_seen: z.boolean(),
  id_seen: z.boolean(),
})
export type DbsRow = z.infer<typeof dbsRowSchema>

export const DBS_ROWS_KEY = ['dbs-rows'] as const

/**
 * The rows this reader may see, by person: everybody's for whoever holds
 * `people.compliance`, their own alone for anybody else. The database
 * decides; nothing here asks who is reading.
 */
export async function fetchDbsRows(): Promise<Record<string, DbsRow>> {
  const { data, error } = await supabase
    .from('dbs_details')
    .select(
      'user_id, kind, certificate_number, surname, issued_on, workforce, update_service, consented_at, verified_at, verified_by, status_checked, certificate_seen, id_seen',
    )
  if (error) throw error
  const rows = z.array(dbsRowSchema).parse(data ?? [])
  return Object.fromEntries(rows.map((row) => [row.user_id, row]))
}

/** Where somebody stands: no DBS, details still to give, waiting to be checked, verified. */
export type DbsStanding = 'none' | 'details' | 'check' | 'verified'

export function dbsStanding(hasDbs: boolean, row: { verified_at: string | null } | null | undefined): DbsStanding {
  if (!hasDbs) return 'none'
  if (!row) return 'details'
  return row.verified_at ? 'verified' : 'check'
}

export const DBS_STANDING_TEXT: Record<DbsStanding, string> = {
  none: 'No DBS',
  details: 'DBS: no details',
  check: 'DBS to check',
  verified: 'DBS verified',
}

export const DBS_STANDINGS_KEY = ['dbs-standings'] as const

/**
 * Where everybody stands, by person, for a reader the database shows the
 * rows to: the yes or no from `profile_sensitive`, and whether there are
 * details behind a yes and a check behind those.
 */
export async function fetchDbsStandings(): Promise<Record<string, DbsStanding>> {
  const [answers, rows] = await Promise.all([
    supabase.from('profile_sensitive').select('user_id, has_dbs'),
    fetchDbsRows(),
  ])
  if (answers.error) throw answers.error
  const said = z.array(z.object({ user_id: z.string(), has_dbs: z.boolean() })).parse(answers.data ?? [])
  return Object.fromEntries(said.map((row) => [row.user_id, dbsStanding(row.has_dbs, rows[row.user_id])]))
}
