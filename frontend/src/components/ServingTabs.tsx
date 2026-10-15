import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { todayIso } from '../lib/monthGrid'
import { nearestServiceDate } from '../lib/nearestService'
import { fetchServices } from '../lib/queries'
import { servingStep, SERVING_TABS } from '../lib/serving'
import { supabase } from '../lib/supabaseClient'
import { useMyTeams } from '../lib/useMyTeams'
import { useAppSettings } from '../lib/appSettings'
import { useFinishedServices } from '../lib/useFinishedServices'
import { usePageAccess } from '../lib/usePageAccess'

/**
 * The three steps of serving, as tabs across the top of each.
 *
 * Numbered, because the order is the point: the rota is built from the
 * answers, and a checklist exists only for somebody the rota put on. Only
 * the steps this person may open are offered; with one left there is
 * nothing to switch between, so no strip is drawn at all.
 */
export function ServingTabs() {
  const { canOpen } = usePageAccess()
  const tabs = SERVING_TABS.filter((tab) => canOpen(tab.to))
  if (tabs.length < 2) return null

  return (
    <nav aria-label="Serving" className="mb-6">
      {/* All three fit a 360px phone side by side: tight padding there,
          roomier from sm up. */}
      <ol className="flex w-full gap-0.5 rounded-full bg-inset p-1 hairline sm:inline-flex sm:w-auto sm:gap-1">
        {tabs.map((tab, index) => (
          <li key={tab.to} className="min-w-0 flex-1 sm:flex-none">
            <NavLink
              to={tab.to}
              title={tab.hint}
              className={({ isActive }) =>
                `tap flex items-center justify-center gap-1.5 rounded-full px-2 py-2 text-label-md sm:gap-2 sm:px-4 transition-colors duration-300 ease-[var(--ease-glide)] ${
                  isActive ? 'bg-primary font-medium text-on-primary' : 'text-on-surface-variant hover:text-on-surface'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    aria-hidden="true"
                    // On the narrowest phones the words matter more than
                    // the numbers; the order still reads left to right.
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-label-sm max-[379px]:hidden ${
                      isActive ? 'bg-on-primary/20' : 'bg-raised-strong'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="truncate whitespace-nowrap">{tab.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ol>
    </nav>
  )
}

/** The tabs above whichever of the three pages is open. */
export function ServingLayout() {
  return (
    <>
      <ServingTabs />
      <Outlet />
    </>
  )
}

/** My answers and my rota places for these services. */
async function fetchMyStep(myId: string, serviceIds: string[]) {
  if (serviceIds.length === 0) return { answered: [], onRota: [] }
  const [answers, places] = await Promise.all([
    supabase.from('availability').select('service_id, department_id').eq('user_id', myId).in('service_id', serviceIds),
    supabase.from('rota_assignments').select('service_id').eq('user_id', myId).in('service_id', serviceIds),
  ])
  if (answers.error) throw answers.error
  if (places.error) throw places.error
  return {
    answered: (answers.data ?? []) as { service_id: string; department_id: string }[],
    onRota: ((places.data ?? []) as { service_id: string }[]).map((p) => p.service_id),
  }
}

/**
 * The menu's Serving entry: the step that is waiting for this person
 * (lib/serving's servingStep) — answer, then see the rota, then the list
 * for the day.
 */
export function ServingStart() {
  const { canOpen, settled } = usePageAccess()
  const { session, ledDepartmentIds } = useAuth()
  const myId = session?.user.id
  const { teamIds, settled: teamsSettled } = useMyTeams()
  const today = todayIso()

  const settings = useAppSettings()
  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: fetchServices })
  const ahead = useMemo(
    () => (servicesQuery.data ?? []).filter((s) => s.date >= today),
    [servicesQuery.data, today],
  )
  const aheadIds = useMemo(() => ahead.map((s) => s.id), [ahead])
  const { isFinished, afterServiceOpenUntil, isLoading: endsLoading } = useFinishedServices(aheadIds)
  // A service is still in front of you until it is over and its packing-up
  // list has closed: straight after the English service, somebody on its
  // rota is sent to that list, not on to next week's question.
  const stillOn = ahead.filter(
    (s) =>
      !isFinished(s.id) ||
      afterServiceOpenUntil(s.id, settings.after_service_checklist_minutes) !== null,
  )
  const nextDay = nearestServiceDate(
    stillOn.map((s) => s.date),
    today,
  )
  const nextDayServiceIds = stillOn.filter((s) => s.date === nextDay).map((s) => s.id)

  const stepQuery = useQuery({
    queryKey: ['serving-step', myId, nextDayServiceIds],
    queryFn: () => fetchMyStep(myId!, nextDayServiceIds),
    enabled: !!myId && servicesQuery.isSuccess && !endsLoading,
    // Answered a minute ago and come straight back: decide on the answer
    // as it is now, not on the one remembered from the last visit.
    refetchOnMount: 'always',
  })

  const failed = servicesQuery.isError || stepQuery.isError
  const stepKnown = !myId || (stepQuery.isSuccess && !stepQuery.isFetching)
  const waiting = !failed && (!servicesQuery.isSuccess || endsLoading || !stepKnown)
  if (!settled || !teamsSettled || waiting) {
    return <p className="text-body-sm text-on-surface-variant">Loading…</p>
  }

  const to = servingStep({
    canOpen,
    // Without the services or the answers there is no telling what is
    // waiting, so it opens where serving starts rather than not at all.
    nextDayServiceIds: failed ? [] : nextDayServiceIds,
    myTeamIds: [...new Set([...teamIds, ...(ledDepartmentIds ?? []).filter((id): id is string => !!id)])],
    answered: stepQuery.data?.answered ?? [],
    onRota: stepQuery.data?.onRota ?? [],
  })
  return <Navigate to={failed ? (SERVING_TABS.find((t) => canOpen(t.to))?.to ?? '/') : to} replace />
}
