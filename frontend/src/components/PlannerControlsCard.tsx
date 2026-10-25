import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CONTROL_KEYS,
  NEW_HOLDER,
  PLANNER_CONTROLS,
  fetchPeopleOptions,
  toggleControl,
  withHolder,
  type HolderKind,
  type PlannerControls,
} from '../lib/plannerControls'
import { Select } from './Select'
import { Pill, inputClasses } from './Surface'

/**
 * Settings › Page by page › Service Planner: who else may press the
 * planner's buttons, and which (0184).
 *
 * Whoever may plan the running order already has every button; this adds
 * a team (everybody on it, and its Heads) or a person, and ticks what
 * each may press. Nothing reaches anybody until the room's Save.
 */
export function PlannerControlsCard({
  value,
  onChange,
  editable,
  teams,
}: {
  value: PlannerControls
  onChange: (next: PlannerControls) => void
  editable: boolean
  teams: { id: string; name: string }[]
}) {
  const people = useQuery({ queryKey: ['people-options'], queryFn: fetchPeopleOptions })
  const [search, setSearch] = useState('')

  const personName = (id: string) => {
    const p = people.data?.find((x) => x.id === id)
    return p ? `${p.first_name} ${p.last_name}`.trim() : null
  }
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? null

  // Teams first, then people, each by name; a team or person since gone
  // is left out rather than shown as an id.
  const holders = (() => {
    const rows: { kind: HolderKind; id: string; name: string; given: string[] }[] = []
    for (const [id, given] of Object.entries(value.teams)) {
      const name = teamName(id)
      if (name) rows.push({ kind: 'teams', id, name, given })
    }
    for (const [id, given] of Object.entries(value.people)) {
      const name = personName(id)
      if (name) rows.push({ kind: 'people', id, name, given })
    }
    return rows.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'teams' ? -1 : 1))
  })()

  const teamsLeft = teams.filter((t) => !(t.id in value.teams))
  const needle = search.trim().toLowerCase()
  const found = needle
    ? (people.data ?? [])
        .filter((p) => !(p.id in value.people))
        .filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(needle))
        .slice(0, 6)
    : []

  return (
    <section aria-label="Planner buttons">
      <h3 className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">Planner buttons</h3>
      <p className="mt-1 text-label-md text-on-surface-faint">
        Who else may use the buttons in a session’s menu and End service, and which. Whoever may plan the
        running order already has them all. A team’s buttons go to everybody on it and its Heads.
      </p>

      {holders.length === 0 ? (
        <p className="mt-3 rounded-[var(--radius-row)] bg-raised px-4 py-3 text-body-sm text-on-surface-variant">
          Nobody else yet — only whoever plans the running order has these buttons.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2" aria-label="Who has planner buttons">
          {holders.map((h) => {
            const who = h.name
            return (
              <li key={`${h.kind}:${h.id}`} className="rounded-[var(--radius-row)] bg-raised px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-on-surface">{who}</span>
                  <Pill tone={h.kind === 'teams' ? 'blue' : 'neutral'}>{h.kind === 'teams' ? 'Team' : 'Person'}</Pill>
                  {editable && (
                    <span className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => onChange(withHolder(value, h.kind, h.id, CONTROL_KEYS))}
                        className="tap rounded-full px-2.5 py-1 text-label-md text-accent-blue-soft hover:text-on-surface"
                        aria-label={`Give ${who} every button`}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => onChange(withHolder(value, h.kind, h.id, null))}
                        className="tap rounded-full px-2.5 py-1 text-label-md text-on-surface-variant hover:text-error"
                        aria-label={`Remove ${who}`}
                      >
                        Remove
                      </button>
                    </span>
                  )}
                </div>
                <div
                  role="group"
                  aria-label={`Buttons ${who} may use`}
                  className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2"
                >
                  {PLANNER_CONTROLS.map((c) => {
                    const on = h.given.includes(c.key)
                    return (
                      <label
                        key={c.key}
                        className={`flex items-start gap-2.5 ${editable ? 'cursor-pointer' : 'opacity-80'}`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={!editable}
                          onChange={() => onChange(toggleControl(value, h.kind, h.id, c.key))}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)]"
                        />
                        <span className="min-w-0">
                          <span className="block text-body-sm text-on-surface">{c.label}</span>
                          <span className="block text-label-sm text-on-surface-faint">{c.hint}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
                {h.given.length === 0 && (
                  <p className="mt-2 text-label-sm text-on-surface-faint">No buttons ticked: {who} sees none.</p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {editable && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Select
            aria-label="Add a team"
            placeholder={teamsLeft.length > 0 ? 'Add a team…' : 'Every team is added'}
            value=""
            disabled={teamsLeft.length === 0}
            options={teamsLeft.map((t) => ({ value: t.id, label: t.name }))}
            onChange={(id) => id && onChange(withHolder(value, 'teams', id, NEW_HOLDER))}
          />
          <div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Add a person…"
              aria-label="Add a person"
              className={inputClasses}
            />
            {needle && (
              <ul className="mt-1.5 flex flex-col gap-1" aria-label="People to add">
                {found.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(withHolder(value, 'people', p.id, NEW_HOLDER))
                        setSearch('')
                      }}
                      className="tap w-full rounded-[var(--radius-row)] bg-raised px-4 py-2 text-left text-body-sm text-on-surface hover:bg-raised-strong"
                    >
                      Add {p.first_name} {p.last_name}
                    </button>
                  </li>
                ))}
                {found.length === 0 && (
                  <li className="px-1 text-label-sm text-on-surface-faint">Nobody else by that name.</li>
                )}
              </ul>
            )}
          </div>
        </div>
      )}
      {editable && (
        <p className="mt-2 text-label-sm text-on-surface-faint">
          Someone new starts with the four that run the order — Session started, Not started, Add time and Skip.
          They still need to be able to open the Service Planner.
        </p>
      )}
    </section>
  )
}
