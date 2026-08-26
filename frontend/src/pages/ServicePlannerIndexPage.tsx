import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { QueryState } from '../components/QueryState'
import { useAuth } from '../auth/AuthContext'
import { fetchServices } from '../lib/queries'
import { agendaDate, monthGrid, monthTitle, todayIso } from '../lib/monthGrid'
import type { Service } from '../lib/types'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function ServicePlannerIndexPage() {
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: fetchServices })

  const now = new Date()
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const today = todayIso()

  // Team members only plan ahead: past services are Admin-only history.
  const visibleServices = useMemo(
    () => (servicesQuery.data ?? []).filter((s) => isAdmin || s.date >= today),
    [servicesQuery.data, isAdmin, today],
  )
  const servicesByDate = useMemo(() => {
    const map = new Map<string, Service[]>()
    for (const s of visibleServices) {
      map.set(s.date, [...(map.get(s.date) ?? []), s])
    }
    return map
  }, [visibleServices])

  const upcoming = useMemo(
    () => visibleServices.filter((s) => s.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6),
    [visibleServices, today],
  )

  function shiftMonth(delta: number) {
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  const weeks = monthGrid(cursor.year, cursor.month)

  return (
    <div>
      <h1 className="text-headline-xl">Service Planner</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">
        Tap a service on the calendar to open its running order.
        {isAdmin ? '' : ' Upcoming services appear here once they are scheduled.'}
      </p>

      <QueryState
        isLoading={servicesQuery.isLoading}
        error={servicesQuery.error}
        isEmpty={visibleServices.length === 0}
        emptyMessage={
          isAdmin
            ? 'No services yet — create one from the Checklists page.'
            : 'No upcoming services scheduled yet — check back soon.'
        }
      >
        <section className="mt-6 rounded-lg border border-border-subtle bg-surface-lowest p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-headline-md">{monthTitle(cursor.year, cursor.month)}</div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
                className="rounded-sm border border-border-subtle px-2.5 py-1.5 text-body-sm text-on-surface hover:border-secondary"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => setCursor({ year: now.getFullYear(), month: now.getMonth() })}
                className="rounded-sm border border-border-subtle px-2.5 py-1.5 text-body-sm text-on-surface hover:border-secondary"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
                className="rounded-sm border border-border-subtle px-2.5 py-1.5 text-body-sm text-on-surface hover:border-secondary"
              >
                ›
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-px overflow-hidden rounded-md border border-border-subtle bg-border-subtle">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className={`bg-surface-lowest px-1 py-2 text-center font-mono text-label-sm uppercase tracking-wide ${d === 'Sun' ? 'text-secondary' : 'text-on-surface-variant'}`}
              >
                {d}
              </div>
            ))}
            {weeks.flat().map((cell) => {
              const dayServices = servicesByDate.get(cell.iso) ?? []
              const isToday = cell.iso === today
              return (
                <div
                  key={cell.iso}
                  className={`min-h-16 bg-surface-lowest p-1 sm:min-h-20 ${cell.inMonth ? '' : 'opacity-40'}`}
                >
                  <div
                    className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full font-mono text-label-sm ${
                      isToday ? 'bg-primary text-on-primary' : 'text-on-surface-variant'
                    }`}
                  >
                    {cell.day}
                  </div>
                  <div className="mt-1 flex flex-col gap-1">
                    {dayServices.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => navigate(`/service-planner/${s.id}`)}
                        title={`${s.service_type} — ${s.date}`}
                        className={`w-full truncate rounded-sm px-1.5 py-1 text-left text-label-sm font-medium ${
                          s.date < today
                            ? 'bg-surface-container text-on-surface-variant'
                            : 'bg-secondary text-on-primary hover:opacity-90'
                        }`}
                      >
                        {s.service_type}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {upcoming.length > 0 && (
          <section className="mt-6">
            <div className="text-headline-md">Upcoming services</div>
            <ul className="mt-3 flex flex-col gap-3">
              {upcoming.map((s) => {
                const d = agendaDate(s.date)
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/service-planner/${s.id}`)}
                      className="flex w-full items-center gap-4 rounded-lg border border-border-subtle bg-surface-lowest p-4 text-left hover:border-secondary"
                    >
                      <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-md bg-secondary/10 text-secondary">
                        <span className="font-mono text-label-sm uppercase leading-none">{d.month}</span>
                        <span className="text-headline-md leading-tight">{d.day}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-on-surface">{s.service_type}</span>
                        <span className="block text-body-sm text-on-surface-variant">
                          {d.weekday} · {s.date}
                        </span>
                      </span>
                      <span className="shrink-0 text-on-surface-variant">›</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </QueryState>
    </div>
  )
}
