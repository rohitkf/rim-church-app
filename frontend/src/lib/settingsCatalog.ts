import { DEFAULT_SETTINGS, WEEKDAY_NAMES, type AppSettings } from './appSettings'
import { DASHBOARD_PANELS, DISPLAY_DEFAULTS, readDisplay, type Display } from './display'
import { NAV_ITEMS } from './navItems'
import { SERVING_TABS } from './serving'

/**
 * Every plain setting the church can change, written down once.
 *
 * Each entry says what it is called, what it does in a line and in full,
 * which pages move when it moves, and how to read and write it on the
 * settings row. The rooms (Timings, Dashboard & Lists, Data & Retention,
 * Stage layout) draw their rows from here, and so does Page by Page,
 * which shows each page the settings that are its own — so a setting
 * cannot be worded one way in its room and another on its page, or be in
 * one and missing from the other.
 *
 * A setting with controls of its own (the rota's tags, the Giving links,
 * which teams may draw the stage) is not here: those rooms are linked to
 * from the page, not redrawn on it.
 */

/** A working copy of some of the settings row — a room's own columns. */
export type Draft = Partial<AppSettings>
export type Patch = Partial<AppSettings>

/**
 * A page a setting moves: a route (`/rota`), or one of the places that is
 * not a page in the menu — the bell, Send an alert, the app itself, or
 * every page that lists services.
 */
export type PageRef = string

export const BELL = 'bell'
export const ALERTS = 'alerts'
export const APP = 'app'
export const SERVICE_PAGES_REF = 'service-pages'

/** The pages that list services under Today, Next, Upcoming and Finished. */
export const SERVICE_PAGES = ['/service-planner', '/availability', '/rota', '/checklists', '/set-lists', '/debriefs']

const SPECIAL_NAMES: Record<string, string> = {
  [BELL]: 'Notifications',
  [ALERTS]: 'Send an Alert',
  [APP]: 'The app itself',
  [SERVICE_PAGES_REF]: 'Every service page',
}

/** A page's name as the menu says it. */
export function pageName(ref: PageRef): string {
  if (SPECIAL_NAMES[ref]) return SPECIAL_NAMES[ref]
  const tab = SERVING_TABS.find((t) => t.to === ref)
  if (tab) return tab.label
  return NAV_ITEMS.find((i) => i.to === ref)?.label ?? ref
}

/** Whether a setting that names `ref` is one of this page's. */
export function affectsPage(ref: PageRef, page: string): boolean {
  return ref === page || (ref === SERVICE_PAGES_REF && SERVICE_PAGES.includes(page))
}

interface Base {
  id: string
  label: string
  /** One line, always on show. */
  summary: string
  /** The whole story, for whoever opens "How this works". */
  help: string
  affects: PageRef[]
  /** The columns this entry reads and writes — one, or `display`. */
  keys: readonly (keyof AppSettings)[]
  /** Shown only while this holds: the hour under a day that is not Never. */
  when?: (d: Draft) => boolean
}

interface Dial extends Base {
  kind: 'dial'
  unit: 'minutes' | 'days' | 'notifications' | 'entries' | 'metres'
  /** What 0 reads as, when 0 means something of its own ("Today only"). */
  zeroText?: string
  min: number
  max: number
  /** Where the ruler stops, when the real ceiling is absurd to drag to. */
  dialMax?: number
  dialStep?: number
  majorEvery?: number
  get: (d: Draft) => number
  put: (d: Draft, value: number) => Patch
  fallback: number
}

/** A number of days, or null for "keep for ever". */
interface Forever extends Base {
  kind: 'forever'
  get: (d: Draft) => number | null
  put: (d: Draft, value: number | null) => Patch
  fallback: number | null
}

interface Toggle extends Base {
  kind: 'switch'
  /** A bare row — label, hint and switch — for a list of several alike. */
  compact?: boolean
  /** What the switch itself is called, when not the row's label. */
  controlLabel?: string
  get: (d: Draft) => boolean
  put: (d: Draft, value: boolean) => Patch
  fallback: boolean
}

interface Choice extends Base {
  kind: 'choice'
  style: 'select' | 'segmented'
  options: { value: string; label: string }[]
  ariaLabel: string
  get: (d: Draft) => string
  put: (d: Draft, value: string) => Patch
  fallback: string
  /** The default as a person would say it, when not the option's own label. */
  fallbackText?: string
}

interface Time extends Base {
  kind: 'time'
  ariaLabel: string
  /** "HH:MM". */
  get: (d: Draft) => string
  put: (d: Draft, value: string) => Patch
  fallback: string
}

interface Timezone extends Base {
  kind: 'timezone'
  get: (d: Draft) => string
  put: (d: Draft, value: string) => Patch
  fallback: string
}

export type SettingEntry = Dial | Forever | Toggle | Choice | Time | Timezone

/** A setting that is one column: read it, or the default while it is not loaded. */
const column = <K extends keyof AppSettings>(key: K) => ({
  id: key,
  keys: [key] as const,
  get: (d: Draft): AppSettings[K] => (d[key] !== undefined ? (d[key] as AppSettings[K]) : DEFAULT_SETTINGS[key]),
  put: (_d: Draft, value: AppSettings[K]): Patch => ({ [key]: value }),
  fallback: DEFAULT_SETTINGS[key],
})

/** A setting kept inside the `display` object (lib/display). */
const display = <T,>(id: string, read: (display: Display) => T, write: (display: Display, value: T) => Display, fallback: T) => ({
  id,
  keys: ['display'] as const,
  get: (d: Draft): T => read(readDisplay(d.display)),
  put: (d: Draft, value: T): Patch => ({ display: write(readDisplay(d.display), value) }),
  fallback,
})

const weekdayOptions = WEEKDAY_NAMES.map((name, dow) => ({ value: String(dow), label: name }))
const neverOrWeekday = [{ value: 'never', label: 'Never' }, ...weekdayOptions]
const hourOptions = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, '0')}:00` }))

/** A day of the week, or Never, kept as a nullable number. */
const weekday = <K extends 'board_clear_dow' | 'alert_clear_dow' | 'stage_clear_dow'>(key: K) => {
  const c = column(key)
  return {
    id: c.id,
    keys: c.keys,
    get: (d: Draft) => {
      const v = c.get(d) as number | null
      return v === null ? 'never' : String(v)
    },
    put: (_d: Draft, v: string): Patch => ({ [key]: v === 'never' ? null : Number(v) }),
    fallback: c.fallback === null ? 'never' : String(c.fallback),
    fallbackText: c.fallback === null ? 'Never' : WEEKDAY_NAMES[c.fallback as number],
  }
}

const wideDays = { min: 1, max: 365, majorEvery: 7 }

export const SETTINGS_CATALOG: SettingEntry[] = [
  /* ---- Planning ahead ---- */
  {
    ...column('rota_window_days'),
    kind: 'dial',
    label: 'Days ahead',
    summary: 'How far ahead the rota, availability and checklists list services.',
    help: 'Every service dated within this many days of today is listed — not the next few services, which on a busy Sunday would be spent on one day and hide the week after. Two rules ride along and cannot be turned off: if nothing falls inside the window the nearest day that has a service is shown instead, so the page is never blank; and a service that has finished stops holding the window open, so the moment today’s service ends, next Sunday’s is already there.',
    affects: ['/rota', '/availability', '/checklists'],
    min: 1,
    max: 120,
    dialMax: 60,
    majorEvery: 7,
    unit: 'days',
  },
  {
    ...column('always_show_my_services'),
    kind: 'switch',
    label: 'Always show a service somebody is rostered on',
    summary: 'Even if it is further out than the days ahead.',
    help: 'A safety net over the window above: if somebody is assigned to a service further out than the window, that service is added to their rota anyway, in date order. Nobody else’s page changes. Turn this off and a volunteer can be given a role on a service they cannot see, and will not know to tell you.',
    affects: ['/rota'],
  },

  /* ---- On the day ---- */
  {
    ...column('lead_in_minutes'),
    kind: 'dial',
    label: 'Doors open before',
    summary: 'A service reads as “on now” this long before it starts.',
    help: 'A service starts wearing the “on now” badge this long before its first session, so the rota highlights the right service while teams are setting up. Both ends are read from the running order, so a service with no running order planned is never “on now”.',
    affects: ['/rota'],
    min: 0,
    max: 240,
    unit: 'minutes',
  },
  {
    ...column('run_out_minutes'),
    kind: 'dial',
    label: 'Still on after',
    summary: 'And it keeps reading as “on now” this long after it ends.',
    help: 'It keeps the badge this long after the last session ends, so it does not blink out mid-handshake. Set it to 0 for the badge to go the second the service does.',
    affects: ['/rota'],
    min: 0,
    max: 240,
    unit: 'minutes',
  },

  /* ---- After the service ---- */
  {
    ...column('edit_grace_minutes'),
    kind: 'dial',
    label: 'Editing stays open for',
    summary: 'How long a finished service can still be corrected.',
    help: 'How long after a service ends its record stays open for correction. The clock starts when End service was pressed, or, if nobody pressed it, at the planned end of the last session. When it runs out the database itself starts refusing changes to the running order, checklist ticks and sign-offs, availability answers, and rota assignments for that service — so this is a real lock, not a hidden button. An hour is “walk off the stage and fix what you noticed”; a day suits a team that does its paperwork on Monday.',
    affects: ['/service-planner', '/checklists', '/availability', '/rota'],
    min: 0,
    max: 10080,
    // A week in minutes is a real ceiling and a ridiculous drag, so the
    // ruler covers the day that anybody actually picks from and typing
    // covers the rest.
    dialMax: 1440,
    dialStep: 15,
    majorEvery: 4,
    unit: 'minutes',
  },
  {
    ...column('after_service_checklist_opens_minutes'),
    kind: 'dial',
    label: 'After-the-service checklist opens',
    summary: 'Before the service ends — not before anything can be packed away.',
    help: 'The “After the service” half of every checklist can only be ticked from this long before the service ends. Until then its boxes are locked and the page counts down to when they open. The end is when End service was pressed, or, if nobody pressed it, the planned end of the last session — so pressing End service early opens it at once. A service with no running order and nobody pressing End service has no end to count back from, so the half stays shut. The database enforces it, Admins included.',
    affects: ['/checklists'],
    min: 0,
    max: 240,
    dialMax: 120,
    dialStep: 5,
    majorEvery: 3,
    unit: 'minutes',
  },
  {
    ...column('after_service_checklist_minutes'),
    kind: 'dial',
    label: 'After-the-service checklist stays open for',
    summary: 'Time to pack away and lock up, then the list closes.',
    help: 'The “After the service” half of every checklist is work done once the service is over — packing away, locking up — so it stays open this long after the service ends, then closes. The clock starts when End service was pressed, or, if nobody pressed it, at the planned end of the last session. The “Before the service” half closes when the service does. The database enforces it, so it is a real lock.',
    affects: ['/checklists'],
    min: 0,
    max: 1440,
    dialMax: 360,
    dialStep: 15,
    majorEvery: 4,
    unit: 'minutes',
  },
  {
    ...column('debrief_open_minutes_after'),
    kind: 'dial',
    label: 'Teams can write their debrief for',
    summary: 'While the morning is still fresh. Heads and Admins can write any time.',
    help: 'How long after a service ends anybody on a team can add to their own team’s debrief. The clock starts when End service was pressed, or, if nobody pressed it, at the planned end of the last session. Before the service ends and after this runs out, only the team’s Head or Assisting Head, and Admins, can write in it. The database enforces it.',
    affects: ['/debriefs'],
    min: 0,
    max: 10080,
    dialMax: 1440,
    dialStep: 30,
    majorEvery: 4,
    unit: 'minutes',
  },

  /* ---- Issues ---- */
  {
    ...column('issues_raise_scope'),
    kind: 'choice',
    style: 'select',
    label: 'Who can raise one',
    summary: 'Anybody on a team can always see them.',
    help: '“Everyone signed in” lets Church Members raise one too, and see the page. The team an issue is for marks it done. The database enforces the choice, so it is a real rule.',
    affects: ['/issues'],
    ariaLabel: 'Who can raise an issue',
    options: [
      { value: 'team', label: 'Anyone on a team' },
      { value: 'everyone', label: 'Everyone signed in' },
      { value: 'leads', label: 'Heads and Admins only' },
    ],
    put: (_d, v) => ({ issues_raise_scope: v as AppSettings['issues_raise_scope'] }),
  },
  {
    ...column('issue_open_minutes_before'),
    kind: 'dial',
    label: 'Raising opens before the service',
    summary: 'While teams are setting up and finding what is broken.',
    help: 'How long before a service’s first session starts people can begin raising issues for it. The database refuses an issue raised earlier. Heads, Assisting Heads and Admins can raise one at any time.',
    affects: ['/issues'],
    min: 0,
    max: 720,
    dialMax: 240,
    dialStep: 15,
    majorEvery: 4,
    unit: 'minutes',
  },
  {
    ...column('issue_close_minutes_after'),
    kind: 'dial',
    label: 'Raising closes after the service',
    summary: 'After this, new issues for that service are refused.',
    help: 'How long after a service ends people can still raise an issue for it. The clock starts when End service was pressed, or, if nobody pressed it, at the planned end of the last session. After that the database refuses new issues for that service; the ones already raised stay.',
    affects: ['/issues'],
    min: 0,
    max: 1440,
    dialMax: 360,
    dialStep: 15,
    majorEvery: 4,
    unit: 'minutes',
  },

  /* ---- Availability: when an answer is due, and on whose clock ---- */
  {
    ...column('availability_closes_time'),
    kind: 'time',
    label: 'Closes the night before, at',
    summary: 'Sunday’s answers are due on Saturday night.',
    help: 'Answers for a Sunday service are due the Saturday night; a Saturday service closes on the Friday. After this only an Admin or the team’s head can change an answer — and if somebody marks themselves unavailable before it, the role they were on goes back to unassigned and both heads are told.',
    affects: ['/availability'],
    ariaLabel: 'Time availability closes',
    get: (d) => column('availability_closes_time').get(d).slice(0, 5),
    put: (_d, v) => ({ availability_closes_time: `${v}:00` }),
    fallback: DEFAULT_SETTINGS.availability_closes_time.slice(0, 5),
  },
  {
    ...column('timezone'),
    kind: 'timezone',
    label: 'On the clock in',
    summary: 'Summer time looks after itself.',
    help: 'An IANA name, like Europe/London. The database refuses one it has never heard of rather than storing a typo that would break the deadline.',
    affects: ['/availability'],
  },

  /* ---- The Dashboard ---- */
  {
    ...display(
      'display.dashboard.serviceDays',
      (v) => String(v.dashboard.serviceDays),
      (v, n) => ({ ...v, dashboard: { ...v.dashboard, serviceDays: Number(n) } }),
      String(DISPLAY_DEFAULTS.dashboard.serviceDays),
    ),
    kind: 'choice',
    style: 'segmented',
    label: 'Service days to list',
    summary: 'The next one, or the next few.',
    help: 'The Dashboard lists every service on the next service day. Set it higher to list the following service days too, each with its own countdown.',
    affects: ['/'],
    ariaLabel: 'Service days to list',
    options: ['1', '2', '3', '4'].map((n) => ({ value: n, label: n })),
  },
  {
    ...display<string>(
      'display.dashboard.openNext',
      (v) => v.dashboard.openNext,
      (v, next) => ({ ...v, dashboard: { ...v.dashboard, openNext: next as Display['dashboard']['openNext'] } }),
      DISPLAY_DEFAULTS.dashboard.openNext,
    ),
    kind: 'choice',
    style: 'segmented',
    label: 'The next service’s card',
    summary: 'Opened up, or folded to one line.',
    help: '“On the day” opens it on the morning itself and keeps it folded to its countdown before then. “Open” always shows the readiness, teams and activity; “Folded” always waits to be tapped.',
    affects: ['/'],
    ariaLabel: 'The next service’s card',
    options: [
      { value: 'auto', label: 'On the day' },
      { value: 'always', label: 'Open' },
      { value: 'never', label: 'Folded' },
    ],
  },
  ...DASHBOARD_PANELS.map(
    (panel): SettingEntry => ({
      ...display(
        `display.dashboard.show.${panel.key}`,
        (v) => v.dashboard.show[panel.key],
        (v, on) => ({ ...v, dashboard: { ...v.dashboard, show: { ...v.dashboard.show, [panel.key]: on } } }),
        true,
      ),
      kind: 'switch',
      compact: true,
      label: panel.label,
      controlLabel: `Show ${panel.label}`,
      summary: panel.hint,
      help: 'On a service’s card on the Dashboard. Off only hides the panel; the page it summarises is unchanged.',
      affects: ['/'],
    }),
  ),

  /* ---- Birthdays and anniversaries on the Dashboard ---- */
  {
    ...display(
      'display.celebrations.show',
      (v) => v.celebrations.show,
      (v, on) => ({ ...v, celebrations: { ...v.celebrations, show: on } }),
      DISPLAY_DEFAULTS.celebrations.show,
    ),
    kind: 'switch',
    label: 'Birthdays & anniversaries',
    controlLabel: 'Show birthdays and anniversaries on the Dashboard',
    summary: 'Who is celebrating, from people’s profiles.',
    help: 'A card on the Dashboard listing the birthdays and wedding anniversaries coming up, today’s first. It is not there at all when nobody has one in the window. The dates come from each person’s profile; the Events page shows them too, whatever this says.',
    affects: ['/'],
  },
  {
    ...display<string>(
      'display.celebrations.place',
      (v) => v.celebrations.place,
      (v, place) => ({ ...v, celebrations: { ...v.celebrations, place: place as Display['celebrations']['place'] } }),
      DISPLAY_DEFAULTS.celebrations.place,
    ),
    kind: 'choice',
    style: 'segmented',
    label: 'Where it sits',
    summary: 'Above the services, or below them.',
    help: 'Above, it is among the first things anybody sees, under the day’s events. Below, the services come first and the card waits under them.',
    affects: ['/'],
    ariaLabel: 'Where birthdays and anniversaries sit',
    options: [
      { value: 'above', label: 'Above services' },
      { value: 'below', label: 'Below services' },
    ],
    when: (d) => readDisplay(d.display).celebrations.show,
  },
  {
    ...display(
      'display.celebrations.days',
      (v) => v.celebrations.days,
      (v, n) => ({ ...v, celebrations: { ...v.celebrations, days: n } }),
      DISPLAY_DEFAULTS.celebrations.days,
    ),
    kind: 'dial',
    label: 'Looks ahead',
    summary: '0 is today only.',
    help: 'Birthdays and anniversaries within this many days are listed, soonest first. At 0 the card shows only today’s, and is gone on a day with none.',
    affects: ['/'],
    min: 0,
    max: 60,
    majorEvery: 7,
    unit: 'days',
    zeroText: 'Today only',
    when: (d) => readDisplay(d.display).celebrations.show,
  },
  {
    ...display(
      'display.celebrations.birthdays',
      (v) => v.celebrations.birthdays,
      (v, on) => ({ ...v, celebrations: { ...v.celebrations, birthdays: on } }),
      DISPLAY_DEFAULTS.celebrations.birthdays,
    ),
    kind: 'switch',
    compact: true,
    label: 'Birthdays',
    controlLabel: 'List birthdays',
    summary: 'From each person’s date of birth.',
    help: 'Off, the card lists anniversaries alone.',
    affects: ['/'],
    when: (d) => readDisplay(d.display).celebrations.show,
  },
  {
    ...display(
      'display.celebrations.anniversaries',
      (v) => v.celebrations.anniversaries,
      (v, on) => ({ ...v, celebrations: { ...v.celebrations, anniversaries: on } }),
      DISPLAY_DEFAULTS.celebrations.anniversaries,
    ),
    kind: 'switch',
    compact: true,
    label: 'Wedding anniversaries',
    controlLabel: 'List wedding anniversaries',
    summary: 'A married couple once, with both names.',
    help: 'Off, the card lists birthdays alone.',
    affects: ['/'],
    when: (d) => readDisplay(d.display).celebrations.show,
  },
  {
    ...display(
      'display.celebrations.ages',
      (v) => v.celebrations.ages,
      (v, on) => ({ ...v, celebrations: { ...v.celebrations, ages: on } }),
      DISPLAY_DEFAULTS.celebrations.ages,
    ),
    kind: 'switch',
    compact: true,
    label: 'Ages and years married',
    controlLabel: 'Show ages and years married',
    summary: '“Turns 40”, “25 years”.',
    help: 'Off, the card gives the name and the day and nothing about how many years. Only where the year was filled in; a date saved without one never shows a number.',
    affects: ['/'],
    when: (d) => readDisplay(d.display).celebrations.show,
  },
  {
    ...display(
      'display.celebrations.limit',
      (v) => v.celebrations.limit,
      (v, n) => ({ ...v, celebrations: { ...v.celebrations, limit: n } }),
      DISPLAY_DEFAULTS.celebrations.limit,
    ),
    kind: 'dial',
    label: 'Lists at most',
    summary: 'The rest is a count, and a link to Events.',
    help: 'How many are listed on the card, soonest first. Beyond that the card says how many more there are and links to the Events page, which has every one.',
    affects: ['/'],
    min: 1,
    max: 20,
    majorEvery: 5,
    unit: 'entries',
    when: (d) => readDisplay(d.display).celebrations.show,
  },

  /* ---- Every page that lists services ---- */
  {
    ...display(
      'display.lists.upcomingOpen',
      (v) => v.lists.upcomingOpen,
      (v, on) => ({ ...v, lists: { ...v.lists, upcomingOpen: on } }),
      DISPLAY_DEFAULTS.lists.upcomingOpen,
    ),
    kind: 'switch',
    label: 'Upcoming services start open',
    summary: 'Otherwise folded under their heading.',
    help: 'On the planner, the rota, availability, checklists, set lists and debriefs. Folded, a page leads with what is today and next; open, everything ahead is laid out at once.',
    affects: [SERVICE_PAGES_REF],
  },
  {
    ...display(
      'display.lists.finishedOpen',
      (v) => v.lists.finishedOpen,
      (v, on) => ({ ...v, lists: { ...v.lists, finishedOpen: on } }),
      DISPLAY_DEFAULTS.lists.finishedOpen,
    ),
    kind: 'switch',
    label: 'Finished services start open',
    summary: 'A page still opens it when something in it can be written to.',
    help: 'Finished services are a record, so they arrive folded. A page opens them by itself while something there can still be written — a checklist’s after-half, last night’s debrief — whatever this says.',
    affects: [SERVICE_PAGES_REF],
  },

  /* ---- How far pages look ---- */
  {
    ...display(
      'display.windows.availabilityDays',
      (v) => v.windows.availabilityDays,
      (v, n) => ({ ...v, windows: { ...v.windows, availabilityDays: n } }),
      DISPLAY_DEFAULTS.windows.availabilityDays,
    ),
    kind: 'dial',
    label: 'Availability asks this far ahead',
    summary: 'At least the rota’s own window, whatever this says.',
    help: 'How far ahead people are asked whether they can serve. It never asks less far ahead than the rota lists, so nobody is put on a service they were not asked about.',
    affects: ['/availability'],
    min: 1,
    max: 120,
    majorEvery: 7,
    unit: 'days',
  },
  {
    ...display(
      'display.windows.setListDays',
      (v) => v.windows.setListDays,
      (v, n) => ({ ...v, windows: { ...v.windows, setListDays: n } }),
      DISPLAY_DEFAULTS.windows.setListDays,
    ),
    kind: 'dial',
    label: 'Set Lists looks ahead',
    summary: 'The services whose songs are listed.',
    help: 'Services within this many days get a set list on the page, today’s first.',
    affects: ['/set-lists'],
    min: 1,
    max: 120,
    majorEvery: 7,
    unit: 'days',
  },
  {
    ...display(
      'display.windows.debriefAheadDays',
      (v) => v.windows.debriefAheadDays,
      (v, n) => ({ ...v, windows: { ...v.windows, debriefAheadDays: n } }),
      DISPLAY_DEFAULTS.windows.debriefAheadDays,
    ),
    kind: 'dial',
    label: 'Debriefs lists services ahead',
    summary: 'So a team can see which debriefs are coming.',
    help: 'Services within this many days are listed on Debriefs under Next and Upcoming. A debrief only opens for writing once its service has ended.',
    affects: ['/debriefs'],
    min: 1,
    max: 120,
    majorEvery: 7,
    unit: 'days',
  },
  {
    ...display(
      'display.windows.diaryPastDays',
      (v) => v.windows.diaryPastDays,
      (v, n) => ({ ...v, windows: { ...v.windows, diaryPastDays: n } }),
      DISPLAY_DEFAULTS.windows.diaryPastDays,
    ),
    kind: 'dial',
    label: 'Events keeps past events for',
    summary: 'How far back the diary’s Past events go on screen.',
    help: 'Only what is drawn: the events themselves are not deleted.',
    affects: ['/events'],
    min: 1,
    max: 3650,
    dialMax: 730,
    majorEvery: 30,
    unit: 'days',
  },
  {
    ...display(
      'display.windows.invitationStaleDays',
      (v) => v.windows.invitationStaleDays,
      (v, n) => ({ ...v, windows: { ...v.windows, invitationStaleDays: n } }),
      DISPLAY_DEFAULTS.windows.invitationStaleDays,
    ),
    kind: 'dial',
    label: 'An invitation is stale after',
    summary: 'When an unanswered one is marked as gone quiet.',
    help: 'An invitation nobody has accepted is marked stale after this many days, so it can be chased or sent again.',
    affects: ['/volunteers'],
    min: 1,
    max: 365,
    dialMax: 120,
    majorEvery: 7,
    unit: 'days',
  },

  /* ---- What is kept, and for how long ---- */
  {
    ...weekday('board_clear_dow'),
    kind: 'choice',
    style: 'select',
    label: 'The message board clears every',
    summary: 'Every post, and the activity feed with it.',
    help: 'At 00:00 UTC on this day, the message board empties — every post, plus the bell notifications pointing at them, so the bell never points at something that is gone — and the dashboard’s activity feed clears with it. The planner’s Finished list resets on the same clock, so nobody has to learn two different weeks.',
    affects: ['/messages', '/', '/service-planner'],
    ariaLabel: 'Day the board clears',
    options: weekdayOptions,
    fallbackText: `${WEEKDAY_NAMES[DEFAULT_SETTINGS.board_clear_dow]}, two days after Sunday`,
  },
  {
    ...column('team_chat_retention_days'),
    kind: 'forever',
    label: 'Team chat is kept for',
    summary: 'Each post goes this long after it was written.',
    help: 'Every post older than this, in every team’s chat, is deleted each night — alerts and mentions included. A chat never empties all at once: each post has its own clock.',
    affects: ['/team-chat'],
  },
  {
    ...column('church_update_retention_days'),
    kind: 'dial',
    label: 'A new Church Update ends after',
    summary: 'What the end time starts at when an Admin posts.',
    help: 'Every update has an end time, set when it is posted — the form starts it this far ahead, and the Admin can change it. At its end time the update is gone for everybody, pinned or not.',
    affects: ['/updates'],
    ...wideDays,
    unit: 'days',
  },
  {
    ...column('poll_retention_days'),
    kind: 'dial',
    label: 'A poll clears',
    summary: 'This long after its deadline, unless the asker picks a time.',
    help: 'Every poll has a clear time. The form starts it this long after the poll’s deadline — or after it was posted, if it has no deadline. At its clear time the poll is deleted with every answer.',
    affects: ['/polls'],
    ...wideDays,
    unit: 'days',
  },
  {
    ...column('poll_voters_seen_by'),
    kind: 'choice',
    style: 'select',
    label: 'Who sees the names on an anonymous poll',
    summary: 'The Owner always does. Everybody else sees the counts.',
    help: 'A poll is anonymous unless whoever asks it says otherwise. On an anonymous poll everybody sees the counts and their own answer, and the Owner sees every name. Choose whether Admins, or Admins and the Head and Assisting Head of the team the poll is for, see the names too. On a named poll everybody it is for sees who picked what. The database enforces the choice, so it is a real rule.',
    affects: ['/polls'],
    ariaLabel: 'Who sees the names on an anonymous poll',
    options: [
      { value: 'owner', label: 'Only the Owner' },
      { value: 'admins', label: 'The Owner and Admins' },
      { value: 'leads', label: 'The Owner, Admins and the team’s Heads' },
    ],
    put: (_d, v) => ({ poll_voters_seen_by: v as AppSettings['poll_voters_seen_by'] }),
  },
  {
    ...column('poll_top_count'),
    kind: 'choice',
    style: 'select',
    label: 'Most-picked options shown at the top',
    summary: 'Lifted to the top of the poll and marked Top.',
    help: 'On a poll with more options than this, the ones with the most answers move to the top of the card and are marked Top. Options tied at the cut-off are all marked. An option nobody has picked never is. Off shows every poll in the order it was asked.',
    affects: ['/polls'],
    ariaLabel: 'Most-picked options shown at the top',
    options: [
      { value: '0', label: 'Off' },
      { value: '1', label: 'The top 1' },
      { value: '2', label: 'The top 2' },
      { value: '3', label: 'The top 3' },
      { value: '4', label: 'The top 4' },
      { value: '5', label: 'The top 5' },
    ],
    get: (d) => String(d.poll_top_count ?? DEFAULT_SETTINGS.poll_top_count),
    put: (_d, v) => ({ poll_top_count: Number(v) }),
    fallback: String(DEFAULT_SETTINGS.poll_top_count),
  },
  {
    ...column('poll_top_seen_by'),
    kind: 'choice',
    style: 'select',
    label: 'Who sees the top options',
    summary: 'Everybody else sees the options in the order they were asked.',
    help: 'Whoever asked a poll, and the Admins (the Owner among them), always see its most-picked options lifted and marked. Choose whether the Head and Assisting Head of the team the poll is for see it too, or everybody it is for. The counts themselves are on every card either way.',
    affects: ['/polls'],
    ariaLabel: 'Who sees the top options',
    when: (d) => (d.poll_top_count ?? DEFAULT_SETTINGS.poll_top_count) > 0,
    options: [
      { value: 'askers', label: 'Whoever asked, and Admins' },
      { value: 'leads', label: 'Whoever asked, Admins and the team’s Heads' },
      { value: 'everyone', label: 'Everybody the poll is for' },
    ],
    put: (_d, v) => ({ poll_top_seen_by: v as AppSettings['poll_top_seen_by'] }),
  },
  {
    ...column('poll_managed_by'),
    kind: 'choice',
    style: 'select',
    label: 'Who may edit or delete a poll',
    summary: 'Whoever asked it and the Admins always may.',
    help: 'Whoever asked a poll, and the Admins (the Owner among them), may always change or delete it. Choose whether the Head and Assisting Head of the poll’s own team may too — a poll for the team, or for the team’s people at a service. A poll for everyone or for named people has no team, so only its asker and the Admins manage it. The database enforces the choice.',
    affects: ['/polls'],
    ariaLabel: 'Who may edit or delete a poll',
    options: [
      { value: 'askers', label: 'Whoever asked, and Admins' },
      { value: 'leads', label: 'Whoever asked, Admins and the team’s Heads' },
    ],
    put: (_d, v) => ({ poll_managed_by: v as AppSettings['poll_managed_by'] }),
  },
  {
    ...column('service_retention_days'),
    kind: 'dial',
    label: 'Services are kept for',
    summary: 'Then the service and everything about it is deleted.',
    help: 'Counted from the service date. When it is up, the service goes with its running order, rota, availability answers, checklist ticks, set list, team readiness, debrief, every issue (resolved or not) and any poll about it. Upcoming services are never touched.',
    affects: [SERVICE_PAGES_REF, '/issues'],
    min: 7,
    max: 365,
    majorEvery: 7,
    unit: 'days',
  },
  {
    ...column('debrief_retention_days'),
    kind: 'dial',
    label: 'Debrief minutes are kept for',
    summary: 'Never longer than the service itself.',
    help: 'Counted from the service date, so every team’s minutes for one Sunday go together. A service that is deleted takes its debrief with it, so a number longer than “Services are kept for” makes no difference.',
    affects: ['/debriefs'],
    ...wideDays,
    unit: 'days',
  },
  {
    ...column('issue_retention_days'),
    kind: 'dial',
    label: 'Resolved issues are kept for',
    summary: 'Never longer than the service itself.',
    help: 'Once a Head marks an issue resolved, it stays this many days so everyone can see it was dealt with. Issues that are not resolved stay until an Admin deletes them or their service is deleted. The same number is how far back the Issues page’s Finished list goes.',
    affects: ['/issues'],
    ...wideDays,
    unit: 'days',
  },
  {
    ...column('notification_keep_count'),
    kind: 'dial',
    label: 'Each person’s bell keeps',
    summary: 'Their newest ones; older ones are deleted as new ones arrive.',
    help: 'When a notification arrives and somebody already has this many, their oldest is deleted — read or unread. The things they point at are not touched.',
    affects: [BELL],
    min: 5,
    max: 50,
    majorEvery: 5,
    unit: 'notifications',
  },
  {
    ...column('notification_retention_days'),
    kind: 'forever',
    label: 'Bell notifications are also cleared after',
    summary: 'On top of the per-person limit above.',
    help: 'Any notification older than this is deleted each night, read or unread, even if the person has fewer than their limit. “For ever” leaves it to the limit alone.',
    affects: [BELL],
  },
  {
    ...weekday('alert_clear_dow'),
    kind: 'choice',
    style: 'select',
    label: 'The record of sent alerts clears every',
    summary: 'The list under Send an alert of what went out.',
    help: 'At 00:00 UTC on this day, the list of alerts that were sent — who sent which, to whom — is deleted. It does not reach into anybody’s bell.',
    affects: [ALERTS],
    ariaLabel: 'Day the sent-alerts record clears',
    options: [...weekdayOptions, { value: 'never', label: 'Never' }],
  },
  {
    ...column('feedback_retention_days'),
    kind: 'forever',
    label: 'Settled feedback is kept for',
    summary: 'Done and Won’t do only — open feedback always stays.',
    help: 'Feedback the Owner has marked Done or Won’t do is deleted this long after it was settled, with its reply. Anything New or Looking into it is never cleared on a clock.',
    affects: ['/feedback'],
  },

  /* ---- Stage layouts ---- */
  {
    ...weekday('stage_clear_dow'),
    kind: 'choice',
    style: 'select',
    label: 'Layouts clear every',
    summary: 'The day the stages of held services are wiped.',
    help: 'On this day, at the hour below, every stage layout whose service date has passed is deleted with its comments and its history. Layouts for services still to come are never touched, and templates never are. Never leaves them to go with their service on the Services clock.',
    affects: ['/stage'],
    ariaLabel: 'Day stage layouts clear',
    options: neverOrWeekday,
  },
  {
    ...column('stage_clear_hour'),
    kind: 'choice',
    style: 'select',
    label: 'At',
    summary: 'The hour, in the church’s timezone.',
    help: 'The job runs once an hour and acts in this one. Early morning keeps it clear of anybody still drawing late on the day before.',
    affects: ['/stage'],
    ariaLabel: 'Hour stage layouts clear',
    options: hourOptions,
    get: (d) => String(column('stage_clear_hour').get(d)),
    put: (_d, v) => ({ stage_clear_hour: Number(v) }),
    fallback: String(DEFAULT_SETTINGS.stage_clear_hour),
    fallbackText: `${String(DEFAULT_SETTINGS.stage_clear_hour).padStart(2, '0')}:00`,
    when: (d) => column('stage_clear_dow').get(d) !== null,
  },

  /* ---- Overwatch (0187) ---- */
  {
    ...column('overwatch_board_posts'),
    kind: 'switch',
    label: 'Overwatch may post on the message board',
    summary: 'As themselves, never as a team.',
    help: 'Overwatch reads everything and changes almost nothing. This is one of the five things it may do: post on the message board, under their own name. It needs the Message Board open to Overwatch as well (Settings › Overwatch).',
    affects: ['/messages'],
  },
  {
    ...column('overwatch_chat_posts'),
    kind: 'switch',
    label: 'Overwatch may post in team chats',
    summary: 'In any team’s chat, which it can already read.',
    help: 'Overwatch can read every team’s chat. With this on it can also post in any of them, as itself. It cannot remove or edit anybody else’s messages. It needs Team Chat open to Overwatch as well.',
    affects: ['/team-chat'],
  },
  {
    ...column('overwatch_polls'),
    kind: 'switch',
    label: 'Overwatch may ask polls',
    summary: 'And change or remove its own. It reads every poll either way.',
    help: 'Overwatch can see every poll and its counts. With this on it can also ask one, of any audience, and change or remove the ones it asked. It never answers a poll that was not asked of it.',
    affects: ['/polls'],
  },
  {
    ...column('overwatch_issues'),
    kind: 'switch',
    label: 'Overwatch may raise issues',
    summary: 'Filed as raised by Overwatch, in a group of their own.',
    help: 'Overwatch can raise an issue against any team, inside the same window everybody else raises in. The team is told, and the Issues page gathers these under Overwatch. Overwatch never marks an issue resolved — that stays with the team.',
    affects: ['/issues'],
  },
  {
    ...column('overwatch_debriefs'),
    kind: 'switch',
    label: 'Overwatch may write its own debrief',
    summary: 'One Overwatch write-up per service, beside every team’s.',
    help: 'Each service gets an Overwatch debrief next to the teams’ — the points anybody in Overwatch noticed, written while the debrief window is open. It never writes a team’s debrief.',
    affects: ['/debriefs'],
  },

  /* ---- Clock in (0191) ---- */
  {
    ...column('clock_in_lead_minutes'),
    kind: 'dial',
    label: 'Clock-in opens',
    summary: 'Before somebody’s call time — and their reminder goes out then too.',
    help: 'This many minutes before somebody’s earliest call time of the day, the big CLOCK IN button appears on their Dashboard and their phone is sent a reminder. The two always go together. It stays open until the day’s last service has ended.',
    affects: ['/', '/clock-in'],
    min: 0,
    max: 240,
    dialMax: 60,
    majorEvery: 5,
    unit: 'minutes',
  },
  {
    ...column('clock_in_radius_m'),
    kind: 'dial',
    label: 'Counts as at church within',
    summary: 'Of the pin on the Clock In page.',
    help: 'A phone further than this from the church’s pin is told it is too far and is not clocked in. About 100 m covers a church and its car park; a bigger site, or one in a dense town centre, may need more.',
    affects: ['/clock-in'],
    min: 20,
    max: 2000,
    dialMax: 500,
    dialStep: 10,
    majorEvery: 50,
    unit: 'metres',
  },
  {
    ...column('clock_in_accuracy_m'),
    kind: 'dial',
    label: 'A reading must be accurate to',
    summary: 'Either way. A rougher one is not trusted.',
    help: 'Every position a phone gives comes with how sure it is. A reading rougher than this is refused, and the person is told to turn on Precise Location or step outside for a moment: a rough one could put somebody in the car park inside, or somebody inside out of range.',
    affects: ['/clock-in'],
    min: 5,
    max: 1000,
    dialMax: 200,
    dialStep: 5,
    majorEvery: 25,
    unit: 'metres',
  },
  {
    ...column('clock_in_include_yes'),
    kind: 'switch',
    label: 'People who said Yes clock in too',
    summary: 'Not only those the rota gave a role.',
    help: 'Out of the box only people the Team Rota put on a role that day clock in. On, anybody who said Yes on Availability for one of the day’s services does too, with their team’s call time.',
    affects: ['/', '/clock-in'],
  },
  {
    ...column('clock_in_approvers'),
    kind: 'choice',
    style: 'segmented',
    label: 'In an approving team, who approves',
    summary: 'A request to be clocked in, when a phone could not.',
    help: 'When a phone cannot be placed at church, its owner can ask to be clocked in. The Owner and Admins can always approve, and so can the teams chosen below — either their Head and Assisting Head, or anybody on them (a Welcome team at the door, say).',
    affects: ['/clock-in'],
    ariaLabel: 'In an approving team, who approves',
    options: [
      { value: 'leads', label: 'Heads' },
      { value: 'members', label: 'Anyone on it' },
    ],
    put: (_d, v) => ({ clock_in_approvers: v as AppSettings['clock_in_approvers'] }),
  },
  {
    ...column('clock_in_retention_days'),
    kind: 'dial',
    label: 'Clock-ins are kept for',
    summary: 'Then deleted: the time, the position, the address and its history.',
    help: 'Each day’s clock-ins, where people were and the street address, and every correction, are deleted this many days after the day. Where somebody was is personal data: keep it no longer than it is useful.',
    affects: ['/clock-in'],
    ...wideDays,
    unit: 'days',
  },
]

const BY_ID = new Map(SETTINGS_CATALOG.map((e) => [e.id, e]))

/** An entry by its id, which is its column or its `display` path. */
export function settingEntry(id: string): SettingEntry {
  const entry = BY_ID.get(id)
  if (!entry) throw new Error(`No such setting: ${id}`)
  return entry
}

/** The settings that are this page's own, in the catalog's order. */
export function settingsForPage(page: string): SettingEntry[] {
  return SETTINGS_CATALOG.filter((e) => e.affects.some((ref) => affectsPage(ref, page)))
}

/** The columns a set of entries reads and writes, each once. */
export function columnsOf(entries: readonly SettingEntry[]): (keyof AppSettings)[] {
  return [...new Set(entries.flatMap((e) => e.keys))]
}
