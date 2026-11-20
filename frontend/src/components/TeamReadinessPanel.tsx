import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { usePermissions } from '../lib/usePermissions'
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
 *
 * The Dashboard shows it too, inside a service's own card (`embedded`),
 * with how far each team has got through its checklist beside its light
 * (`progress`): the light is somebody's word that the team is ready, the
 * bar is the work behind the word.
 */
export function TeamReadinessPanel({
  serviceId,
  finished,
  assignments,
  departments,
  rows,
  windowFor,
  progress,
  embedded = false,
  action,
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
  /**
   * How far each team is through its checklist, 0–100 (lib/readiness), by
   * team id. Given, every team gets a bar and the number; a team with no
   * checklist to do says so. Left out, there are no bars.
   */
  progress?: Map<string, { pct: number | null }>
  /** Inside another card: no card of its own. */
  embedded?: boolean
  /** Something for the heading's end — a way to the Checklists page. */
  action?: ReactNode
}) {
  const { session, previewCoordinates } = useAuth()
  const { can } = usePermissions()
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

  const body = (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-mono text-label-sm text-on-surface-variant">
          Ready for service?
        </span>
        <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-mono text-label-sm text-on-surface-faint">
            {readyCount}/{lights.length} teams ready
          </span>
          {action}
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
              can,
              myId,
              serviceId,
              departmentId: light.departmentId,
              assignments,
              previewCoordinates,
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
                {progress && <ChecklistProgress name={name} pct={progress.get(light.departmentId)?.pct ?? null} />}
              </span>
              {may && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={light.ready}
                  aria-label={`${name} ready for service`}
                  disabled={held || toggle.isPending}
                  onClick={() => toggle.mutate({ departmentId: light.departmentId, ready: !light.ready })}
                  className={`tap relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-60 ${
                    // Off is the system's grey, as every switch in the app is.
                    light.ready ? 'bg-accent-green' : 'bg-switch-off'
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
    </>
  )

  // Inside another card it has no card of its own, and is not where the
  // tour points: that is the one on the Checklists page.
  if (embedded) {
    return (
      <div aria-label="Ready for service" role="region">
        {body}
      </div>
    )
  }
  return (
    <div
      aria-label="Ready for service"
      role="region"
      data-tour="ready-light"
      className="mt-4 rounded-[var(--radius-card)] bg-surface-lowest p-5 hairline"
    >
      {body}
    </div>
  )
}

/**
 * How far a team is through its checklist: a bar and the number.
 *
 * The number is lib/readiness's: a tick is a third of an item, the Head's
 * check another, the sign-off the last — so 100% is every line signed
 * off, not every line ticked. Green only then.
 */
function ChecklistProgress({ name, pct }: { name: string; pct: number | null }) {
  if (pct === null) {
    return <span className="mt-1.5 block text-label-md text-on-surface-faint">No checklist for this service</span>
  }
  const shown = Math.max(0, Math.min(100, Math.round(pct)))
  return (
    <span className="mt-2 flex items-center gap-2.5">
      <span
        role="progressbar"
        aria-label={`${name} checklist`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={shown}
        aria-valuetext={`${shown}% of the checklist done`}
        className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-raised-strong"
      >
        <span
          className={`block h-full rounded-full transition-[width] duration-300 ease-[var(--ease-glide)] ${shown === 100 ? 'bg-accent-green' : 'bg-accent-blue'}`}
          style={{ width: `${shown}%` }}
        />
      </span>
      <span className="w-10 shrink-0 text-right font-mono text-label-sm tabular text-on-surface-variant">{shown}%</span>
    </span>
  )
}
