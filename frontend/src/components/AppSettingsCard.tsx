import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from './QueryState'
import { NumberDial } from './NumberDial'
import { TimeField } from './DateTimeFields'
import { DEFAULT_SETTINGS, type AppSettings } from '../lib/appSettings'
import { useSettingsDraft } from '../lib/useSettingsDraft'
import { shortDuration } from '../lib/settingsReadout'
import { Select, selectPillClasses } from './Select'
import { SectionTile } from './Surface'
import { InlineRow, SaveBar, SettingList, SettingRow, Switch } from './SettingRows'

/**
 * A few zones to pick from without typing. Free text underneath, because
 * a list of the ones we thought of is a list somebody's church is missing
 * from — and the database checks the name against its own tz database
 * either way.
 */
const TIMEZONES = [
  'Europe/London',
  'Europe/Dublin',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Africa/Lagos',
  'Africa/Nairobi',
  'Australia/Sydney',
  'UTC',
]

/**
 * The windows the app works to, in one place an Admin can change.
 *
 * Every field here used to be a number in the source. They are grouped by
 * the moment in a church's week they govern — planning ahead, the day
 * itself, the hours after, issues and availability — because
 * the question an Admin arrives with is "why am I not seeing next Sunday
 * yet", a question about a moment, not about integers.
 *
 * The page used to print every explanation in full, under every dial, all
 * at once: fourteen paragraphs and fourteen rulers, several screens of
 * them on a phone. Now each setting is one row — its name, a line saying
 * what it does, and its value as a person would say it ("12 h") — and the
 * ruler and the full explanation open under the row that was tapped. The
 * explanations are all still here; they are just no longer all in the way.
 *
 * Each still carries the shipped default and a way back to it, so a
 * church that has tuned itself into a corner can find its way out without
 * asking anybody.
 */
/** The keys this room owns, and saves — no other room's. */
const TIMINGS_KEYS = [
  'rota_window_days',
  'always_show_my_services',
  'lead_in_minutes',
  'run_out_minutes',
  'edit_grace_minutes',
  'after_service_checklist_minutes',
  'debrief_open_minutes_after',
  'issues_raise_scope',
  'issue_open_minutes_before',
  'issue_close_minutes_after',
  'availability_closes_time',
  'timezone',
] as const satisfies readonly (keyof AppSettings)[]

type TimingsKey = (typeof TIMINGS_KEYS)[number]

type NumberKey = Exclude<
  TimingsKey,
  'always_show_my_services' | 'issues_raise_scope' | 'availability_closes_time' | 'timezone'
>

type NumberField = {
  key: NumberKey
  label: string
  /** One line, always on show. */
  summary: string
  /** The whole story, for whoever opens "How this works". */
  help: string
  /** Which pages move when it moves — the question people arrive with. */
  affects: string[]
  min: number
  max: number
  /** Where the ruler stops, when the real ceiling is absurd to drag to. */
  dialMax?: number
  dialStep?: number
  majorEvery?: number
  unit: 'minutes' | 'days'
}

const FIELDS: Record<NumberKey, NumberField> = {
  rota_window_days: {
    key: 'rota_window_days',
    label: 'Days ahead',
    summary: 'How far ahead the rota, availability and checklists list services.',
    help: 'Every service dated within this many days of today is listed — not the next few services, which on a busy Sunday would be spent on one day and hide the week after. Two rules ride along and cannot be turned off: if nothing falls inside the window the nearest day that has a service is shown instead, so the page is never blank; and a service that has finished stops holding the window open, so the moment today’s service ends, next Sunday’s is already there.',
    affects: ['Team Rota', 'Availability', 'Checklists'],
    min: 1,
    max: 120,
    dialMax: 60,
    majorEvery: 7,
    unit: 'days',
  },
  lead_in_minutes: {
    key: 'lead_in_minutes',
    label: 'Doors open before',
    summary: 'A service reads as “on now” this long before it starts.',
    help: 'A service starts wearing the “on now” badge this long before its first session, so the rota highlights the right service while teams are setting up. Both ends are read from the running order, so a service with no running order planned is never “on now”.',
    affects: ['Team Rota'],
    min: 0,
    max: 240,
    unit: 'minutes',
  },
  run_out_minutes: {
    key: 'run_out_minutes',
    label: 'Still on after',
    summary: 'And it keeps reading as “on now” this long after it ends.',
    help: 'It keeps the badge this long after the last session ends, so it does not blink out mid-handshake. Set it to 0 for the badge to go the second the service does.',
    affects: ['Team Rota'],
    min: 0,
    max: 240,
    unit: 'minutes',
  },
  edit_grace_minutes: {
    key: 'edit_grace_minutes',
    label: 'Editing stays open for',
    summary: 'How long a finished service can still be corrected.',
    help: 'How long after a service ends its record stays open for correction. The clock starts when End service was pressed, or, if nobody pressed it, at the planned end of the last session. When it runs out the database itself starts refusing changes to the running order, checklist ticks and sign-offs, availability answers, and rota assignments for that service — so this is a real lock, not a hidden button. An hour is “walk off the stage and fix what you noticed”; a day suits a team that does its paperwork on Monday.',
    affects: ['Running order', 'Checklists', 'Availability', 'Team Rota'],
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
  after_service_checklist_minutes: {
    key: 'after_service_checklist_minutes',
    label: 'After-the-service checklist stays open for',
    summary: 'Time to pack away and lock up, then the list closes.',
    help: 'The “After the service” half of every checklist is work done once the service is over — packing away, locking up — so it stays open this long after the service ends, then closes. The clock starts when End service was pressed, or, if nobody pressed it, at the planned end of the last session. The “Before the service” half closes when the service does. The database enforces it, so it is a real lock.',
    affects: ['Checklists'],
    min: 0,
    max: 1440,
    dialMax: 360,
    dialStep: 15,
    majorEvery: 4,
    unit: 'minutes',
  },
  debrief_open_minutes_after: {
    key: 'debrief_open_minutes_after',
    label: 'Teams can write their debrief for',
    summary: 'While the morning is still fresh. Heads and Admins can write any time.',
    help: 'How long after a service ends anybody on a team can add to their own team’s debrief. The clock starts when End service was pressed, or, if nobody pressed it, at the planned end of the last session. Before the service ends and after this runs out, only the team’s Head or Assisting Head, and Admins, can write in it. The database enforces it.',
    affects: ['Debriefs'],
    min: 0,
    max: 10080,
    dialMax: 1440,
    dialStep: 30,
    majorEvery: 4,
    unit: 'minutes',
  },
  issue_open_minutes_before: {
    key: 'issue_open_minutes_before',
    label: 'Raising opens before the service',
    summary: 'While teams are setting up and finding what is broken.',
    help: 'How long before a service’s first session starts people can begin raising issues for it. The database refuses an issue raised earlier. Heads, Assisting Heads and Admins can raise one at any time.',
    affects: ['Issues'],
    min: 0,
    max: 720,
    dialMax: 240,
    dialStep: 15,
    majorEvery: 4,
    unit: 'minutes',
  },
  issue_close_minutes_after: {
    key: 'issue_close_minutes_after',
    label: 'Raising closes after the service',
    summary: 'After this, new issues for that service are refused.',
    help: 'How long after a service ends people can still raise an issue for it. The clock starts when End service was pressed, or, if nobody pressed it, at the planned end of the last session. After that the database refuses new issues for that service; the ones already raised stay.',
    affects: ['Issues'],
    min: 0,
    max: 1440,
    dialMax: 360,
    dialStep: 15,
    majorEvery: 4,
    unit: 'minutes',
  },
}

const SCOPES: { value: AppSettings['issues_raise_scope']; label: string }[] = [
  { value: 'team', label: 'Anyone on a team' },
  { value: 'everyone', label: 'Everyone signed in' },
  { value: 'leads', label: 'Heads and Admins only' },
]

export function AppSettingsCard() {
  const { isAdmin } = useAuth()
  const room = useSettingsDraft(TIMINGS_KEYS)
  const [open, setOpen] = useState<string | null>(null)

  if (!isAdmin) return null

  const { draft, set, differs } = room
  const toggle = (key: string) => setOpen((current) => (current === key ? null : key))

  /** A number row: name, line and value; the ruler opens beneath it. */
  const numberRow = (key: NumberKey) => {
    const field = FIELDS[key]
    if (!draft) return null
    const value = draft[key]
    const fallback = DEFAULT_SETTINGS[key]
    return (
      <SettingRow
        key={key}
        label={field.label}
        summary={field.summary}
        value={shortDuration(value, field.unit)}
        changed={differs(key)}
        open={open === key}
        onToggle={() => toggle(key)}
        help={field.help}
        affects={field.affects}
        defaultText={shortDuration(fallback, field.unit)}
        onDefault={value === fallback ? undefined : () => set(key, fallback)}
      >
        {/* A window of days is a length, and a length is easier to judge
            against its neighbours than to type into a box: 7 with 14 and
            30 in view is a decision, 7 alone is a guess. */}
        <NumberDial
          value={value}
          onChange={(next) => set(key, next)}
          min={field.min}
          max={field.dialMax ?? field.max}
          step={field.dialStep ?? 1}
          majorEvery={field.majorEvery ?? 5}
          unit={field.unit}
          label={field.label}
        />
      </SettingRow>
    )
  }

  return (
    <div id="timings" className="flex w-full scroll-mt-24 flex-col gap-4">
      <QueryState isLoading={room.query.isLoading} error={room.query.error}>
        {draft && (
          <>
            <p className="px-1 text-body-sm text-on-surface-variant">
              The church’s clocks, for everybody at once. Tap a setting to change it. What gets
              cleared away, and when, is in Data &amp; retention.
            </p>

            <SectionTile title="Planning ahead" hint="What people can see coming.">
              <SettingList>
                {numberRow('rota_window_days')}
                <InlineRow
                  label="Always show a service somebody is rostered on"
                  summary="Even if it is further out than the days ahead."
                  changed={differs('always_show_my_services')}
                  help="A safety net over the window above: if somebody is assigned to a service further out than the window, that service is added to their rota anyway, in date order. Nobody else’s page changes. Turn this off and a volunteer can be given a role on a service they cannot see, and will not know to tell you."
                  affects={['Team Rota']}
                  defaultText="on"
                >
                  <Switch
                    checked={draft.always_show_my_services}
                    onChange={(on) => set('always_show_my_services', on)}
                    label="Always show a service somebody is rostered on"
                  />
                </InlineRow>
              </SettingList>
            </SectionTile>

            <SectionTile title="On the day" hint="When a service reads as “on now” on the rota.">
              <SettingList>
                {numberRow('lead_in_minutes')}
                {numberRow('run_out_minutes')}
              </SettingList>
            </SectionTile>

            <SectionTile title="After the service" hint="How long things stay open once it ends.">
              <SettingList>
                {numberRow('edit_grace_minutes')}
                {numberRow('after_service_checklist_minutes')}
                {numberRow('debrief_open_minutes_after')}
              </SettingList>
            </SectionTile>

            <SectionTile title="Issues" hint="Who can raise one, and when.">
              <SettingList>
                <InlineRow
                  label="Who can raise one"
                  summary="Anybody on a team can always see them."
                  changed={differs('issues_raise_scope')}
                  help="“Everyone signed in” lets Church Members raise one too, and see the page. The team an issue is for marks it done. The database enforces the choice, so it is a real rule."
                  affects={['Issues']}
                  defaultText="Anyone on a team"
                >
                  <Select
                    value={draft.issues_raise_scope}
                    onChange={(scope) =>
                      set('issues_raise_scope', scope as AppSettings['issues_raise_scope'])
                    }
                    aria-label="Who can raise an issue"
                    className={selectPillClasses}
                    options={SCOPES}
                  />
                </InlineRow>
                {numberRow('issue_open_minutes_before')}
                {numberRow('issue_close_minutes_after')}
              </SettingList>
            </SectionTile>

            {/*
              When an answer is due, and on whose clock.

              These two belong together: "23:59" is not a moment until
              somebody says where, and the database enforces the same pair
              (0092) — so a church that moves its deadline and a church
              that moves country change the same two fields.
            */}
            <SectionTile title="Availability" hint="The last moment somebody can say whether they can serve.">
              <SettingList>
                <InlineRow
                  label="Closes the night before, at"
                  summary="Sunday’s answers are due on Saturday night."
                  changed={differs('availability_closes_time')}
                  help="Answers for a Sunday service are due the Saturday night; a Saturday service closes on the Friday. After this only an Admin or the team’s head can change an answer — and if somebody marks themselves unavailable before it, the role they were on goes back to unassigned and both heads are told."
                  affects={['Availability']}
                  defaultText="23:59"
                >
                  <TimeField
                    value={draft.availability_closes_time.slice(0, 5)}
                    onChange={(t) => t && set('availability_closes_time', `${t}:00`)}
                    label="Time availability closes"
                    aria-label="Time availability closes"
                    minuteStep={1}
                    className="inline-flex items-center gap-2 rounded-full bg-raised px-3 py-1.5 font-mono text-body-sm text-on-surface hairline focus:outline-none focus:ring-1 focus:ring-secondary"
                  />
                </InlineRow>
                <InlineRow
                  label="On the clock in"
                  summary="Summer time looks after itself."
                  changed={differs('timezone')}
                  help="An IANA name, like Europe/London. The database refuses one it has never heard of rather than storing a typo that would break the deadline."
                  affects={['Availability']}
                  defaultText="Europe/London"
                >
                  <input
                    type="text"
                    value={draft.timezone}
                    onChange={(e) => set('timezone', e.target.value)}
                    aria-label="Church timezone"
                    list="church-timezones"
                    className="w-44 rounded-full bg-raised px-3 py-1.5 font-mono text-body-sm text-on-surface hairline focus:outline-none focus:ring-1 focus:ring-secondary"
                  />
                  <datalist id="church-timezones">
                    {TIMEZONES.map((zone) => (
                      <option key={zone} value={zone} />
                    ))}
                  </datalist>
                </InlineRow>
              </SettingList>
            </SectionTile>

            <SaveBar
              changed={room.changed}
              saving={room.saving}
              saved={room.saved}
              error={room.error}
              onSave={room.save}
              onRestore={room.restoreDefaults}
            />
          </>
        )}
      </QueryState>
    </div>
  )
}
