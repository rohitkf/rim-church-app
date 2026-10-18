import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { DASHBOARD_PANELS } from '../lib/display'
import { useSettingsDraft } from '../lib/useSettingsDraft'
import { settingEntry, type Patch } from '../lib/settingsCatalog'
import { QueryState } from './QueryState'
import { SectionTile } from './Surface'
import { SaveBar, SettingList } from './SettingRows'
import { SettingEntries } from './SettingEntry'

/**
 * What the pages show, and how they arrive — for everybody at once.
 *
 * None of this is a rule: it decides what is drawn, not what anybody may
 * read (that is Access & privileges). Stored as one object
 * (`app_settings.display`, lib/display), so a preference added later costs
 * no migration. The rows are the catalog's (lib/settingsCatalog).
 */

const WINDOWS = [
  'display.windows.availabilityDays',
  'display.windows.setListDays',
  'display.windows.debriefAheadDays',
  'display.windows.diaryPastDays',
  'display.windows.invitationStaleDays',
]

export function DisplayCard() {
  const { isAdmin } = useAuth()
  const room = useSettingsDraft(['display'] as const)
  const [open, setOpen] = useState<string | null>(null)
  if (!isAdmin) return null

  const draft = room.draft
  const stored = room.query.data ?? {}
  const toggle = (key: string) => setOpen((current) => (current === key ? null : key))
  const set = (patch: Patch) => {
    if ('display' in patch) room.set('display', patch.display)
  }
  const rows = (ids: string[]) =>
    draft && (
      <SettingEntries entries={ids.map(settingEntry)} draft={draft} stored={stored} set={set} open={open} onToggle={toggle} />
    )

  return (
    <QueryState isLoading={room.query.isLoading} error={room.query.error}>
      {draft && (
        <div className="flex flex-col gap-4">
          <p className="px-1 text-body-sm text-on-surface-variant">
            What each page shows, for everybody. This only changes what is drawn — who may open a
            page is in Access &amp; privileges.
          </p>

          <SectionTile title="Dashboard" hint="The first page everybody sees.">
            <SettingList>{rows(['display.dashboard.serviceDays', 'display.dashboard.openNext'])}</SettingList>

            <h3 className="mt-5 px-1 text-body-sm font-medium text-on-surface">On a service’s card</h3>
            <ul className="mt-2 flex flex-col">{rows(DASHBOARD_PANELS.map((p) => `display.dashboard.show.${p.key}`))}</ul>
          </SectionTile>

          <SectionTile title="Folded sections" hint="Every page that lists services: Today, Next, Upcoming, Finished.">
            <SettingList>{rows(['display.lists.upcomingOpen', 'display.lists.finishedOpen'])}</SettingList>
          </SectionTile>

          <SectionTile title="How far pages look" hint="Windows of days, page by page.">
            <SettingList>{rows(WINDOWS)}</SettingList>
          </SectionTile>

          <SaveBar
            changed={room.changed}
            saving={room.saving}
            saved={room.saved}
            error={room.error}
            onSave={room.save}
            onRestore={() => room.set('display', {})}
          />
        </div>
      )}
    </QueryState>
  )
}
