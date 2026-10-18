import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from './QueryState'
import { type AppSettings } from '../lib/appSettings'
import { useSettingsDraft } from '../lib/useSettingsDraft'
import { settingEntry, type Patch } from '../lib/settingsCatalog'
import { SectionTile } from './Surface'
import { SaveBar, SettingList } from './SettingRows'
import { SettingEntries } from './SettingEntry'

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
 * rows themselves come from the catalog (lib/settingsCatalog), which is
 * also what Page by page draws each page's settings from.
 */
/** The keys this room owns, and saves — no other room's. */
const TIMINGS_KEYS = [
  'rota_window_days',
  'always_show_my_services',
  'lead_in_minutes',
  'run_out_minutes',
  'edit_grace_minutes',
  'after_service_checklist_opens_minutes',
  'after_service_checklist_minutes',
  'debrief_open_minutes_after',
  'issues_raise_scope',
  'issue_open_minutes_before',
  'issue_close_minutes_after',
  'availability_closes_time',
  'timezone',
] as const satisfies readonly (keyof AppSettings)[]

const GROUPS: { title: string; hint: string; ids: string[] }[] = [
  { title: 'Planning ahead', hint: 'What people can see coming.', ids: ['rota_window_days', 'always_show_my_services'] },
  { title: 'On the day', hint: 'When a service reads as “on now” on the rota.', ids: ['lead_in_minutes', 'run_out_minutes'] },
  {
    title: 'After the service',
    hint: 'How long things stay open once it ends.',
    ids: ['edit_grace_minutes', 'after_service_checklist_opens_minutes', 'after_service_checklist_minutes', 'debrief_open_minutes_after'],
  },
  { title: 'Issues', hint: 'Who can raise one, and when.', ids: ['issues_raise_scope', 'issue_open_minutes_before', 'issue_close_minutes_after'] },
  /*
   * When an answer is due, and on whose clock. These two belong together:
   * "23:59" is not a moment until somebody says where, and the database
   * enforces the same pair (0092) — so a church that moves its deadline
   * and a church that moves country change the same two fields.
   */
  { title: 'Availability', hint: 'The last moment somebody can say whether they can serve.', ids: ['availability_closes_time', 'timezone'] },
]

export function AppSettingsCard() {
  const { isAdmin } = useAuth()
  const room = useSettingsDraft(TIMINGS_KEYS)
  const [open, setOpen] = useState<string | null>(null)

  if (!isAdmin) return null

  const { draft } = room
  const stored = room.query.data ?? {}
  const toggle = (key: string) => setOpen((current) => (current === key ? null : key))
  const set = (patch: Patch) => {
    for (const [key, value] of Object.entries(patch)) room.set(key as (typeof TIMINGS_KEYS)[number], value as never)
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
