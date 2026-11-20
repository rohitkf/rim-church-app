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
  { key: 'teamsReady', label: 'Teams ready', hint: 'A light for each team on the service, and how far it is through its checklist.' },
  { key: 'readiness', label: 'Checklist readiness', hint: 'The ring, and how far each stage has got.' },
  { key: 'availability', label: 'Who can serve', hint: 'Answers so far, and who is still to say.' },
  { key: 'turnout', label: 'Turnout by team', hint: 'Each team’s roster against its answers.' },
  { key: 'activity', label: 'Activity', hint: 'What has just been ticked and changed.' },
] as const

export type DashboardPanel = (typeof DASHBOARD_PANELS)[number]['key']

/** Birthdays and anniversaries on the Dashboard: whether, where, and how much. */
export type Celebrations = {
  show: boolean
  /** Above the services or below them. */
  place: 'above' | 'below'
  /** How many days ahead; 0 is today only. */
  days: number
  birthdays: boolean
  anniversaries: boolean
  /** "Turns 40", "25 years" — off, it is the name and the day alone. */
  ages: boolean
  /** How many are listed before the rest is a count. */
  limit: number
}

/** Each person's own call times on the Dashboard: whether, from when, until when, and for whom. */
export type CallTimesCard = {
  show: boolean
  /** How many days before a service day it appears; 0 is the day itself. */
  days: number
  /** Minutes after a call time that it stays; 0 goes at the call time. */
  stayMinutes: number
  /** Everybody on the team, or only whoever the rota put on that day. */
  who: 'team' | 'rota'
  /** A running clock beside each time. */
  countdown: boolean
  /** When the next service day's call time takes over: once today's last service has ended, or not until the next day. */
  next: 'after' | 'day'
}

export type Display = {
  dashboard: { serviceDays: number; openNext: 'auto' | 'always' | 'never'; show: Record<DashboardPanel, boolean> }
  callTimes: CallTimesCard
  celebrations: Celebrations
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
  callTimes: { show: true, days: 7, stayMinutes: 0, who: 'team', countdown: true, next: 'after' },
  celebrations: {
    show: true,
    place: 'above',
    days: 7,
    birthdays: true,
    anniversaries: true,
    ages: true,
    limit: 6,
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
  const cel = section('celebrations')
  const call = section('callTimes')
  const num = (max: number) => z.number().int().min(1).max(max)

  return {
    dashboard: {
      serviceDays: pick(num(4), dash.serviceDays, d.dashboard.serviceDays),
      openNext: pick(z.enum(['auto', 'always', 'never']), dash.openNext, d.dashboard.openNext),
      show: Object.fromEntries(
        DASHBOARD_PANELS.map((p) => [p.key, pick(z.boolean(), show[p.key], true)]),
      ) as Record<DashboardPanel, boolean>,
    },
    callTimes: {
      show: pick(z.boolean(), call.show, d.callTimes.show),
      days: pick(z.number().int().min(0).max(30), call.days, d.callTimes.days),
      stayMinutes: pick(z.number().int().min(0).max(240), call.stayMinutes, d.callTimes.stayMinutes),
      who: pick(z.enum(['team', 'rota']), call.who, d.callTimes.who),
      countdown: pick(z.boolean(), call.countdown, d.callTimes.countdown),
      next: pick(z.enum(['after', 'day']), call.next, d.callTimes.next),
    },
    celebrations: {
      show: pick(z.boolean(), cel.show, d.celebrations.show),
      place: pick(z.enum(['above', 'below']), cel.place, d.celebrations.place),
      days: pick(z.number().int().min(0).max(60), cel.days, d.celebrations.days),
      birthdays: pick(z.boolean(), cel.birthdays, d.celebrations.birthdays),
      anniversaries: pick(z.boolean(), cel.anniversaries, d.celebrations.anniversaries),
      ages: pick(z.boolean(), cel.ages, d.celebrations.ages),
      limit: pick(num(20), cel.limit, d.celebrations.limit),
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
