import { useQuery } from '@tanstack/react-query'
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
  board_clear_dow: z.number().int().min(0).max(6),
})
export type AppSettings = z.infer<typeof appSettingsSchema>

export const DEFAULT_SETTINGS: AppSettings = {
  rota_window_days: 7,
  always_show_my_services: true,
  planner_upcoming_limit: 6,
  lead_in_minutes: 30,
  run_out_minutes: 15,
  edit_grace_minutes: 60,
  board_clear_dow: 2,
}

export const SETTINGS_KEY = ['app-settings']

export async function fetchAppSettings(): Promise<AppSettings> {
  const { data, error } = await supabase
    .from('app_settings')
    .select(
      'rota_window_days, always_show_my_services, planner_upcoming_limit, lead_in_minutes, run_out_minutes, edit_grace_minutes, board_clear_dow',
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
  const query = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: fetchAppSettings,
    staleTime: 5 * 60_000,
  })
  return query.data ?? DEFAULT_SETTINGS
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
