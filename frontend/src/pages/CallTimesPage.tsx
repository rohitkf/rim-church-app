import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { PageHeader } from '../components/Surface'
import { QueryState } from '../components/QueryState'
import { CallTimesPanel } from '../components/CallTimesPanel'
import { fetchDepartments, fetchOwnDepartmentIds, fetchServices } from '../lib/queries'
import { todayIso } from '../lib/monthGrid'
import { LOOKAHEAD_DAYS, servicesAhead, servicesToShow, shiftIsoDays } from '../lib/rotaWindow'
import { serviceDays } from '../lib/callTimes'
import { useFinishedServices } from '../lib/useFinishedServices'
import { useAppSettings } from '../lib/appSettings'
import { usePermissions } from '../lib/usePermissions'

/**
 * When each team is due at the building — Serving's third step, after the
 * rota says who is on and before the checklist says what to do.
 *
 * It sat at the top of Team Rota, which made the rota page answer two
 * questions and the second one first. On a page of its own it is the
 * answer to "what time do I need to be there", reached from the same
 * strip as the rest of the Sunday.
 *
 * The same window as the rota: the days with services still to come, out
 * to the church's rota window. A finished service is a record, and nothing
 * on it is worth setting.
 */
export function CallTimesPage() {
  const { session } = useAuth()
  const myId = session?.user.id
  const settings = useAppSettings()
  const { can } = usePermissions()
  const today = todayIso()

  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: fetchServices })
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  const ownDeptsQuery = useQuery({
    queryKey: ['own-departments', myId],
    queryFn: () => fetchOwnDepartmentIds(myId!),
    enabled: !!myId,
  })

  const candidates = useMemo(() => {
    const horizon = shiftIsoDays(today, LOOKAHEAD_DAYS)
    return servicesAhead(servicesQuery.data ?? [], today).filter((s) => s.date <= horizon)
  }, [servicesQuery.data, today])
  const { isFinished } = useFinishedServices(useMemo(() => candidates.map((s) => s.id), [candidates]))
  const days = useMemo(
    () =>
      serviceDays(
        servicesToShow(candidates, today, { days: settings.rota_window_days, mine: new Set<string>(), isFinished }).filter(
          (s) => !isFinished(s.id),
        ),
      ),
    [candidates, today, settings.rota_window_days, isFinished],
  )

  // The teams you serve on earn the big clock and the countdown; a head who
  // does not serve on their own team gets the times without one.
  const myTeamIds = useMemo(() => new Set(ownDeptsQuery.data ?? []), [ownDeptsQuery.data])

  return (
    <div>
      <PageHeader eyebrow="When to be there" title="Call Times" description="When each team is due at the building." />
      <QueryState
        isLoading={servicesQuery.isLoading || departmentsQuery.isLoading}
        error={servicesQuery.error ?? departmentsQuery.error}
        isEmpty={days.length === 0}
        emptyMessage="No services coming up, so nobody is being called in yet."
      >
        <CallTimesPanel
          days={days}
          teams={departmentsQuery.data ?? []}
          myTeamIds={myTeamIds}
          canManage={(departmentId) => can('svc.call_times', { departmentId })}
        />
      </QueryState>
    </div>
  )
}
