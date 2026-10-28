import { useMemo } from 'react'
import { applyGrantChanges, touchedBy, type GrantChange } from '../lib/grantPreview'
import { usePermissions } from '../lib/usePermissions'
import { ChangeEffects } from './ChangeEffects'

/**
 * What giving, or taking back, would do: the same "What saving would do"
 * the grid shows, for a grant not yet sent — in By person, By team and
 * the rooms that keep lists of teams and people (0208).
 */
export function GrantEffects({ changes }: { changes: readonly GrantChange[] }) {
  const { overrides, teams, grants = [] } = usePermissions()
  const before = useMemo(() => ({ church: overrides, teams, grants }), [overrides, teams, grants])
  const after = useMemo(
    () => ({ church: overrides, teams, grants: applyGrantChanges(grants, changes) }),
    [overrides, teams, grants, changes],
  )
  const touched = useMemo(() => touchedBy(changes), [changes])
  return <ChangeEffects touched={touched} before={before} after={after} />
}
