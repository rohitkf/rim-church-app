import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { fetchDepartments } from './queries'

/**
 * Whether the signed-in user may give the final checklist sign-off for a
 * service.
 *
 * Service Flow Coordinator is a team, not a per-service role grant: the
 * sign-off belongs to whoever that team's rota puts on the service, or to
 * the team's head, who deputises for them. This mirrors the SQL function
 * is_service_flow_signer(), which is what actually enforces it.
 */
export function useServiceFlowSigner(serviceId: string | null | undefined): boolean {
  const { session, isAdmin, isDepartmentHead } = useAuth()
  const myId = session?.user.id

  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  const signOffDeptId = (departmentsQuery.data ?? []).find((d) => d.is_service_flow)?.id ?? null

  const leadsSignOffTeam = !!signOffDeptId && isDepartmentHead(signOffDeptId)

  const assignmentQuery = useQuery({
    queryKey: ['service-flow-assignment', serviceId, signOffDeptId, myId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rota_assignments')
        .select('id')
        .eq('service_id', serviceId!)
        .eq('department_id', signOffDeptId!)
        .eq('user_id', myId!)
        .limit(1)
      if (error) throw error
      return (data ?? []).length > 0
    },
    // No point asking when the answer is already yes, or nothing to ask about.
    enabled: !!serviceId && !!signOffDeptId && !!myId && !isAdmin && !leadsSignOffTeam,
  })

  return isAdmin || leadsSignOffTeam || assignmentQuery.data === true
}
