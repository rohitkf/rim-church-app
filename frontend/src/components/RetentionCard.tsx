import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { DEFAULT_SETTINGS, WEEKDAY_NAMES, type AppSettings } from '../lib/appSettings'
import { useSettingsDraft } from '../lib/useSettingsDraft'
import { UPLOAD_LIMITS } from '../lib/uploadLimits'
import { shortDuration } from '../lib/settingsReadout'
import { NumberDial } from './NumberDial'
import { QueryState } from './QueryState'
import { Select, selectPillClasses } from './Select'
import { SectionTile } from './Surface'
import { InlineRow, SaveBar, SettingList, SettingRow, Switch } from './SettingRows'

/**
 * How long the app keeps things, page by page, in one room.
 *
 * Every clock here deletes — it does not hide — and a job does it: the
 * nightly ones (0116, 0117, 0120, `apply_retention()` from 0123 and 0128),
 * an hourly one for Church Updates and polls, and a weekly one for
 * Supabase's own logs (0128). So each row says plainly what goes.
 *
 * The page that loses things says so too, in its own Lifespan line
 * (lib/lifespan.ts), worded from these same numbers.
 */

const KEYS = [
  'board_clear_dow',
  'service_retention_days',
  'debrief_retention_days',
  'issue_retention_days',
  'notification_keep_count',
  'notification_retention_days',
  'team_chat_retention_days',
  'church_update_retention_days',
  'poll_retention_days',
  'alert_clear_dow',
  'feedback_retention_days',
] as const satisfies readonly (keyof AppSettings)[]

type Kept =
  | 'service_retention_days'
  | 'debrief_retention_days'
  | 'issue_retention_days'
  | 'church_update_retention_days'
  | 'poll_retention_days'
type MaybeForever = 'notification_retention_days' | 'team_chat_retention_days' | 'feedback_retention_days'

const RANGE: Record<Kept, { min: number; max: number }> = {
  service_retention_days: { min: 7, max: 365 },
  debrief_retention_days: { min: 1, max: 365 },
  issue_retention_days: { min: 1, max: 365 },
  church_update_retention_days: { min: 1, max: 365 },
  poll_retention_days: { min: 1, max: 365 },
}

const FIELDS: Record<Kept | MaybeForever, { label: string; summary: string; help: string; affects: string[] }> = {
  team_chat_retention_days: {
    label: 'Team chat is kept for',
    summary: 'Each post goes this long after it was written.',
    help: 'Every post older than this, in every team’s chat, is deleted each night — alerts and mentions included. A chat never empties all at once: each post has its own clock.',
    affects: ['Team Chat'],
  },
  church_update_retention_days: {
    label: 'A new Church Update ends after',
    summary: 'What the end time starts at when an Admin posts.',
    help: 'Every update has an end time, set when it is posted — the form starts it this far ahead, and the Admin can change it. At its end time the update is gone for everybody, pinned or not.',
    affects: ['Church Updates'],
  },
  poll_retention_days: {
    label: 'A poll clears',
    summary: 'This long after its deadline, unless the asker picks a time.',
    help: 'Every poll has a clear time. The form starts it this long after the poll’s deadline — or after it was posted, if it has no deadline. At its clear time the poll is deleted with every answer.',
    affects: ['Polls'],
  },
  service_retention_days: {
    label: 'Services are kept for',
    summary: 'Then the service and everything about it is deleted.',
    help: 'Counted from the service date. When it is up, the service goes with its running order, rota, availability answers, checklist ticks, set list, team readiness, debrief, every issue (resolved or not) and any poll about it. Upcoming services are never touched.',
    affects: ['Service Planner', 'Team Rota', 'Availability', 'Checklists', 'Set Lists', 'Debriefs', 'Issues'],
  },
  debrief_retention_days: {
    label: 'Debrief minutes are kept for',
    summary: 'Never longer than the service itself.',
    help: 'Counted from the service date, so every team’s minutes for one Sunday go together. A service that is deleted takes its debrief with it, so a number longer than “Services are kept for” makes no difference.',
    affects: ['Debriefs'],
  },
  issue_retention_days: {
    label: 'Resolved issues are kept for',
    summary: 'Never longer than the service itself.',
    help: 'Once a Head marks an issue resolved, it stays this many days so everyone can see it was dealt with. Issues that are not resolved stay until an Admin deletes them or their service is deleted. The same number is how far back the Issues page’s Finished list goes.',
    affects: ['Issues'],
  },
  notification_retention_days: {
    label: 'Bell notifications are also cleared after',
    summary: 'On top of the per-person limit above.',
    help: 'Any notification older than this is deleted each night, read or unread, even if the person has fewer than their limit. “For ever” leaves it to the limit alone.',
    affects: ['Notifications'],
  },
  feedback_retention_days: {
    label: 'Settled feedback is kept for',
    summary: 'Done and Won’t do only — open feedback always stays.',
    help: 'Feedback the Owner has marked Done or Won’t do is deleted this long after it was settled, with its reply. Anything New or Looking into it is never cleared on a clock.',
    affects: ['Feedback'],
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
    const { min, max } = RANGE[key]
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
        <NumberDial value={value} onChange={(n) => set(key, n)} min={min} max={max} majorEvery={7} unit="days" label={f.label} />
      </SettingRow>
    )
  }

  const foreverRow = (key: MaybeForever) => {
    if (!draft) return null
    const f = FIELDS[key]
    const value = draft[key]
    const fallback = DEFAULT_SETTINGS[key]
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
        defaultText={fallback === null ? 'for ever' : shortDuration(fallback, 'days')}
        onDefault={value === fallback ? undefined : () => set(key, fallback)}
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 text-body-sm text-on-surface">
            <span>Keep for ever</span>
            <Switch
              checked={value === null}
              onChange={(forever) => set(key, forever ? null : (fallback ?? 90))}
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

  const weekdayOptions = WEEKDAY_NAMES.map((name, dow) => ({ value: String(dow), label: name }))

  return (
    <QueryState isLoading={room.query.isLoading} error={room.query.error}>
      {draft && (
        <div className="flex flex-col gap-4">
          <p className="px-1 text-body-sm text-on-surface-variant">
            What the app clears away, and when. These delete — they do not hide — and a job does
            it. Anything set to “For ever” is never cleared.
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
                  options={weekdayOptions}
                />
              </InlineRow>
              {foreverRow('team_chat_retention_days')}
              {keptRow('church_update_retention_days')}
              {keptRow('poll_retention_days')}
            </SettingList>
          </SectionTile>

          <SectionTile title="After the service" hint="What each Sunday leaves behind, and for how long.">
            <SettingList>
              {keptRow('service_retention_days')}
              {keptRow('debrief_retention_days')}
              {keptRow('issue_retention_days')}
            </SettingList>
          </SectionTile>

          <SectionTile title="Notifications & alerts" hint="Everybody’s bell, and the record of what was sent.">
            <SettingList>
              <SettingRow
                label="Each person’s bell keeps"
                summary="Their newest ones; older ones are deleted as new ones arrive."
                value={`${draft.notification_keep_count} newest`}
                changed={differs('notification_keep_count')}
                open={open === 'notification_keep_count'}
                onToggle={() => toggle('notification_keep_count')}
                help="When a notification arrives and somebody already has this many, their oldest is deleted — read or unread. The things they point at are not touched."
                affects={['Notifications']}
                defaultText={`${DEFAULT_SETTINGS.notification_keep_count} newest`}
                onDefault={
                  draft.notification_keep_count === DEFAULT_SETTINGS.notification_keep_count
                    ? undefined
                    : () => set('notification_keep_count', DEFAULT_SETTINGS.notification_keep_count)
                }
              >
                <NumberDial
                  value={draft.notification_keep_count}
                  onChange={(n) => set('notification_keep_count', n)}
                  min={5}
                  max={50}
                  majorEvery={5}
                  unit="notifications"
                  label="Each person’s bell keeps"
                />
              </SettingRow>
              {foreverRow('notification_retention_days')}
              <InlineRow
                label="The record of sent alerts clears every"
                summary="The list under Send an alert of what went out."
                changed={differs('alert_clear_dow')}
                help="At 00:00 UTC on this day, the list of alerts that were sent — who sent which, to whom — is deleted. It does not reach into anybody’s bell."
                affects={['Send an alert']}
                defaultText={WEEKDAY_NAMES[DEFAULT_SETTINGS.alert_clear_dow ?? 2]}
              >
                <Select
                  value={draft.alert_clear_dow === null ? 'never' : String(draft.alert_clear_dow)}
                  onChange={(dow) => set('alert_clear_dow', dow === 'never' ? null : Number(dow))}
                  aria-label="Day the sent-alerts record clears"
                  className={selectPillClasses}
                  options={[...weekdayOptions, { value: 'never', label: 'Never' }]}
                />
              </InlineRow>
            </SettingList>
          </SectionTile>

          <SectionTile title="Feedback" hint="What the teams have told you about the app.">
            <SettingList>{foreverRow('feedback_retention_days')}</SettingList>
          </SectionTile>

          <SectionTile title="Kept until somebody deletes them" hint="Not on a clock, on purpose.">
            <ul className="flex flex-col gap-2 text-body-sm text-on-surface-variant">
              {KEPT.map(([what, note]) => (
                <li key={what}>
                  <span className="font-medium text-on-surface">{what}</span> — {note}
                </li>
              ))}
            </ul>
          </SectionTile>

          <SectionTile title="Uploads and the app’s own logs" hint="Fixed, so storage stays in hand.">
            <ul className="flex flex-col gap-2 text-body-sm text-on-surface-variant">
              {UPLOAD_LIMITS.map(([what, limit]) => (
                <li key={what} className="flex items-baseline justify-between gap-3">
                  <span>{what}</span>
                  <span className="shrink-0 font-mono text-label-md text-on-surface">{limit}</span>
                </li>
              ))}
              <li className="mt-1 border-t border-border-subtle pt-3">
                Supabase’s own logs — the record of each phone notification sent and of each
                nightly job — keep one week, cleared every Tuesday.
              </li>
            </ul>
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

const KEPT: [string, string][] = [
  ['Inventory', 'items, their check-out history and purchase requests.'],
  ['Invitations and join requests', 'an Admin can remove accepted invitations and answered requests.'],
  ['Guests and events', 'removed from their own pages.'],
  ['Uploaded files', 'the logo, the Giving QR picture, handbooks and inventory documents stay until replaced or removed.'],
]

