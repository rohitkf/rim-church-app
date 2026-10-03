import { useEffect, useId, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { useErrorText } from '../lib/useErrorText'
import { QueryState } from './QueryState'
import { NumberDial } from './NumberDial'
import { TimeField } from './DateTimeFields'
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  WEEKDAY_NAMES,
  fetchAppSettings,
  type AppSettings,
} from '../lib/appSettings'
import { shortDuration } from '../lib/settingsReadout'
import { Select, selectPillClasses } from './Select'
import { ActionButton, Pill, SectionTile } from './Surface'
import { Chevron } from './Collapsible'

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
 * itself, the hours after, issues, availability, and the tidying-up — because
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
type NumberKey = keyof Omit<
  AppSettings,
  | 'always_show_my_services'
  | 'board_clear_dow'
  | 'logo_url'
  | 'timezone'
  | 'availability_closes_time'
  | 'coordinator_color'
  | 'issues_raise_scope'
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

const FIELDS: Record<string, NumberField> = {
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
  debrief_retention_days: {
    key: 'debrief_retention_days',
    label: 'Debrief minutes are kept for',
    summary: 'Working notes, not an archive — then they are deleted.',
    help: 'Minutes are working notes rather than an archive: they say what went wrong and often name whoever it went wrong for, which is fine for a fortnight and a file on somebody after a year. The clock runs from the service date, not from when they were typed, so every team’s minutes for one Sunday go together. A nightly job deletes them — deletes, not hides.',
    affects: ['Debriefs'],
    min: 1,
    max: 365,
    dialMax: 120,
    majorEvery: 7,
    unit: 'days',
  },
  issue_retention_days: {
    key: 'issue_retention_days',
    label: 'Resolved issues are kept for',
    summary: 'Long enough for everyone to see it was dealt with.',
    help: 'Once a Head of the team marks an issue resolved, it stays on the Issues page this many days so everyone can see it was dealt with and by whom, then a nightly job deletes it. Open, not resolved and persistent issues are never deleted on a clock — they stay until a Head marks them resolved. The same number of days is how far back the Issues page’s Finished list goes.',
    affects: ['Issues'],
    min: 1,
    max: 365,
    dialMax: 120,
    majorEvery: 7,
    unit: 'days',
  },
}

const SCOPES: { value: AppSettings['issues_raise_scope']; label: string }[] = [
  { value: 'team', label: 'Anyone on a team' },
  { value: 'everyone', label: 'Everyone signed in' },
  { value: 'leads', label: 'Heads and Admins only' },
]

export function AppSettingsCard() {
  const { isAdmin } = useAuth()
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<AppSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  const query = useQuery({ queryKey: SETTINGS_KEY, queryFn: fetchAppSettings })
  useEffect(() => {
    if (query.data) setDraft(query.data)
  }, [query.data])

  const save = useMutation({
    mutationFn: async (next: AppSettings) => {
      // The Coordinator's colour has its own room and its own Save; sending
      // this draft's copy of it would quietly undo a colour chosen there
      // since this page loaded.
      const { coordinator_color: _theirs, ...mine } = next
      const { error } = await supabase.from('app_settings').update(mine).eq('id', true)
      if (error) throw error
    },
    onSuccess: () => {
      setError(null)
      setSaved(true)
      // Every page reads these, and most of them are already on screen
      // behind this one, so the whole cache is the honest thing to drop.
      queryClient.invalidateQueries()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not save the settings.')),
  })

  if (!isAdmin) return null

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSaved(false)
    setDraft((current) => (current ? { ...current, [key]: value } : current))
  }
  const changed = !!draft && !!query.data && JSON.stringify(draft) !== JSON.stringify(query.data)
  const differs = (key: keyof AppSettings) => !!draft && !!query.data && draft[key] !== query.data[key]
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
      <QueryState isLoading={query.isLoading} error={query.error}>
        {draft && (
          <>
            <p className="px-1 text-body-sm text-on-surface-variant">
              The church’s clocks, for everybody at once. Tap a setting to change it.
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

            <SectionTile title="Tidying up" hint="What clears itself, and when. A clear-out is a deletion.">
              <SettingList>
                <InlineRow
                  label="The message board clears every"
                  summary="And the planner’s Finished list turns over with it."
                  changed={differs('board_clear_dow')}
                  help="At 00:00 UTC on this day, the message board empties — every post, plus the bell notifications pointing at them, so the bell never points at something that is gone — and the dashboard’s activity feed clears with it. The planner’s Finished list resets on the same clock, so nobody has to learn two different weeks. The clear-out is a deletion and cannot be undone."
                  affects={['Message board', 'Service Planner']}
                  defaultText={`${WEEKDAY_NAMES[DEFAULT_SETTINGS.board_clear_dow]}, two days after Sunday`}
                >
                  <Select
                    value={String(draft.board_clear_dow)}
                    onChange={(dow) => set('board_clear_dow', Number(dow))}
                    aria-label="Day the board clears"
                    className={selectPillClasses}
                    options={WEEKDAY_NAMES.map((name, dow) => ({
                      value: String(dow),
                      label: name,
                    }))}
                  />
                </InlineRow>
                {numberRow('debrief_retention_days')}
                {numberRow('issue_retention_days')}
              </SettingList>
            </SectionTile>

            {error && (
              <p className="rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
                {error}
              </p>
            )}

            {/*
              * Save follows you down the page.
              *
              * Every control here edits a draft, and the only way to keep it
              * was a button at the foot of a card that runs to several
              * screens on a phone. So the honest way to move a dial was:
              * drag it, scroll past four more settings, press Save. Anyone
              * who dragged and left — which is everyone, because a dial that
              * moves looks like a thing that happened — changed nothing, was
              * told nothing, and found the old number waiting next time.
              *
              * The row sticks to the bottom of the screen instead, above the
              * dock it would otherwise hide behind, and says out loud that
              * there is something unsaved. It only sticks, and grows its own
              * background, when there is: with nothing to save it is an
              * ordinary row at the end of the page, rather than a clear
              * strip floating over the settings above it.
              */}
            <div
              className={`z-10 flex flex-wrap items-center gap-3 px-4 py-3 ${
                changed
                  ? 'sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] rounded-[var(--radius-card)] bg-surface-lowest/95 shadow-[inset_0_0_0_1px_var(--color-outline-variant)] backdrop-blur sm:bottom-[calc(5.75rem+env(safe-area-inset-bottom))]'
                  : ''
              }`}
            >
              <ActionButton
                onClick={() => draft && save.mutate(draft)}
                disabled={!changed || save.isPending}
              >
                {save.isPending ? 'Saving…' : 'Save settings'}
              </ActionButton>
              <ActionButton
                tone="quiet"
                onClick={() => {
                  setSaved(false)
                  setDraft(DEFAULT_SETTINGS)
                }}
              >
                Restore defaults
              </ActionButton>
              {changed && (
                <span className="text-body-sm text-accent-orange-soft">
                  Not saved yet — nothing changes for anybody until you press Save.
                </span>
              )}
              {saved && !changed && <span className="text-body-sm text-accent-green">Saved.</span>}
            </div>
          </>
        )}
      </QueryState>
    </div>
  )
}

function SettingList({ children }: { children: ReactNode }) {
  return <ul className="-mx-2 flex flex-col">{children}</ul>
}

/** The quiet extras for a row: what it moves, its default, and the full story. */
function Detail({
  help,
  affects,
  defaultText,
  onDefault,
  folded = false,
}: {
  help: string
  affects: string[]
  defaultText: string
  onDefault?: () => void
  /** Everything behind the disclosure, for a row that has no open state of its own. */
  folded?: boolean
}) {
  const facts = (
    <div className="flex flex-wrap items-center gap-1.5">
      {affects.map((page) => (
        <Pill key={page}>{page}</Pill>
      ))}
      <span className="ml-1 font-mono text-label-sm text-on-surface-faint">default {defaultText}</span>
      {onDefault && (
        <button
          type="button"
          onClick={onDefault}
          className="tap ml-auto rounded-full px-2 py-1 text-label-md text-accent-blue-soft hover:text-on-surface"
        >
          Use default
        </button>
      )}
    </div>
  )
  return (
    <div className={`flex flex-col gap-3 ${folded ? 'mt-1' : 'mt-3'}`}>
      {!folded && facts}
      <details className={`group/how ${folded ? '' : 'rounded-[var(--radius-chip)] bg-raised px-3.5 py-2.5'}`}>
        <summary className="tap inline-flex cursor-pointer list-none items-center text-label-md text-on-surface-faint marker:hidden hover:text-on-surface [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-1.5">
            <span className="transition-transform duration-300 group-open/how:rotate-90" aria-hidden="true">
              ›
            </span>
            How this works
          </span>
        </summary>
        <div className={`mt-2 flex flex-col gap-2 ${folded ? 'rounded-[var(--radius-chip)] bg-raised px-3.5 py-3' : ''}`}>
          <p className="text-body-sm text-on-surface-variant">{help}</p>
          {folded && facts}
        </div>
      </details>
    </div>
  )
}

/** A dot that says "you moved this and have not saved it". */
function Unsaved({ on }: { on: boolean }) {
  if (!on) return null
  return (
    <span
      title="Changed, not saved yet"
      aria-label="Changed, not saved yet"
      className="ml-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-accent-orange align-middle"
    />
  )
}

/**
 * A setting whose control needs room: one row that says its value, and
 * opens to the control and the explanation when tapped.
 */
function SettingRow({
  label,
  summary,
  value,
  changed,
  open,
  onToggle,
  children,
  ...detail
}: {
  label: string
  summary: string
  value: string
  changed: boolean
  open: boolean
  onToggle: () => void
  children: ReactNode
  help: string
  affects: string[]
  defaultText: string
  onDefault?: () => void
}) {
  const id = useId()
  return (
    <li className={`rounded-[var(--radius-row)] transition-colors duration-300 ${open ? 'bg-raised' : ''}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
        className="tap flex w-full items-center gap-3 rounded-[var(--radius-row)] px-3 py-3 text-left transition-colors duration-300 hover:bg-raised"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-body-sm font-medium text-on-surface">
            {label}
            <Unsaved on={changed} />
          </span>
          <span className="block text-label-md text-on-surface-variant">{summary}</span>
        </span>
        <span className="shrink-0 rounded-full bg-raised-strong px-3 py-1 font-mono text-label-md tabular text-on-surface">
          {value}
        </span>
        <Chevron open={open} />
      </button>
      {open && (
        <div id={id} className="px-3 pb-4">
          {children}
          <Detail {...detail} />
        </div>
      )}
    </li>
  )
}

/**
 * A setting whose control is small enough to sit in the row itself — a
 * switch, a short list, a time. Its explanation still folds away.
 */
function InlineRow({
  label,
  summary,
  changed,
  children,
  help,
  affects,
  defaultText,
}: {
  label: string
  summary: string
  changed: boolean
  children: ReactNode
  help: string
  affects: string[]
  defaultText: string
}) {
  return (
    <li className="px-3 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="min-w-0 flex-1 basis-48">
          <span className="block text-body-sm font-medium text-on-surface">
            {label}
            <Unsaved on={changed} />
          </span>
          <span className="block text-label-md text-on-surface-variant">{summary}</span>
        </span>
        <span className="flex shrink-0 items-center">{children}</span>
      </div>
      <Detail help={help} affects={affects} defaultText={defaultText} folded />
    </li>
  )
}

/** On or off, drawn as a switch, still a real checkbox underneath. */
function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (on: boolean) => void
  label: string
}) {
  return (
    <label className="relative inline-flex cursor-pointer items-center">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="h-7 w-12 rounded-full bg-raised-strong hairline transition-colors duration-300 peer-checked:bg-accent-green peer-focus-visible:shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]"
      />
      <span
        aria-hidden="true"
        className="absolute left-1 top-1 h-5 w-5 rounded-full bg-on-surface shadow-[var(--shadow-ambient)] transition-transform duration-300 ease-[var(--ease-glide)] peer-checked:translate-x-5 peer-checked:bg-on-primary"
      />
    </label>
  )
}
