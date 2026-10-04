import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { DEFAULT_SETTINGS, WEEKDAY_NAMES, type AppSettings } from '../lib/appSettings'
import { useSettingsDraft } from '../lib/useSettingsDraft'
import { shortDuration } from '../lib/settingsReadout'
import { NumberDial } from './NumberDial'
import { QueryState } from './QueryState'
import { Select, selectPillClasses } from './Select'
import { SectionTile } from './Surface'
import { InlineRow, SaveBar, SettingList, SettingRow, Switch } from './SettingRows'

/**
 * How long the app keeps things, page by page, in one room.
 *
 * Every clock here deletes — it does not hide — and a nightly job does it
 * (0116, 0117, 0120, and `apply_retention()` from 0123). So each row says
 * plainly what goes, and the newer ones start at "for ever": a church
 * that never opens this room loses nothing it did not already lose.
 *
 * The page that loses things says so too, in its own Lifespan line
 * (lib/lifespan.ts), worded from these same numbers.
 */

const KEYS = [
  'board_clear_dow',
  'debrief_retention_days',
  'issue_retention_days',
  'notification_retention_days',
  'team_chat_retention_days',
  'church_update_retention_days',
  'poll_retention_days',
  'alert_retention_days',
  'feedback_retention_days',
] as const satisfies readonly (keyof AppSettings)[]

type Kept = 'debrief_retention_days' | 'issue_retention_days'
type MaybeForever =
  | 'notification_retention_days'
  | 'team_chat_retention_days'
  | 'church_update_retention_days'
  | 'poll_retention_days'
  | 'alert_retention_days'
  | 'feedback_retention_days'

const FIELDS: Record<Kept | MaybeForever, { label: string; summary: string; help: string; affects: string[] }> = {
  team_chat_retention_days: {
    label: 'Team chat is kept for',
    summary: 'Older posts in every team’s room are deleted.',
    help: 'Every post older than this, in every team’s chat, is deleted each night — alerts and mentions included. “For ever” keeps the whole history.',
    affects: ['Team Chat'],
  },
  church_update_retention_days: {
    label: 'Church Updates are kept for',
    summary: 'Pinned updates are never cleared.',
    help: 'An update older than this is deleted each night, unless it is pinned — pinning is how the church says “keep this up”.',
    affects: ['Church Updates'],
  },
  poll_retention_days: {
    label: 'Polls are kept for',
    summary: 'Counted from when a poll closed.',
    help: 'A poll is deleted this long after it closed, with its votes. A poll with no closing date counts from when it was made.',
    affects: ['Polls'],
  },
  debrief_retention_days: {
    label: 'Debrief minutes are kept for',
    summary: 'Working notes, not an archive.',
    help: 'Minutes say what went wrong and often name whoever it went wrong for, which is fine for a fortnight and a file on somebody after a year. The clock runs from the service date, not from when they were typed, so every team’s minutes for one Sunday go together.',
    affects: ['Debriefs'],
  },
  issue_retention_days: {
    label: 'Resolved issues are kept for',
    summary: 'Long enough for everyone to see it was dealt with.',
    help: 'Once a Head marks an issue resolved, it stays this many days so everyone can see it was dealt with and by whom. Open, not resolved and persistent issues are never deleted on a clock. The same number is how far back the Issues page’s Finished list goes.',
    affects: ['Issues'],
  },
  notification_retention_days: {
    label: 'Bell notifications are kept for',
    summary: 'Read or not, older ones are cleared.',
    help: 'Every notification in everybody’s bell older than this is deleted each night, read or unread. The things they point at are not touched.',
    affects: ['Notifications'],
  },
  feedback_retention_days: {
    label: 'Settled feedback is kept for',
    summary: 'Done and Won’t do only — open feedback always stays.',
    help: 'Feedback an Admin has marked Done or Won’t do is deleted this long after it was settled, with its reply. Anything New or Looking into it is never cleared on a clock.',
    affects: ['Feedback'],
  },
  alert_retention_days: {
    label: 'The record of sent alerts is kept for',
    summary: 'The list under Send an alert of what went out.',
    help: 'Who sent which alert, to whom. Clearing it does not reach into anybody’s bell — that is the row above.',
    affects: ['Send an alert'],
  },
}

export function RetentionCard() {
  const { isAdmin } = useAuth()
  const room = useSettingsDraft(KEYS)
  const [open, setOpen] = useState<string | null>(null)
  if (!isAdmin) return null

  const { draft, set, differs } = room
  const toggle = (key: string) => setOpen((current) => (current === key ? null : key))

  const keptRow = (key: Kept) => {
    if (!draft) return null
    const f = FIELDS[key]
    const value = draft[key]
    const fallback = DEFAULT_SETTINGS[key]
    return (
      <SettingRow
        key={key}
        label={f.label}
        summary={f.summary}
        value={shortDuration(value, 'days')}
        changed={differs(key)}
        open={open === key}
        onToggle={() => toggle(key)}
        help={f.help}
        affects={f.affects}
        defaultText={shortDuration(fallback, 'days')}
        onDefault={value === fallback ? undefined : () => set(key, fallback)}
      >
        <NumberDial value={value} onChange={(n) => set(key, n)} min={1} max={120} majorEvery={7} unit="days" label={f.label} />
      </SettingRow>
    )
  }

  const foreverRow = (key: MaybeForever) => {
    if (!draft) return null
    const f = FIELDS[key]
    const value = draft[key]
    return (
      <SettingRow
        key={key}
        label={f.label}
        summary={f.summary}
        value={value === null ? 'For ever' : shortDuration(value, 'days')}
        changed={differs(key)}
        open={open === key}
        onToggle={() => toggle(key)}
        help={f.help}
        affects={f.affects}
        defaultText="for ever"
        onDefault={value === null ? undefined : () => set(key, null)}
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 text-body-sm text-on-surface">
            <span>Keep for ever</span>
            <Switch
              checked={value === null}
              onChange={(forever) => set(key, forever ? null : 90)}
              label={`Keep for ever: ${f.label}`}
            />
          </div>
          {value !== null && (
            <NumberDial value={value} onChange={(n) => set(key, n)} min={1} max={365} majorEvery={7} unit="days" label={f.label} />
          )}
        </div>
      </SettingRow>
    )
  }

  return (
    <QueryState isLoading={room.query.isLoading} error={room.query.error}>
      {draft && (
        <div className="flex flex-col gap-4">
          <p className="px-1 text-body-sm text-on-surface-variant">
            What the app clears away, and when. These delete — they do not hide — and a nightly job
            does it. Anything set to “For ever” is never cleared.
          </p>

          <SectionTile title="Talk" hint="The board, the chats, and what the church has said and asked.">
            <SettingList>
              <InlineRow
                label="The message board clears every"
                summary="Every post, and the activity feed with it."
                changed={differs('board_clear_dow')}
                help="At 00:00 UTC on this day, the message board empties — every post, plus the bell notifications pointing at them, so the bell never points at something that is gone — and the dashboard’s activity feed clears with it. The planner’s Finished list resets on the same clock, so nobody has to learn two different weeks."
                affects={['Message board', 'Activity', 'Service Planner']}
                defaultText={`${WEEKDAY_NAMES[DEFAULT_SETTINGS.board_clear_dow]}, two days after Sunday`}
              >
                <Select
                  value={String(draft.board_clear_dow)}
                  onChange={(dow) => set('board_clear_dow', Number(dow))}
                  aria-label="Day the board clears"
                  className={selectPillClasses}
                  options={WEEKDAY_NAMES.map((name, dow) => ({ value: String(dow), label: name }))}
                />
              </InlineRow>
              {foreverRow('team_chat_retention_days')}
              {foreverRow('church_update_retention_days')}
              {foreverRow('poll_retention_days')}
            </SettingList>
          </SectionTile>

          <SectionTile title="After the service" hint="What each Sunday leaves behind.">
            <SettingList>
              {keptRow('debrief_retention_days')}
              {keptRow('issue_retention_days')}
            </SettingList>
          </SectionTile>

          <SectionTile title="Notifications & alerts" hint="Everybody’s bell, and the record of what was sent.">
            <SettingList>
              {foreverRow('notification_retention_days')}
              {foreverRow('alert_retention_days')}
            </SettingList>
          </SectionTile>

          <SectionTile title="Feedback" hint="What the teams have told you about the app.">
            <SettingList>{foreverRow('feedback_retention_days')}</SettingList>
          </SectionTile>

          <SaveBar
            changed={room.changed}
            saving={room.saving}
            saved={room.saved}
            error={room.error}
            onSave={room.save}
            onRestore={room.restoreDefaults}
          />
        </div>
      )}
    </QueryState>
  )
}
