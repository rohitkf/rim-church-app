import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useDisplay } from '../lib/appSettings'
import { callTimeRowSchema, type CallTimeRow } from '../lib/callTimes'
import { addDays } from '../lib/dateRange'
import { todayIso } from '../lib/monthGrid'
import { myCallTime, relativeDay } from '../lib/myCallTimes'
import { fetchDepartments, fetchServices } from '../lib/queries'
import { supabase } from '../lib/supabaseClient'
import { useNow } from '../lib/useNow'
import { useOwnMemberships } from '../lib/useOwnMemberships'
import { usePageAccess } from '../lib/usePageAccess'
import { ServiceCountdown } from './ServiceCountdown'
import { IconBadge, Tile } from './Surface'
import { TeamMark } from './TeamMark'
import { TimerIcon } from './icons'

/** My places on the rota for these services, as `service:team`. */
async function fetchMyRotaPlaces(myId: string, serviceIds: string[]): Promise<string[]> {
  const { data, error } = await supabase.from('rota_assignments').select('service_id, department_id').eq('user_id', myId).in('service_id', serviceIds)
  if (error) throw error
  return ((data ?? []) as { service_id: string; department_id: string }[]).map((r) => `${r.service_id}:${r.department_id}`)
}

async function fetchCallTimesOn(dates: string[]): Promise<CallTimeRow[]> {
  const { data, error } = await supabase.from('department_call_times').select('department_id, on_date, call_time').in('on_date', dates)
  if (error) throw error
  return callTimeRowSchema.array().parse(data)
}

/**
 * When this person is due in, on the Dashboard (lib/myCallTimes).
 *
 * One answer: today's call time if there is a service today, otherwise
 * the next service day's — never the ones after. Their own teams and
 * nothing else: every team's call time is on the Team Rota, for whoever
 * opens up. It leaves when it is reached — or as long after as the church
 * has set — so it is never a thing to read past.
 *
 * It draws nothing while it is finding out, and nothing if it cannot: a
 * card that is absent most of the week should not announce itself with a
 * spinner, and the time is on the Team Rota for anybody who goes looking.
 *
 * Whether it shows at all, how far ahead, how long it stays, who it is
 * for and whether a clock runs beside it are the church's: Settings ›
 * Page by Page › Dashboard.
 */
export function MyCallTimes({ className = '' }: { className?: string }) {
  const settings = useDisplay().callTimes
  const { session, ledDepartmentIds, viewAs } = useAuth()
  const myId = session?.user.id
  const { teamIds } = useOwnMemberships()
  const { canOpen } = usePageAccess()

  // Roster, Head and Assisting Heads: who the week's call-time message goes to (0224).
  const mine = useMemo(
    () => [...new Set([...teamIds, ...(ledDepartmentIds ?? []).filter((id): id is string => !!id)])],
    [teamIds, ledDepartmentIds],
  )
  // A preview has no rota of its own — the rows are the previewer's — so
  // it is shown the team it picked, as "the whole team" would.
  const byRota = settings.who === 'rota' && !viewAs
  const wanted = settings.show && !!myId && (byRota || mine.length > 0)

  const today = todayIso()
  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: fetchServices, enabled: wanted })
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments, enabled: wanted })
  const ahead = useMemo(() => {
    const last = addDays(today, settings.days)
    return (servicesQuery.data ?? []).filter((s) => s.date >= today && s.date <= last)
  }, [servicesQuery.data, today, settings.days])
  const dates = useMemo(() => [...new Set(ahead.map((s) => s.date))].sort(), [ahead])
  const serviceIds = useMemo(() => ahead.map((s) => s.id).sort(), [ahead])

  const callTimesQuery = useQuery({
    queryKey: ['call-times', 'mine', dates],
    queryFn: () => fetchCallTimesOn(dates),
    enabled: wanted && dates.length > 0,
  })
  const rotaQuery = useQuery({
    queryKey: ['rota', 'mine', myId, serviceIds],
    queryFn: () => fetchMyRotaPlaces(myId!, serviceIds),
    enabled: wanted && byRota && serviceIds.length > 0,
  })
  const onRota = useMemo(() => (byRota ? new Set(rotaQuery.data ?? []) : null), [byRota, rotaQuery.data])

  // The half-minute clock brings a new day in; `passed` is for the moment
  // a call time is reached, which should not wait for the next half-minute.
  const tick = useNow()
  const [passed, setPassed] = useState(0)
  const now = Math.max(tick, passed)

  const known = wanted && dates.length > 0 && callTimesQuery.isSuccess && departmentsQuery.isSuccess && (!byRota || rotaQuery.isSuccess)
  const day = useMemo(
    () =>
      known
        ? myCallTime({
            services: ahead,
            rows: callTimesQuery.data ?? [],
            teams: departmentsQuery.data ?? [],
            mine,
            onRota,
            today,
            now,
            days: settings.days,
            stayMinutes: settings.stayMinutes,
          })
        : null,
    [known, ahead, callTimesQuery.data, departmentsQuery.data, mine, onRota, today, now, settings.days, settings.stayMinutes],
  )

  // The next moment one of them goes.
  const nextGone = day ? Math.min(...day.calls.map((c) => new Date(c.at).getTime() + settings.stayMinutes * 60_000)) : null
  useEffect(() => {
    if (nextGone === null) return
    // A timer cannot be set further out than about 24 days; the half-minute clock covers anything beyond.
    const wait = Math.min(Math.max(nextGone - Date.now(), 0) + 50, 2_000_000_000)
    const id = window.setTimeout(() => setPassed(Date.now()), wait)
    return () => window.clearTimeout(id)
  }, [nextGone])

  if (!day) return null
  // Teams called at different times: the one case with more than one line.
  const title = day.calls.length > 1 ? 'Your call times' : 'Your call time'

  return (
    <section aria-label={title} className={className}>
      <Tile tone="accent" padded={false} className="overflow-hidden px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex items-start gap-3">
          <IconBadge icon={TimerIcon} tone="blue" />
          <div className="min-w-0 flex-1">
            <h2 className="text-headline-sm text-on-surface">{title}</h2>
            <p className="mt-0.5 break-words text-body-sm text-on-surface-variant">
              <span className="font-medium text-on-surface">{relativeDay(day.date, today)}</span> · {day.services.map((s) => s.service_type).join(' · ')}
            </p>
          </div>
          {canOpen('/rota') && (
            <Link to="/rota" className="tap shrink-0 text-label-md font-medium text-accent-blue-soft">
              Every team
            </Link>
          )}
        </div>

        <ul className="mt-3 divide-y divide-border-subtle">
          {day.calls.map((call) => {
            const due = now >= new Date(call.at).getTime()
            return (
              <li key={call.clock} className="min-w-0 py-2.5">
                <div className="flex items-center gap-3">
                  {/* Every team called for this time: one time, said once. */}
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1.5">
                    {call.teams.map((team) => (
                      <span key={team.id} className="flex min-w-0 items-center gap-2.5">
                        <TeamMark color={team.color} />
                        <span className="min-w-0 break-words text-body-md text-on-surface">{team.name}</span>
                      </span>
                    ))}
                  </div>
                  <span className="shrink-0 font-mono text-headline-sm tabular text-on-surface">{call.clock}</span>
                </div>
                {due ? (
                  // Only where the church keeps it past the call time: the time has come.
                  <p className="mt-0.5 pl-4 text-label-md text-on-surface-variant">Due now</p>
                ) : (
                  settings.countdown && (
                    <div className="mt-0.5 pl-4">
                      <ServiceCountdown startsAt={call.at} label="until your call" />
                    </div>
                  )
                )}
              </li>
            )
          })}
        </ul>
      </Tile>
    </section>
  )
}
