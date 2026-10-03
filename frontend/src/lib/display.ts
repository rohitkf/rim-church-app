import { z } from 'zod'

/**
 * Preferences only the screens read — how much a page lists, what starts
 * open — kept as one object on the settings row (`app_settings.display`,
 * 0123).
 *
 * Every key is optional and every key falls back on its own: a value this
 * version does not understand, or one somebody stored by hand, costs that
 * one preference its setting and nothing else. A newer app reading an
 * older row, or the reverse, never breaks a page.
 *
 * Nothing here is a rule. A Church Member who cannot open the rota is
 * kept out by the database (lib/pageAccess); a Dashboard that lists two
 * service days instead of one is only drawing more.
 */

export const DASHBOARD_PANELS = [
  { key: 'todayEvents', label: 'Today’s events', hint: 'Anything in the diary for today, above the services.' },
  { key: 'teamsReady', label: 'Teams ready', hint: 'A light for each team on the service.' },
  { key: 'readiness', label: 'Checklist readiness', hint: 'The ring, and how far each stage has got.' },
  { key: 'availability', label: 'Who can serve', hint: 'Answers so far, and who is still to say.' },
  { key: 'turnout', label: 'Turnout by team', hint: 'Each team’s roster against its answers.' },
  { key: 'activity', label: 'Activity', hint: 'What has just been ticked and changed.' },
] as const

export type DashboardPanel = (typeof DASHBOARD_PANELS)[number]['key']

export type Display = {
  dashboard: { serviceDays: number; openNext: 'auto' | 'always' | 'never'; show: Record<DashboardPanel, boolean> }
  lists: { upcomingOpen: boolean; finishedOpen: boolean }
  windows: {
    setListDays: number
    debriefAheadDays: number
    availabilityDays: number
    diaryPastDays: number
    invitationStaleDays: number
  }
}

export const DISPLAY_DEFAULTS: Display = {
  dashboard: {
    serviceDays: 1,
    openNext: 'auto',
    show: Object.fromEntries(DASHBOARD_PANELS.map((p) => [p.key, true])) as Record<DashboardPanel, boolean>,
  },
  lists: { upcomingOpen: false, finishedOpen: false },
  windows: {
    setListDays: 21,
    debriefAheadDays: 21,
    availabilityDays: 21,
    diaryPastDays: 365,
    invitationStaleDays: 14,
  },
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Whatever is stored, as a complete Display: each section, and each key in
 * it, either the stored value (when it is a valid one) or its default.
 */
export function readDisplay(stored: unknown): Display {
  const raw = isObject(stored) ? stored : {}
  const section = <K extends keyof Display>(key: K): Record<string, unknown> =>
    isObject(raw[key]) ? (raw[key] as Record<string, unknown>) : {}

  const dash = section('dashboard')
  const show = isObject(dash.show) ? dash.show : {}
  const pick = <T,>(schema: z.ZodType<T>, value: unknown, fallback: T): T => {
    const result = schema.safeParse(value)
    return result.success && value !== undefined ? result.data : fallback
  }
  const d = DISPLAY_DEFAULTS
  const lists = section('lists')
  const windows = section('windows')
  const num = (max: number) => z.number().int().min(1).max(max)

  return {
    dashboard: {
      serviceDays: pick(num(4), dash.serviceDays, d.dashboard.serviceDays),
      openNext: pick(z.enum(['auto', 'always', 'never']), dash.openNext, d.dashboard.openNext),
      show: Object.fromEntries(
        DASHBOARD_PANELS.map((p) => [p.key, pick(z.boolean(), show[p.key], true)]),
      ) as Record<DashboardPanel, boolean>,
    },
    lists: {
      upcomingOpen: pick(z.boolean(), lists.upcomingOpen, d.lists.upcomingOpen),
      finishedOpen: pick(z.boolean(), lists.finishedOpen, d.lists.finishedOpen),
    },
    windows: {
      setListDays: pick(num(120), windows.setListDays, d.windows.setListDays),
      debriefAheadDays: pick(num(120), windows.debriefAheadDays, d.windows.debriefAheadDays),
      availabilityDays: pick(num(120), windows.availabilityDays, d.windows.availabilityDays),
      diaryPastDays: pick(num(3650), windows.diaryPastDays, d.windows.diaryPastDays),
      invitationStaleDays: pick(num(365), windows.invitationStaleDays, d.windows.invitationStaleDays),
    },
  }
}
