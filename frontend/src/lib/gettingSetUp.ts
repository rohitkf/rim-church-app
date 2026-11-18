import { z } from 'zod'
import { supabase } from './supabaseClient'
import { ONBOARDING_KEY, tourStatusOf, type OnboardingRow } from './onboarding'
import type { LocationAccess } from './locationAccess'
import { JOINING_FORM, type JoiningAnswers } from './joining'

/*
 * Getting set up: what each person has done, in one place (0276).
 *
 * Four things used to be answered in four rooms, or nowhere — whether
 * somebody has filled in who they are, taken the tour, allowed location
 * on their phone, turned notifications on, put the app on their home
 * screen. Settings › Onboarding shows them as one table of ticks, and can
 * ask whoever has something left.
 *
 * The profile half comes from `people_setup()` as the *names* of the
 * joining form's unanswered questions, never as the answers: a tick says
 * a phone number is on record, not what it is. The tour and location
 * halves are the rows those rooms always read.
 */

/** Under the onboarding key, so a change to that table refreshes it too. */
export const SETUP_KEY = [...ONBOARDING_KEY, 'setup'] as const

const personSetupSchema = z.object({
  user_id: z.string(),
  /** Whether they have been through the joining form at all. */
  joined: z.boolean().nullable().transform((v) => v === true),
  /** The joining form's questions with no answer, by its own field names. */
  gaps: z.array(z.string()).nullable().transform((v) => v ?? []),
  /** Whether any device of theirs is registered for push. */
  notifications: z.boolean().nullable().transform((v) => v === true),
  /**
   * When they first had every answer the newest form asks (0304). It says
   * nothing about now — an answer rubbed out since leaves the date and
   * takes the tick — so read it through `completedAt`. Absent from a
   * database that has not had 0304.
   */
  completed_at: z.string().nullable().optional().transform((v) => v ?? null),
})
export type PersonSetup = z.infer<typeof personSetupSchema>

/** Everybody the reader may send the tour to. */
export async function fetchPeopleSetup(): Promise<PersonSetup[]> {
  const { data, error } = await supabase.rpc('people_setup')
  if (error) throw error
  return z.array(personSetupSchema).parse(data ?? [])
}

/**
 * Ask these people to finish — or, when `userIds` is null, everybody with
 * something left. Only those with something left are asked either way.
 * Returns how many were.
 */
export async function promptSetup(userIds: string[] | null): Promise<number> {
  const { data, error } = await supabase.rpc('prompt_setup', { p_users: userIds })
  if (error) throw error
  return typeof data === 'number' ? data : 0
}

/** "Not now", or nothing left: the card goes, and the bell's line with it. */
export async function closeSetupPrompt(): Promise<void> {
  const { error } = await supabase.rpc('close_setup_prompt')
  if (error) throw error
}

/**
 * My own unanswered questions, for the door. Null when it could not be asked.
 *
 * Asked by form number (0301): the database answers for the questions this
 * app's form has, so an app is never shut behind a question it cannot put.
 */
export async function fetchMyProfileGaps(): Promise<string[] | null> {
  try {
    const { data, error } = await supabase.rpc('my_profile_gaps_for', { p_form: JOINING_FORM })
    if (error) return null
    const parsed = z.array(z.string()).safeParse(data)
    return parsed.success ? parsed.data : null
  } catch {
    // Unreachable is not "incomplete": nobody is shut out on a guess.
    return null
  }
}

/** The table's columns, left to right. */
export const SETUP_COLUMNS = [
  { key: 'profile', label: 'Profile complete', short: 'Profile' },
  { key: 'phone', label: 'Phone number', short: 'Phone' },
  { key: 'dob', label: 'Date of birth', short: 'Birthday' },
  { key: 'marital', label: 'Marital status', short: 'Marital' },
  { key: 'status', label: 'Status in the UK', short: 'Status' },
  { key: 'address', label: 'Home address', short: 'Address' },
  { key: 'emergency', label: 'Emergency contact', short: 'Emergency' },
  { key: 'tour', label: 'Tour taken', short: 'Tour' },
  { key: 'location', label: 'Location allowed', short: 'Location' },
  { key: 'notifications', label: 'Notifications on', short: 'Alerts' },
  { key: 'installed', label: 'App installed', short: 'App' },
] as const

export type SetupColumn = (typeof SETUP_COLUMNS)[number]['key']
export type SetupTicks = Record<SetupColumn, boolean>

/** Which of the form's questions each detail column stands for. */
const DETAIL_FIELDS: Record<'phone' | 'dob' | 'marital' | 'status' | 'address' | 'emergency', (keyof JoiningAnswers)[]> = {
  phone: ['phone'],
  dob: ['dob'],
  // An anniversary is asked only of somebody married, so it is the same question.
  marital: ['maritalStatus', 'anniversary'],
  status: ['visaType', 'visaHasExpiry', 'visaExpiry'],
  // Line 2 is optional, so it is never a gap.
  address: ['addressLine1', 'town', 'postcode'],
  emergency: ['emergencyName', 'emergencyRelation', 'emergencyPhone'],
}

/**
 * One person's row of ticks.
 *
 * "Profile complete" is every question answered, the names included — so
 * it can be blank while the detail columns are ticked, for somebody
 * whose name is missing or who has not been through the form at all.
 */
export function setupTicksOf(
  setup: PersonSetup | undefined,
  tour: Pick<OnboardingRow, 'seen' | 'pushed_at'> | undefined,
  location: Pick<LocationAccess, 'state' | 'installed'> | undefined,
): SetupTicks {
  const gaps = new Set(setup?.gaps ?? [])
  const answered = (column: keyof typeof DETAIL_FIELDS) =>
    !!setup && !DETAIL_FIELDS[column].some((field) => gaps.has(field))
  return {
    profile: !!setup && setup.joined && gaps.size === 0,
    phone: answered('phone'),
    dob: answered('dob'),
    marital: answered('marital'),
    status: answered('status'),
    address: answered('address'),
    emergency: answered('emergency'),
    tour: tourStatusOf(tour).kind === 'taken',
    location: location?.state === 'granted',
    notifications: setup?.notifications === true,
    installed: location?.installed === true,
  }
}

/**
 * When somebody finished their details, for a profile that is complete
 * now; null for one that is not, whatever it once was, and for one that
 * was finished before the date was kept.
 */
export function completedAt(setup: PersonSetup | undefined, ticks: Pick<SetupTicks, 'profile'>): string | null {
  return ticks.profile ? (setup?.completed_at ?? null) : null
}

/** Whether anything is left — the same question `prompt_setup()` asks. */
export function hasSomethingLeft(ticks: SetupTicks): boolean {
  return SETUP_COLUMNS.some((c) => !ticks[c.key])
}

/**
 * Whether the card is due: asked, and not closed since.
 *
 * Asking again after a "Not now" brings it back; closing it holds until
 * the next ask.
 */
export function setupCardDue(row: Pick<OnboardingRow, 'setup_asked_at' | 'setup_closed_at'> | null | undefined): boolean {
  if (!row?.setup_asked_at) return false
  if (!row.setup_closed_at) return true
  return Date.parse(row.setup_asked_at) > Date.parse(row.setup_closed_at)
}
