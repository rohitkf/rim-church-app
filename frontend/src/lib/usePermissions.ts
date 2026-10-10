import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from './supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { useMyTeams } from './useMyTeams'
import { decide, overridesFrom, type CapabilityKey, type Holder, type Overrides, type Where } from './permissions'

export const PERMISSIONS_KEY = ['role-permissions'] as const

const rowSchema = z.object({ role_key: z.string(), capability: z.string(), reach: z.string() })

/** The cells the church changed. Everybody may read them; only set_permissions() writes. */
export async function fetchOverrides(): Promise<Overrides> {
  const { data, error } = await supabase.from('role_permissions').select('role_key, capability, reach')
  if (error) throw error
  return overridesFrom(z.array(rowSchema).parse(data ?? []))
}

/**
 * The church's permissions, and `can()` for the signed-in person.
 *
 * Until the changes have loaded, `can()` answers from the defaults — which
 * are what the database does too until somebody changes a cell, so a
 * button never flashes in that the database would refuse.
 *
 * An Admin previewing the app as somebody else gets that somebody's
 * answers: the preview narrows roles and teams, and this reads them.
 */
export function usePermissions() {
  const { session, isSuperAdmin, isAdmin, ledDepartmentIds } = useAuth()
  const { teamIds } = useMyTeams()
  const myId = session?.user.id ?? null

  const query = useQuery({
    queryKey: PERMISSIONS_KEY,
    queryFn: fetchOverrides,
    enabled: !!myId,
    staleTime: 60_000,
  })
  const overrides = useMemo(() => query.data ?? {}, [query.data])

  // Both lists are rebuilt every render; what they hold is what matters.
  const led = ledDepartmentIds.join('|')
  const member = teamIds.join('|')
  const holder: Holder = useMemo(
    () => ({
      myId,
      owner: isSuperAdmin,
      admin: isAdmin,
      ledTeams: led ? led.split('|') : [],
      memberTeams: member ? member.split('|') : [],
    }),
    [myId, isSuperAdmin, isAdmin, led, member],
  )

  const can = useCallback(
    (cap: CapabilityKey, where?: Where) => decide(overrides, holder, cap, where),
    [overrides, holder],
  )

  return { can, overrides, query, holder }
}
