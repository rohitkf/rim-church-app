import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePermissions } from '../lib/usePermissions'
import { fetchDepartments } from '../lib/queries'
import { useGrantList } from '../lib/useGrantList'
import { GrantEffects } from './GrantEffects'
import { SectionTile } from './Surface'
import { SaveBar } from './SettingRows'
import { AudienceEditor } from './AudienceEditor'

/**
 * Settings › Prayer (0197).
 *
 * Who reads the private prayer requests besides the Pastors and the Owner,
 * who always do; and who besides them asks members to pray on their
 * behalf, and runs the prayer lists (0198). How long closed requests and
 * testimonies are kept is in Page by Page, with everything else deleted
 * on a clock.
 *
 * Since 0210 each list is a capability in the grid — prayer.pastoral,
 * prayer.assign, prayer.lists — and the teams and people here are its
 * grants, so the grid can also give one to every Team Head at once and By
 * person shows them like any other.
 */
export function PrayerSettingsCard() {
  // The room's own row (0277), Admins out of the box — or whoever may change the grid.
  const { can } = usePermissions()
  const mayChange = can('settings.prayer') || can('app.permissions')
  const carers = useGrantList('prayer.pastoral')
  const assigners = useGrantList('prayer.assign')
  const runners = useGrantList('prayer.lists')
  const grantChanges = useMemo(
    () => [...carers.changes, ...assigners.changes, ...runners.changes],
    [carers.changes, assigners.changes, runners.changes],
  )
  const teamsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  if (!mayChange) return null
  const allTeams = (teamsQuery.data ?? []).map((d) => ({ id: d.id, name: d.name }))
  const lists = [carers, assigners, runners]
  const changed = lists.some((l) => l.changed)

  return (
    <div className="flex flex-col gap-4">
      <p className="px-1 text-body-sm text-on-surface-variant">
        Anybody can ask the whole church to pray, with or without their name, or ask only the pastors. Make
        somebody a Pastor on the Volunteers page.
      </p>
      <SectionTile
        title="Who reads private requests"
        hint="The Pastors do out of the box, and the Owner always. Admins do not, unless they are named here. Each role’s own answer is in Access & Privileges."
      >
        <AudienceEditor
          label="Who else reads private requests"
          teams={carers.working.teams}
          people={carers.working.people}
          allTeams={allTeams}
          withPeople
          editable
          empty="Nobody else: the Pastors, out of the box, and the Owner."
          onChange={carers.set}
        />
        <p className="mt-2 px-1 text-label-sm text-on-surface-faint">
          They also see who wrote an anonymous request, and can take any request down. A team means everybody on
          it, its Head and its Assisting Heads.
        </p>
      </SectionTile>
      <SectionTile
        title="Who asks people to pray"
        hint="The pastors can, out of the box. On any request they can see, they ask members to pray on their behalf."
      >
        <AudienceEditor
          label="Who else asks people to pray"
          teams={assigners.working.teams}
          people={assigners.working.people}
          allTeams={allTeams}
          withPeople
          editable
          empty="Only the pastors."
          onChange={assigners.set}
        />
      </SectionTile>
      <SectionTile
        title="Who runs prayer lists"
        hint="The pastors can, out of the box. A list is a set of requests seen by the people and teams on it, for chain prayer."
      >
        <AudienceEditor
          label="Who else runs prayer lists"
          teams={runners.working.teams}
          people={runners.working.people}
          allTeams={allTeams}
          withPeople
          editable
          empty="Only the pastors."
          onChange={runners.set}
        />
      </SectionTile>
      <p className="px-1 text-label-sm text-on-surface-faint">
        To give one of these to every Team Head or Team Member at once, set it under Prayer in Access &amp;
        Privileges.
      </p>
      <GrantEffects changes={grantChanges} />
      <SaveBar
        changed={changed}
        saving={lists.some((l) => l.saving)}
        saved={!changed && lists.some((l) => l.saved)}
        error={lists.map((l) => l.error).find((e) => !!e) ?? null}
        onSave={() => {
          void (async () => {
            for (const list of lists) if (list.changed) await list.save().catch(() => {})
          })()
        }}
        label="Save"
      />
    </div>
  )
}
