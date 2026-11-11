import { useMemo, useState } from 'react'
import type { AppSettings } from '../lib/appSettings'
import { columnsOf, settingsForRoom } from '../lib/settingsCatalog'
import { useSettingsDraft } from '../lib/useSettingsDraft'
import { QueryState } from './QueryState'
import { SettingEntries } from './SettingEntry'
import { SaveBar, SettingList } from './SettingRows'
import { Tile } from './Surface'

/**
 * A Settings room that is nothing but a few of the catalog's settings:
 * General (the church's time zone, the bell) and the Owner's Feedback.
 *
 * The rows are the catalog's own, drawn by the same component Page by Page
 * uses, and the room saves only the columns it holds — so it can neither
 * drift from the catalog nor undo a choice made in another room.
 */
export function SettingsRoomCard({ room, footnote }: { room: string; footnote?: string }) {
  const entries = useMemo(() => settingsForRoom(room), [room])
  const keys = useMemo(() => columnsOf(entries), [entries])
  const draft = useSettingsDraft(keys)
  const [open, setOpen] = useState<string | null>(null)

  return (
    <QueryState isLoading={draft.query.isLoading} error={draft.query.error}>
      {draft.draft && (
        <div className="flex flex-col gap-4">
          <Tile padded={false} className="px-5 py-3">
            <SettingList>
              <SettingEntries
                entries={entries}
                draft={draft.draft}
                stored={draft.query.data ?? {}}
                set={(patch) => {
                  for (const [key, value] of Object.entries(patch)) draft.set(key as keyof AppSettings, value as never)
                }}
                open={open}
                onToggle={(id) => setOpen((cur) => (cur === id ? null : id))}
              />
            </SettingList>
          </Tile>
          <SaveBar
            changed={draft.changed}
            saving={draft.saving}
            saved={draft.saved && !draft.changed}
            error={draft.error}
            onSave={draft.save}
          />
          {footnote && <p className="px-2 text-label-sm text-on-surface-faint">{footnote}</p>}
        </div>
      )}
    </QueryState>
  )
}
