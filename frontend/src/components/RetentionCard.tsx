import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { type AppSettings } from '../lib/appSettings'
import { useSettingsDraft } from '../lib/useSettingsDraft'
import { settingEntry, type Patch } from '../lib/settingsCatalog'
import { UPLOAD_LIMITS } from '../lib/uploadLimits'
import { QueryState } from './QueryState'
import { SectionTile } from './Surface'
import { SaveBar, SettingList } from './SettingRows'
import { SettingEntries } from './SettingEntry'

/**
 * How long the app keeps things, page by page, in one room.
 *
 * Every clock here deletes — it does not hide — and a job does it: the
 * nightly ones (0116, 0117, 0120, `apply_retention()` from 0123 and 0131),
 * an hourly one for Church Updates and polls, and a weekly one for
 * Supabase’s own logs (0132). So each row says plainly what goes.
 *
 * The page that loses things says so too, in its own Lifespan line
 * (lib/lifespan.ts), worded from these same numbers. The rows are the
 * catalog's (lib/settingsCatalog).
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
  'clock_in_retention_days',
] as const satisfies readonly (keyof AppSettings)[]

const GROUPS: { title: string; hint: string; ids: string[] }[] = [
  {
    title: 'Talk',
    hint: 'The board, the chats, and what the church has said and asked.',
    ids: ['board_clear_dow', 'team_chat_retention_days', 'church_update_retention_days', 'poll_retention_days'],
  },
  {
    title: 'After the service',
    hint: 'What each Sunday leaves behind, and for how long.',
    ids: ['service_retention_days', 'debrief_retention_days', 'issue_retention_days'],
  },
  {
    title: 'Notifications & alerts',
    hint: 'Everybody’s bell, and the record of what was sent.',
    ids: ['notification_keep_count', 'notification_retention_days', 'alert_clear_dow'],
  },
  { title: 'Feedback', hint: 'What the teams have told you about the app.', ids: ['feedback_retention_days'] },
  { title: 'Clock in', hint: 'Who arrived when, and where they were.', ids: ['clock_in_retention_days'] },
]

export function RetentionCard() {
  const { isAdmin } = useAuth()
  const room = useSettingsDraft(KEYS)
  const [open, setOpen] = useState<string | null>(null)
  if (!isAdmin) return null

  const { draft } = room
  const stored = room.query.data ?? {}
  const toggle = (key: string) => setOpen((current) => (current === key ? null : key))
  const set = (patch: Patch) => {
    for (const [key, value] of Object.entries(patch)) room.set(key as (typeof KEYS)[number], value as never)
  }

  return (
    <QueryState isLoading={room.query.isLoading} error={room.query.error}>
      {draft && (
        <div className="flex flex-col gap-4">
          <p className="px-1 text-body-sm text-on-surface-variant">
            What the app clears away, and when. These delete — they do not hide — and a job does
            it. Anything set to “For ever” is never cleared.
          </p>

          {GROUPS.map((group) => (
            <SectionTile key={group.title} title={group.title} hint={group.hint}>
              <SettingList>
                <SettingEntries
                  entries={group.ids.map(settingEntry)}
                  draft={draft}
                  stored={stored}
                  set={set}
                  open={open}
                  onToggle={toggle}
                />
              </SettingList>
            </SectionTile>
          ))}

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
