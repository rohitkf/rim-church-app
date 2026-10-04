import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { readDisplay, type Display } from './display'
import { z } from 'zod'
import { supabase } from './supabaseClient'

/**
 * The numbers that decide when things appear.
 *
 * Every one of these was a constant chosen once and hard-coded — a week of
 * services on the rota, six on the planner, doors open half an hour early,
 * an hour to put a finished service right. They are reasonable defaults and
 * they are not universal, so they live in one row an Admin can edit.
 *
 * The defaults below are exactly the values that used to be in the code, so
 * a church that never opens Settings sees the app it already had. They are
 * also the fallback while the row is still loading, which is why nothing
 * flickers between a made-up window and the real one.
 */
export const appSettingsSchema = z.object({
  rota_window_days: z.number().int().min(1).max(120),
  always_show_my_services: z.boolean(),
  planner_upcoming_limit: z.number().int().min(1).max(50),
  lead_in_minutes: z.number().int().min(0).max(240),
  run_out_minutes: z.number().int().min(0).max(240),
  edit_grace_minutes: z.number().int().min(0).max(10080),
  /** How long the "After the service" checklist stays open once it has ended (0115). */
  after_service_checklist_minutes: z.number().int().min(0).max(1440).default(120),
  /** Who may raise an issue (0117): anybody on a team, everybody signed in, or Heads and Admins. */
  issues_raise_scope: z.enum(['everyone', 'team', 'leads']).default('team'),
  /** Days a resolved issue is kept after it was marked done. */
  issue_retention_days: z.number().int().min(1).max(365).default(30),
  issue_open_minutes_before: z.number().int().min(0).max(720).default(60),
  issue_close_minutes_after: z.number().int().min(0).max(1440).default(120),
  debrief_open_minutes_after: z.number().int().min(0).max(10080).default(720),
  /** Days a service's debrief minutes are kept, counted from the service. */
  debrief_retention_days: z.number().int().min(1).max(365),
  board_clear_dow: z.number().int().min(0).max(6),
  /*
   * The mark at the top of every page, as a path in the `branding`
   * bucket. Null means the app draws its own — see AppMark.
   *
   * It sits in this row with the clocks and windows because there is one
   * of it and it belongs to the church, not because it is the same kind
   * of setting: a trigger in the database keeps this column to the owner
   * while the rest stays open to any Admin.
   */
  logo_url: z.string().nullable(),
  /*
   * Where the church is, and when an answer is due.
   *
   * "23:59" is not a moment until somebody says where — and the database
   * enforces the same deadline (0092), so the page and the policy have to
   * read it off the same row or they will disagree by an hour twice a
   * year.
   */
  timezone: z.string(),
  availability_closes_time: z.string(),
  /** The Team Coordinator's row on the rota. Null is the night sky. */
  coordinator_color: z.string().nullable().default(null),
  /*
   * Who may open each page (0123): a page key to the lowest level that
   * may. lib/pageAccess reads it, and drops any value it does not know.
   */
  page_access: z.record(z.string(), z.string()).catch({}).default({}),
  /** Preferences only the screens read (0123); lib/display reads it. */
  display: z.unknown().default({}),
  /* How long things are kept, in days (0123). Null is for ever. */
  notification_retention_days: z.number().int().min(1).max(3650).nullable().default(null),
  team_chat_retention_days: z.number().int().min(1).max(3650).nullable().default(null),
  church_update_retention_days: z.number().int().min(1).max(3650).nullable().default(null),
  poll_retention_days: z.number().int().min(1).max(3650).nullable().default(null),
  alert_retention_days: z.number().int().min(1).max(3650).nullable().default(null),
  /** Done and Won't-do feedback, after it was settled (0124). Null is for ever. */
  feedback_retention_days: z.number().int().min(1).max(3650).nullable().default(null),
})
export type AppSettings = z.infer<typeof appSettingsSchema>

export const DEFAULT_SETTINGS: AppSettings = {
  rota_window_days: 7,
  always_show_my_services: true,
  planner_upcoming_limit: 6,
  lead_in_minutes: 30,
  run_out_minutes: 15,
  edit_grace_minutes: 60,
  after_service_checklist_minutes: 120,
  issues_raise_scope: 'team',
  issue_retention_days: 30,
  issue_open_minutes_before: 60,
  issue_close_minutes_after: 120,
  debrief_open_minutes_after: 720,
  debrief_retention_days: 30,
  board_clear_dow: 2,
  logo_url: null,
  timezone: 'Europe/London',
  availability_closes_time: '23:59:00',
  coordinator_color: null,
  page_access: {},
  display: {},
  notification_retention_days: null,
  team_chat_retention_days: null,
  church_update_retention_days: null,
  poll_retention_days: null,
  alert_retention_days: null,
  feedback_retention_days: null,
}

export const SETTINGS_KEY = ['app-settings']

export async function fetchAppSettings(): Promise<AppSettings> {
  const { data, error } = await supabase
    .from('app_settings')
    .select(
      'rota_window_days, always_show_my_services, planner_upcoming_limit, lead_in_minutes, run_out_minutes, edit_grace_minutes, after_service_checklist_minutes, issues_raise_scope, issue_retention_days, issue_open_minutes_before, issue_close_minutes_after, debrief_open_minutes_after, debrief_retention_days, board_clear_dow, logo_url, timezone, availability_closes_time, coordinator_color, page_access, display, notification_retention_days, team_chat_retention_days, church_update_retention_days, poll_retention_days, alert_retention_days, feedback_retention_days',
    )
    .maybeSingle()
  if (error) throw error
  // No row is not an error worth stopping a page for: the app has working
  // defaults, and a rota that will not draw is worse than one drawn to the
  // numbers it shipped with.
  return data ? appSettingsSchema.parse(data) : DEFAULT_SETTINGS
}

/**
 * Read anywhere. Cached for the session and never refetched on its own —
 * these change when an Admin changes them, which invalidates the key.
 */
export function useAppSettings(): AppSettings {
  return useAppSettingsState().settings
}

/**
 * The settings, and whether they are the church's yet or still the
 * defaults standing in. A page that would turn somebody away on a
 * setting waits for `settled`: the defaults are right for most churches,
 * and wrong for the one that has opened the rota to everybody.
 */
export function useAppSettingsState(): { settings: AppSettings; settled: boolean } {
  const query = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: fetchAppSettings,
    staleTime: 5 * 60_000,
  })
  return { settings: query.data ?? DEFAULT_SETTINGS, settled: query.isSuccess || query.isError }
}

/** The screens' preferences, every key filled in. */
export function useDisplay(): Display {
  const { display } = useAppSettings()
  return useMemo(() => readDisplay(display), [display])
}

/** Sunday first, the way both Postgres and JavaScript count. */
export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]
