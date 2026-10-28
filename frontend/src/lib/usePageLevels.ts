import { useMemo } from 'react'
import type { PageAccess } from './pageAccess'
import { levelsFrom } from './pageCells'
import { usePermissions } from './usePermissions'

/**
 * Every page's level, as the grid says it (0215) — the page cells in
 * `role_permissions`, read with the rest of the grid. Until they load it
 * is each page's default, as the database's is until somebody changes one.
 */
export function usePageLevels(): PageAccess {
  const { overrides } = usePermissions()
  return useMemo(() => levelsFrom(overrides), [overrides])
}
