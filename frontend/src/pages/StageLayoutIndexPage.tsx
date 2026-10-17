import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { PageHeader, Pill, Tile } from '../components/Surface'
import { QueryState } from '../components/QueryState'
import { Lifespan } from '../components/Lifespan'
import { DayHeading } from '../components/DayHeading'
import { ServiceSections } from '../components/ServiceSections'
import { fetchServices } from '../lib/queries'
import { todayIso } from '../lib/monthGrid'
import { serviceDays } from '../lib/callTimes'
import { sectionServices } from '../lib/serviceSections'
import { inStartOrder } from '../lib/upcomingServices'
import { useFinishedServices } from '../lib/useFinishedServices'
import { formatTime } from '../lib/time'
import { formatRelativeTime } from '../lib/relativeTime'
import { STAGE_KEY, fetchStageAreas, fetchStageBlockCounts, fetchStageLayouts } from '../lib/stage'
import { useStageAccess } from '../lib/useStageAccess'
import type { Service } from '../lib/types'

/**
 * Every session that can have a layout, in the same four sections as the
 * other Sunday pages. Under each session, one line per area — the stage,
 * the hall, whatever the church has named — saying whether anything is
 * drawn there yet and when it last moved.
 */

const sessionSchema = z.object({
  id: z.string(),
  service_id: z.string(),
  session_name: z.string(),
  start_time: z.string(),
  order_index: z.number(),
})
type Session = z.infer<typeof sessionSchema>

async function fetchSessions(serviceIds: string[]): Promise<Session[]> {
  if (serviceIds.length === 0) return []
  const { data, error } = await supabase
    .from('service_sessions')
    .select('id, service_id, session_name, start_time, order_index')
    .in('service_id', serviceIds)
    .order('order_index')
  if (error) throw error
  return z.array(sessionSchema).parse(data ?? [])
}

export function StageLayoutIndexPage() {
  const today = todayIso()
  const { may } = useStageAccess()
  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: fetchServices })
  const services = useMemo(() => servicesQuery.data ?? [], [servicesQuery.data])
  const serviceIds = useMemo(() => services.map((s) => s.id).sort(), [services])
  const { isFinished, startsAt } = useFinishedServices(serviceIds)

  const areasQuery = useQuery({ queryKey: [...STAGE_KEY, 'areas'], queryFn: fetchStageAreas })
  const sessionsQuery = useQuery({
    queryKey: ['service-sessions', 'stage-index', serviceIds],
    queryFn: () => fetchSessions(serviceIds),
    enabled: serviceIds.length > 0,
  })
  const layoutsQuery = useQuery({
    queryKey: [...STAGE_KEY, 'layouts', serviceIds],
    queryFn: () => fetchStageLayouts(serviceIds),
    enabled: serviceIds.length > 0,
  })
  const layouts = useMemo(() => layoutsQuery.data ?? [], [layoutsQuery.data])
  const layoutIds = useMemo(() => layouts.map((l) => l.id).sort(), [layouts])
  const countsQuery = useQuery({
    queryKey: [...STAGE_KEY, 'counts', layoutIds],
    queryFn: () => fetchStageBlockCounts(layoutIds),
    enabled: layoutIds.length > 0,
  })

  const ordered = useMemo(() => inStartOrder(services, (s) => startsAt(s.id)), [services, startsAt])
  const sections = useMemo(
    () => sectionServices(ordered, today, (s) => isFinished(s.id)),
    [ordered, today, isFinished],
  )
  const areas = areasQuery.data ?? []
  const sessionsOf = (serviceId: string) =>
    (sessionsQuery.data ?? []).filter((s) => s.service_id === serviceId)
  const layoutOf = (sessionId: string, areaId: string) =>
    layouts.find((l) => l.session_id === sessionId && l.area_id === areaId)
  const mayDraw = may('add') || may('edit')

  const render = (list: Service[], finished: boolean) => (
    <div className="flex flex-col gap-6">
      {serviceDays(list).map((day) => (
        <section key={day.date} className="flex flex-col gap-3">
          <DayHeading date={day.date} today={today} count={day.services.length} />
          {day.services.map((service) => (
            <Tile key={service.id}>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-body-lg font-semibold text-on-surface">{service.service_type}</h3>
                {finished && <Pill>Record</Pill>}
              </div>
              <div className="mt-3 flex flex-col gap-4">
                {sessionsOf(service.id).map((session) => (
                  <div key={session.id}>
                    <h4 className="text-body-sm font-medium text-on-surface">
                      {session.session_name}
                      <span className="ml-2 font-mono text-label-sm text-on-surface-faint">{formatTime(session.start_time)}</span>
                    </h4>
                    <ul className="mt-1.5 flex flex-col gap-1.5">
                      {areas.map((area) => {
                        const layout = layoutOf(session.id, area.id)
                        const count = layout ? (countsQuery.data?.[layout.id] ?? 0) : 0
                        return (
                          <li key={area.id}>
                            <Link
                              to={`/stage/${session.id}/${area.id}`}
                              className="tap flex items-center gap-3 rounded-[var(--radius-row)] bg-raised px-4 py-3 transition-colors hover:bg-raised-strong"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block text-body-sm text-on-surface">{area.name}</span>
                                <span className="block text-label-md text-on-surface-variant">
                                  {layout
                                    ? `${count} ${count === 1 ? 'block' : 'blocks'} · changed ${formatRelativeTime(layout.updated_at)}`
                                    : finished
                                      ? 'Nothing was drawn.'
                                      : mayDraw
                                        ? 'Nothing drawn yet — open it to start.'
                                        : 'Nothing drawn yet.'}
                                </span>
                              </span>
                              <span aria-hidden="true" className="text-on-surface-faint">›</span>
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
                {sessionsOf(service.id).length === 0 && (
                  <p className="text-body-sm text-on-surface-variant">No sessions planned yet.</p>
                )}
              </div>
            </Tile>
          ))}
        </section>
      ))}
    </div>
  )

  return (
    <div>
      <PageHeader
        eyebrow="Sunday"
        title="Stage Layout"
        description="Where everything and everybody stands, drawn once so the whole band sees the same picture."
      />
      <Lifespan page="stage" className="mb-4" />
      <QueryState
        isLoading={servicesQuery.isLoading || sessionsQuery.isLoading || areasQuery.isLoading}
        error={servicesQuery.error ?? sessionsQuery.error ?? layoutsQuery.error ?? areasQuery.error}
        isEmpty={services.length === 0 || (areasQuery.isSuccess && areas.length === 0)}
        emptyMessage={
          areasQuery.isSuccess && areas.length === 0
            ? 'No areas to lay out. An Admin names them in Settings › Stage layout.'
            : 'No services planned yet. Add one in the Service Planner and its sessions appear here.'
        }
      >
        <ServiceSections
          sections={sections}
          render={render}
          finishedId="finished-stage"
          empty="No services coming up."
        />
      </QueryState>
    </div>
  )
}
