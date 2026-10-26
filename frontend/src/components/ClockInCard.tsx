import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { fetchDepartments } from '../lib/queries'
import { useSettingsDraft } from '../lib/useSettingsDraft'
import { settingEntry, type Patch } from '../lib/settingsCatalog'
import { QueryState } from './QueryState'
import { SectionTile } from './Surface'
import { SaveBar, SettingList } from './SettingRows'
import { SettingEntries } from './SettingEntry'
import { AudienceEditor } from './AudienceEditor'

/**
 * Settings › Clock in (0191).
 *
 * When clock-in opens and how strict it is; who besides the rota clocks
 * in; who besides Admins and Overwatch sees the Clock In page; and who
 * approves a request when a phone cannot be placed at church. Where the
 * church is lives on the Clock In page itself, where it can be checked
 * against the people arriving. How long it is all kept is in Data &
 * Retention, with everything else that is deleted on a clock.
 */
const KEYS = [
  'clock_in_lead_minutes',
  'clock_in_radius_m',
  'clock_in_accuracy_m',
  'clock_in_include_yes',
  'clock_in_viewers',
  'clock_in_approver_teams',
  'clock_in_approvers',
] as const

export function ClockInCard() {
  const { isAdmin } = useAuth()
  const room = useSettingsDraft(KEYS)
  const teamsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  if (!isAdmin) return null

  const draft = room.draft
  const stored = room.query.data ?? {}
  const set = (patch: Patch) => {
    for (const [key, value] of Object.entries(patch)) room.set(key as (typeof KEYS)[number], value as never)
  }
  const rows = (ids: string[]) =>
    draft && (
      <SettingEntries entries={ids.map(settingEntry)} draft={draft} stored={stored} set={set} open={null} onToggle={() => {}} />
    )
  const allTeams = (teamsQuery.data ?? []).map((d) => ({ id: d.id, name: d.name }))

  return (
    <QueryState isLoading={room.query.isLoading} error={room.query.error}>
      {draft && (
        <div className="flex flex-col gap-4">
          <p className="px-1 text-body-sm text-on-surface-variant">
            Whoever is on the day’s rota presses CLOCK IN on their Dashboard when they arrive. Their phone is read
            once, there and then, and they are marked Present if it is at church. Set where the church is on the
            Clock In page.
          </p>

          <SectionTile title="When, and how strict" hint="One opening time for the button and the reminder.">
            <SettingList>
              {rows(['clock_in_lead_minutes', 'clock_in_radius_m', 'clock_in_accuracy_m', 'clock_in_include_yes'])}
            </SettingList>
          </SectionTile>

          <SectionTile
            title="Who sees the Clock In page"
            hint="Admins, the Owner and Overwatch always do (Overwatch unless Settings › Overwatch closes it)."
          >
            <AudienceEditor
              label="Who else sees Clock In"
              teams={draft.clock_in_viewers.teams}
              people={draft.clock_in_viewers.people}
              allTeams={allTeams}
              withPeople
              editable
              empty="Nobody else yet."
              onChange={(next) => room.set('clock_in_viewers', next)}
            />
            <p className="mt-2 px-1 text-label-sm text-on-surface-faint">
              A team means everybody on it and its Heads. They see every clock-in: names, times and where each
              person was.
            </p>
          </SectionTile>

          <SectionTile
            title="Who approves a request"
            hint="When a phone cannot be placed at church, its owner can ask to be clocked in."
          >
            <AudienceEditor
              label="Teams that approve requests"
              teams={draft.clock_in_approver_teams}
              allTeams={allTeams}
              withPeople={false}
              editable
              empty="Only the Owner and Admins approve."
              onChange={(next) => room.set('clock_in_approver_teams', next.teams)}
            />
            <div className="mt-3">
              <SettingList>{rows(['clock_in_approvers'])}</SettingList>
            </div>
          </SectionTile>

          <SaveBar
            changed={room.changed}
            saving={room.saving}
            saved={room.saved}
            error={room.error}
            onSave={room.save}
            label="Save"
          />
        </div>
      )}
    </QueryState>
  )
}
