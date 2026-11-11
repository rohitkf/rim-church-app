import { z } from 'zod'
import { supabase } from './supabaseClient'
import { ONBOARDING_KEY, tourStatusOf, type OnboardingRow } from './onboarding'
import type { LocationAccess } from './locationAccess'
import type { JoiningAnswers } from './joining'

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

/** My own unanswered questions, for the door. Null when it could not be asked. */
export async function fetchMyProfileGaps(): Promise<string[] | null> {
  try {
    const { data, error } = await supabase.rpc('my_profile_gaps')
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
  { key: 'tour', label: 'Tour taken', short: 'Tour' },
  { key: 'location', label: 'Location allowed', short: 'Location' },
  { key: 'notifications', label: 'Notifications on', short: 'Alerts' },
  { key: 'installed', label: 'App installed', short: 'App' },
] as const

export type SetupColumn = (typeof SETUP_COLUMNS)[number]['key']
export type SetupTicks = Record<SetupColumn, boolean>

/** Which of the form's questions each detail column stands for. */
const DETAIL_FIELDS: Record<'phone' | 'dob' | 'marital' | 'status', (keyof JoiningAnswers)[]> = {
  phone: ['phone'],
  dob: ['dob'],
  // An anniversary is asked only of somebody married, so it is the same question.
  marital: ['maritalStatus', 'anniversary'],
  status: ['visaType', 'visaHasExpiry', 'visaExpiry'],
}

/**
 * One person's row of ticks.
 *
 * "Profile complete" is every question answered, the names included — so
 * it can be blank while the four detail columns are ticked, for somebody
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
    tour: tourStatusOf(tour).kind === 'taken',
    location: location?.state === 'granted',
    notifications: setup?.notifications === true,
    installed: location?.installed === true,
  }
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
