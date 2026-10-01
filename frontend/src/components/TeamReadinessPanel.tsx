import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useErrorText } from '../lib/useErrorText'
import {
  READINESS_KEY,
  mayMarkReady,
  servingTeams,
  setTeamReady,
  teamLights,
  type ReadinessRow,
} from '../lib/teamReadiness'
import { ReadyForService, ReadyLight } from './ReadyLight'
import { TeamMark } from './TeamMark'

type Assignment = { service_id: string; department_id: string; user_id: string; role_label: string }

/** "9:42am", in the clock the page is read on. */
function clock(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(' ', '')
}

/**
 * Is each team ready for the service to start? At the top of a service
 * on the Checklists page: one light per team the rota has put on it, red
 * until somebody who runs that team today turns it green — its Team
 * Coordinator, its Head or Assisting Head, or an Admin. The switch is only
 * offered to them, and the database refuses anybody else (0110).
 */
export function TeamReadinessPanel({
  serviceId,
  finished,
  assignments,
  departments,
  rows,
  windowFor,
}: {
  serviceId: string
  finished: boolean
  assignments: Assignment[]
  departments: { id: string; name: string; color: string | null }[]
  rows: ReadinessRow[]
  /**
   * When each team may say it is ready: its call time on the day (0122),
   * the same window as its checklist. Left out, the switch is never held.
   */
  windowFor?: (departmentId: string) => { open: boolean; clock: string }
}) {
  const { session, isAdmin, isDepartmentHead } = useAuth()
  const myId = session?.user.id
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const [error, setError] = useState<string | null>(null)

  const toggle = useMutation({
    mutationFn: (v: { departmentId: string; ready: boolean }) =>
      setTeamReady(serviceId, v.departmentId, v.ready),
    onSuccess: () => {
      setError(null)
      queryClient.invalidateQueries({ queryKey: READINESS_KEY })
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not change that team’s light.')),
  })

  const teams = servingTeams(serviceId, assignments)
  if (teams.length === 0) return null
  const { lights, allReady } = teamLights(serviceId, teams, rows)
  const deptById = new Map(departments.map((d) => [d.id, d]))
  const readyCount = lights.filter((l) => l.ready).length

  return (
    <div
      aria-label="Ready for service"
      role="region"
      className="mt-4 rounded-[var(--radius-card)] bg-surface-lowest p-5 hairline"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
          Ready for service?
        </span>
        <span className="font-mono text-label-sm text-on-surface-faint">
          {readyCount}/{lights.length} teams ready
        </span>
      </div>
      {allReady && (
        <div className="mt-3">
          <ReadyForService />
        </div>
      )}
      <ul className="mt-3 flex flex-col gap-2">
        {lights.map((light) => {
          const dept = deptById.get(light.departmentId)
          const name = dept?.name ?? 'A team'
          const may =
            !finished &&
            mayMarkReady({
              isAdmin,
              isHead: isDepartmentHead(light.departmentId),
              myId,
              serviceId,
              departmentId: light.departmentId,
              assignments,
            })
          // Shown but held until the team's call time — the switch is there
          // to see, and says when it will answer.
          const gate = windowFor?.(light.departmentId)
          // A finished service's lights are a record; nothing is opening.
          const held = !finished && !!gate && !gate.open
          return (
            <li
              key={light.departmentId}
              className="flex flex-wrap items-center gap-3 rounded-[var(--radius-chip)] bg-surface-container px-3.5 py-2.5"
            >
              <ReadyLight ready={light.ready} />
              <TeamMark color={dept?.color ?? null} />
              <span className="min-w-0 flex-1">
                <span className="block text-body-sm font-medium text-on-surface">{name}</span>
                <span className="block text-label-md text-on-surface-variant">
                  {light.ready
                    ? `Ready${light.by ? ` · marked by ${light.by}` : ''}${light.at ? `, ${clock(light.at)}` : ''}`
                    : light.by
                      ? `Not ready · ${light.by} turned it back${light.at ? `, ${clock(light.at)}` : ''}`
                      : held
                        ? `Opens at ${gate!.clock}, the team’s call time`
                        : 'Not ready yet'}
                </span>
              </span>
              {may && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={light.ready}
                  aria-label={`${name} ready for service`}
                  disabled={held || toggle.isPending}
                  onClick={() => toggle.mutate({ departmentId: light.departmentId, ready: !light.ready })}
                  className={`tap relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-300 disabled:opacity-60 ${
                    light.ready ? 'bg-accent-green' : 'bg-accent-red'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform duration-300 ${
                      light.ready ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {error && (
        <p role="alert" className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}
    </div>
  )
}
