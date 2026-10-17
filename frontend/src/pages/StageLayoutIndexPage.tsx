import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
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
import { formatRelativeTime } from '../lib/relativeTime'
import { STAGE_KEY, fetchStageAreas, fetchStageBlockCounts, fetchStageLayouts } from '../lib/stage'
import { useStageAccess } from '../lib/useStageAccess'
import type { Service } from '../lib/types'

/**
 * Every service that can have a layout, in the same four sections as the
 * other Sunday pages. One line per service — the stage, the hall and any
 * other area are one workspace behind it — saying whether anything is
 * drawn yet and when it last moved.
 */
export function StageLayoutIndexPage() {
  const today = todayIso()
  const { may } = useStageAccess()
  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: fetchServices })
  const services = useMemo(() => servicesQuery.data ?? [], [servicesQuery.data])
  const serviceIds = useMemo(() => services.map((s) => s.id).sort(), [services])
  const { isFinished, startsAt } = useFinishedServices(serviceIds)

  const areasQuery = useQuery({ queryKey: [...STAGE_KEY, 'areas'], queryFn: fetchStageAreas })
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
  const areaNames = areas.map((a) => a.name).join(' · ')
  const layoutOf = (serviceId: string) => layouts.find((l) => l.service_id === serviceId)
  const mayDraw = may('add') || may('edit')

  const render = (list: Service[], finished: boolean) => (
    <div className="flex flex-col gap-6">
      {serviceDays(list).map((day) => (
        <section key={day.date} className="flex flex-col gap-3">
          <DayHeading date={day.date} today={today} count={day.services.length} />
          {day.services.map((service) => {
            const layout = layoutOf(service.id)
            const count = layout ? (countsQuery.data?.[layout.id] ?? 0) : 0
            return (
              <Tile key={service.id} interactive>
                <Link to={`/stage/${service.id}`} className="tap flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-3">
                      <span className="text-body-lg font-semibold text-on-surface">{service.service_type}</span>
                      {finished && <Pill>Record</Pill>}
                    </span>
                    <span className="mt-0.5 block text-body-sm text-on-surface-variant">
                      {layout
                        ? `${count} ${count === 1 ? 'block' : 'blocks'} · changed ${formatRelativeTime(layout.updated_at)}`
                        : finished
                          ? 'Nothing was drawn.'
                          : mayDraw
                            ? 'Nothing drawn yet — open it to start.'
                            : 'Nothing drawn yet.'}
                    </span>
                    {areaNames && <span className="mt-1 block font-mono text-label-sm text-on-surface-faint">{areaNames}</span>}
                  </span>
                  <span aria-hidden="true" className="text-on-surface-faint">›</span>
                </Link>
              </Tile>
            )
          })}
        </section>
      ))}
    </div>
  )

  return (
    <div>
      <PageHeader
        eyebrow="Sunday"
        title="Stage Layout"
        description="Where everything and everybody stands — the stage and the hall in one picture, drawn once for the whole service."
      />
      <Lifespan page="stage" className="mb-4" />
      <QueryState
        isLoading={servicesQuery.isLoading || areasQuery.isLoading}
        error={servicesQuery.error ?? layoutsQuery.error ?? areasQuery.error}
        isEmpty={services.length === 0 || (areasQuery.isSuccess && areas.length === 0)}
        emptyMessage={
          areasQuery.isSuccess && areas.length === 0
            ? 'No areas to lay out. An Admin names them in Settings › Stage layout.'
            : 'No services planned yet. Add one in the Service Planner and it appears here.'
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
