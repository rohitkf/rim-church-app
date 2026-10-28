import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { fetchDepartments } from '../lib/queries'
import { useSettingsDraft } from '../lib/useSettingsDraft'
import { QueryState } from './QueryState'
import { SectionTile } from './Surface'
import { SaveBar } from './SettingRows'
import { AudienceEditor } from './AudienceEditor'

/**
 * Settings › Prayer (0197).
 *
 * Who reads the private prayer requests besides the Pastors and the Owner,
 * who always do; and who besides them asks members to pray on their
 * behalf, and runs the prayer lists (0198). How long closed requests and testimonies are kept is in
 * Page by Page, with everything else deleted on a clock.
 */
const KEYS = ['prayer_carers', 'prayer_assigners', 'prayer_list_runners'] as const

export function PrayerSettingsCard() {
  const { isAdmin } = useAuth()
  const room = useSettingsDraft(KEYS)
  const teamsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  if (!isAdmin) return null
  const draft = room.draft
  const allTeams = (teamsQuery.data ?? []).map((d) => ({ id: d.id, name: d.name }))

  return (
    <QueryState isLoading={room.query.isLoading} error={room.query.error}>
      {draft && (
        <div className="flex flex-col gap-4">
          <p className="px-1 text-body-sm text-on-surface-variant">
            Anybody can ask the whole church to pray, with or without their name, or ask only the pastors. Make
            somebody a Pastor on the Volunteers page.
          </p>
          <SectionTile
            title="Who reads private requests"
            hint="The Pastors and the Owner always do. Admins do not, unless they are named here."
          >
            <AudienceEditor
              label="Who else reads private requests"
              teams={draft.prayer_carers.teams}
              people={draft.prayer_carers.people}
              allTeams={allTeams}
              withPeople
              editable
              empty="Only the Pastors and the Owner."
              onChange={(next) => room.set('prayer_carers', next)}
            />
            <p className="mt-2 px-1 text-label-sm text-on-surface-faint">
              They also see who wrote an anonymous request, and can take any request down. A team means everybody
              on it and its Heads.
            </p>
          </SectionTile>
          <SectionTile
            title="Who asks people to pray"
            hint="The pastors always can. On any request they can see, they ask members to pray on their behalf."
          >
            <AudienceEditor
              label="Who else asks people to pray"
              teams={draft.prayer_assigners.teams}
              people={draft.prayer_assigners.people}
              allTeams={allTeams}
              withPeople
              editable
              empty="Only the pastors."
              onChange={(next) => room.set('prayer_assigners', next)}
            />
          </SectionTile>
          <SectionTile
            title="Who runs prayer lists"
            hint="The pastors always can. A list is a set of requests seen by the people and teams on it, for chain prayer."
          >
            <AudienceEditor
              label="Who else runs prayer lists"
              teams={draft.prayer_list_runners.teams}
              people={draft.prayer_list_runners.people}
              allTeams={allTeams}
              withPeople
              editable
              empty="Only the pastors."
              onChange={(next) => room.set('prayer_list_runners', next)}
            />
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
