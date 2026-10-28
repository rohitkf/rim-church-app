import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { fetchDepartments } from '../lib/queries'
import { useSettingsDraft } from '../lib/useSettingsDraft'
import { settingEntry, type Patch } from '../lib/settingsCatalog'
import { QueryState } from './QueryState'
import { SectionTile, SegmentedControl } from './Surface'
import { SaveBar, SettingList } from './SettingRows'
import { SettingEntries } from './SettingEntry'
import { AudienceEditor } from './AudienceEditor'
import { useGrantList } from '../lib/useGrantList'

/**
 * Settings › Clock in (0191).
 *
 * When clock-in opens and how strict it is; who besides the rota clocks
 * in; who besides Admins and Overwatch sees the Clock In page; and who
 * approves a request when a phone cannot be placed at church. Where the
 * church is lives on the Clock In page itself, where it can be checked
 * against the people arriving. How long it is all kept is in Page by
 * Page, with everything else that is deleted on a clock.
 *
 * Who else sees the page is the grid's `clockin.view` since 0209: the
 * teams and people listed here are its grants, saved with the rest of
 * the room, and By person shows them like any other.
 */
const KEYS = [
  'clock_in_lead_minutes',
  'clock_in_radius_m',
  'clock_in_accuracy_m',
  'clock_in_include_yes',
] as const

export function ClockInCard() {
  const { isAdmin } = useAuth()
  const room = useSettingsDraft(KEYS)
  const viewers = useGrantList('clockin.view')
  const approvers = useGrantList('clockin.approve', { withLeads: true })
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
              teams={viewers.working.teams}
              people={viewers.working.people}
              allTeams={allTeams}
              withPeople
              editable
              empty="Nobody else yet."
              onChange={viewers.set}
            />
            <p className="mt-2 px-1 text-label-sm text-on-surface-faint">
              A team means everybody on it, its Head and its Assisting Heads. They see every clock-in: names,
              times and where each person was. To give it to every Team Head or Team Member at once, set
              “See clock-ins” in Access &amp; Privileges.
            </p>
          </SectionTile>

          <SectionTile
            title="Who approves a request"
            hint="When a phone cannot be placed at church, its owner can ask to be clocked in."
          >
            <AudienceEditor
              label="Teams that approve requests"
              teams={approvers.working.teams}
              allTeams={allTeams}
              withPeople={false}
              editable
              empty="Only the Owner and Admins approve."
              onChange={(next) => approvers.set({ teams: next.teams, people: approvers.working.people })}
            />
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 px-1">
              <span className="text-body-sm text-on-surface">In an approving team, who approves</span>
              <SegmentedControl
                label="In an approving team, who approves"
                value={approvers.leadsOnly ? 'leads' : 'members'}
                onChange={(next) => approvers.setLeadsOnly(next === 'leads')}
                options={[
                  { value: 'leads', label: 'Heads' },
                  { value: 'members', label: 'Anyone on it' },
                ]}
              />
            </div>
            <p className="mt-2 px-1 text-label-sm text-on-surface-faint">
              The Owner and Admins can always approve. Heads means a team’s Head and Assisting Heads; anyone on it
              is a Welcome team at the door, say. To give it to every Team Head at once, set “Approve clock-in
              requests” in Access &amp; Privileges.
            </p>
          </SectionTile>

          <SaveBar
            changed={room.changed || viewers.changed || approvers.changed}
            saving={room.saving || viewers.saving || approvers.saving}
            saved={room.saved && !viewers.changed && !approvers.changed}
            error={room.error ?? viewers.error ?? approvers.error}
            onSave={() => {
              // The grants first: a refused grant leaves the settings unsaved too.
              void (async () => {
                try {
                  if (viewers.changed) await viewers.save()
                  if (approvers.changed) await approvers.save()
                } catch {
                  return
                }
                if (room.changed) room.save()
              })()
            }}
            label="Save"
          />
        </div>
      )}
    </QueryState>
  )
}
