import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAppSettings } from '../lib/appSettings'
import { changeEffects, namesOf, type GridState } from '../lib/changePreview'
import { fetchEveryonesFacts } from '../lib/peopleFacts'
import { fetchDepartments } from '../lib/queries'
import type { CapabilityKey, PermissionChange, PermissionGrant } from '../lib/permissions'

/**
 * Before Save, what saving would do: for each action a pending change
 * touches, who could then do more of it and who less, by name. It reads
 * everybody's standings once, only while something is pending.
 */
export function ChangeEffects({
  changes,
  before,
  after,
  grants,
  actionOf,
}: {
  changes: readonly PermissionChange[]
  before: GridState
  after: GridState
  grants: readonly PermissionGrant[]
  actionOf: (cap: CapabilityKey) => string
}) {
  const settings = useAppSettings()
  const pending = changes.length > 0
  const people = useQuery({ queryKey: ['everyone-access'], queryFn: fetchEveryonesFacts, enabled: pending, staleTime: 60_000 })
  const teams = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments, enabled: pending })
  const teamIds = useMemo(() => (teams.data ?? []).map((t) => t.id), [teams.data])
  const effects = useMemo(
    () => (people.data ? changeEffects(people.data, before, after, changes, teamIds, settings, grants) : []),
    [people.data, before, after, changes, teamIds, settings, grants],
  )

  if (!pending) return null
  if (people.isLoading || teams.isLoading) {
    return <p className="mt-3 text-label-md text-on-surface-faint">Working out who this changes…</p>
  }
  if (people.error) {
    return <p className="mt-3 text-label-md text-on-surface-faint">Could not work out who this changes.</p>
  }
  return (
    <div className="mt-3">
      <h3 className="text-body-sm font-medium text-on-surface">What saving would do</h3>
      <ul aria-label="What saving would do" className="mt-1 flex flex-col gap-1.5">
        {effects.map(({ capability, more, less }) => (
          <li key={capability} className="text-body-sm text-on-surface-variant">
            <span className="font-medium text-on-surface">{actionOf(capability)}</span>
            {more.length === 0 && less.length === 0 ? (
              <span> — nobody’s answer changes.</span>
            ) : (
              <>
                {more.length > 0 && (
                  <span className="block">
                    Lets {more.length === 1 ? 'one more person' : `${more.length} more people`} do it, or do it further:{' '}
                    {namesOf(more)}.
                  </span>
                )}
                {less.length > 0 && (
                  <span className="block">
                    Takes it from {less.length === 1 ? 'one person' : `${less.length} people`}, or narrows it: {namesOf(less)}.
                  </span>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
