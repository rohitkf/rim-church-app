import { supabase } from './supabaseClient'

/**
 * A second step at sign-in: a code from an authenticator app, after the
 * password (0334).
 *
 * It is each person's choice, set up in Settings › Your account. Once it
 * is, a password alone is half a sign-in: the database turns away every
 * request from that account until its session says the code was given
 * (`reject_removed_user`, the token's `aal` claim), and the app shows the
 * page that asks for it in place of everything else.
 *
 * The asking is Supabase's own (its MFA endpoints are not the database's,
 * so they answer a half signed-in session); this file is the app's side
 * of it, and the only place that speaks to those endpoints.
 */

/**
 * Whether the app offers it.
 *
 * Off: the Owner said there is no need for any two-step sign-in for now
 * (26 November 2026, the day it shipped; nobody had set one up). Nothing
 * was taken out. The room in Settings does not draw the card that sets
 * one up or the Owner's list, the tour and the notes do not mention it,
 * and enrolment is switched off on the server too (Supabase › Auth,
 * `mfa_totp_enroll_enabled`), so one cannot be made by calling Supabase
 * directly either. The database's rule and the page that asks for the
 * code stay as they are: with no authenticator on any account they do
 * nothing, and they are there the day this is turned back on.
 *
 * To offer it again: set this to true, switch enrolment back on, and put
 * the lines back in the tour, the release note, /privacy and
 * docs/security.md (`secondStep.test.ts` holds them together).
 */
export const SECOND_STEP_OFFERED = false

export interface SecondStep {
  /** A code is owed before the app will open. */
  needed: boolean
  /** Which authenticator to check the code against. */
  factorId: string | null
}

export const NOT_NEEDED: SecondStep = { needed: false, factorId: null }
export const SECOND_STEP_KEY = ['second-step']

/**
 * A request refused because the code has not been given.
 *
 * The same shape as the other refusals `reject_removed_user` makes (see
 * lib/standing): 42501, told apart by the detail it carries.
 */
export function isSecondStepNeeded(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { code, message, details } = error as { code?: string; message?: string; details?: string }
  if (code !== '42501' && code !== 'PGRST301') return false
  return details === 'second_step_needed' || /code from your authenticator app/i.test(message ?? '')
}

/*
 * The database said a code is owed. What the browser remembers of the
 * account can be behind it: an authenticator set up on a phone this
 * morning is news to the laptop that signed in last week. So after a
 * refusal the account is read again from the server and not from memory.
 */
let refused = false
export function noteSecondStepRefusal(): void {
  refused = true
}

/** Whether this session owes a code, and to which authenticator. */
export async function fetchSecondStep(): Promise<SecondStep> {
  // What the browser holds, read without a request. It can fail to read
  // (a token it cannot parse); that is "not known", and only the
  // database's own refusal is then reason to go and ask the server.
  let held: { currentLevel: string | null; nextLevel: string | null } | null = null
  try {
    held = (await supabase.auth.mfa.getAuthenticatorAssuranceLevel()).data
  } catch {
    held = null
  }
  if (held?.currentLevel === 'aal2') return NOT_NEEDED
  if (!refused && held?.nextLevel !== 'aal2') return NOT_NEEDED
  const { data: factors } = await supabase.auth.mfa.listFactors()
  const totp = factors?.totp[0]
  if (totp) return { needed: true, factorId: totp.id }
  if (factors) return NOT_NEEDED
  // The server could not be asked (no signal): what the browser remembers
  // is the best there is, and the database refuses either way.
  const { data: kept } = await supabase.auth.getSession()
  const known = kept.session?.user.factors?.find((f) => f.factor_type === 'totp' && f.status === 'verified')
  return known ? { needed: true, factorId: known.id } : NOT_NEEDED
}

/** A code as typed: its digits, whatever else was typed around them. */
export function codeDigits(typed: string): string {
  return typed.replace(/\D/g, '').slice(0, 6)
}

/** Six digits, which is what every authenticator app shows. */
export function isWholeCode(typed: string): boolean {
  return /^\d{6}$/.test(typed)
}

/**
 * Why a code was not accepted, in words somebody can act on.
 *
 * Supabase says "Invalid TOTP code entered" for a wrong one and counts
 * tries; anything else is told as it came.
 */
export function codeErrorWords(error: unknown): string {
  const message = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : ''
  if (/invalid totp|invalid code|code entered/i.test(message)) {
    return 'That code was not accepted. Codes change every 30 seconds: enter the one showing now.'
  }
  if (/rate limit|too many/i.test(message)) return 'Too many tries. Wait a minute, then enter a new code.'
  if (/expired/i.test(message)) return 'That took too long. Enter the code showing now.'
  return message || 'The code could not be checked. Try again.'
}

/** Give the code: on success the session is whole and the database opens. */
export async function giveCode(factorId: string, code: string): Promise<void> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
  if (error) throw error
}

/** What somebody needs to put an authenticator on their account. */
export interface Enrolment {
  factorId: string
  /** The `otpauth://` address a QR code carries. */
  uri: string
  /** The same secret, for typing in where a camera cannot be used. */
  secret: string
}

/**
 * Begin setting one up.
 *
 * A set-up that was started and left (the page closed before the code was
 * typed) stays behind as an unconfirmed authenticator, and would refuse
 * the next start. Those are cleared first: they never worked, so nothing
 * is lost.
 */
export async function beginEnrolment(): Promise<Enrolment> {
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors()
  if (listError) throw listError
  for (const factor of factors.all) {
    if (factor.factor_type === 'totp' && factor.status !== 'verified') {
      await supabase.auth.mfa.unenroll({ factorId: factor.id })
    }
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${Date.now()}` })
  if (error) throw error
  return { factorId: data.id, uri: data.totp.uri, secret: data.totp.secret }
}

/** The authenticators that are set up and working on this account. */
export async function fetchMyAuthenticators(): Promise<{ id: string; since: string }[]> {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) throw error
  return data.totp.map((f) => ({ id: f.id, since: f.created_at }))
}

/** Take it off: a password alone signs this account in again. */
export async function removeAuthenticator(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) throw error
}

/** The secret in fours, which is how people read one aloud or type it. */
export function secretInFours(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim()
}

/* ---- The Owner's side: somebody has lost the phone theirs is on ---- */

export const SECOND_STEP_PEOPLE_KEY = ['second-step-people']

/** The accounts that have one set up. The Owner only; the database refuses anybody else. */
export async function fetchSecondStepPeople(): Promise<string[]> {
  const { data, error } = await supabase.rpc('second_step_people')
  if (error) throw error
  return ((data ?? []) as unknown[]).filter((id): id is string => typeof id === 'string')
}

/** Clear somebody's, so their password alone signs them in again. */
export async function clearSecondStep(userId: string): Promise<void> {
  const { error } = await supabase.rpc('second_step_clear', { p_user: userId })
  if (error) throw error
}
