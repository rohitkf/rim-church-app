import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchPeopleOptions } from '../lib/plannerControls'
import { Select } from './Select'
import { Pill, inputClasses } from './Surface'

/**
 * A short list of teams, and — when asked for — people, by id: who else
 * may see a page, or which teams may approve something.
 *
 * Teams first, then people, each by name. A team or person since deleted
 * is left out rather than shown as an id, and is dropped on the next save.
 */
export function AudienceEditor({
  label,
  teams,
  people,
  allTeams,
  withPeople,
  editable,
  empty,
  onChange,
}: {
  label: string
  teams: string[]
  people?: string[]
  allTeams: { id: string; name: string }[]
  withPeople: boolean
  editable: boolean
  /** What to say when nobody has been added. */
  empty: string
  onChange: (next: { teams: string[]; people: string[] }) => void
}) {
  const peopleQuery = useQuery({ queryKey: ['people-options'], queryFn: fetchPeopleOptions, enabled: withPeople })
  const [search, setSearch] = useState('')
  const chosenPeople = people ?? []

  const teamName = (id: string) => allTeams.find((t) => t.id === id)?.name ?? null
  const personName = (id: string) => {
    const p = peopleQuery.data?.find((x) => x.id === id)
    return p ? `${p.first_name} ${p.last_name}`.trim() : null
  }

  const rows = [
    ...teams.flatMap((id) => {
      const name = teamName(id)
      return name ? [{ kind: 'team' as const, id, name }] : []
    }).sort((a, b) => a.name.localeCompare(b.name)),
    ...chosenPeople.flatMap((id) => {
      const name = personName(id)
      return name ? [{ kind: 'person' as const, id, name }] : []
    }).sort((a, b) => a.name.localeCompare(b.name)),
  ]

  const set = (nextTeams: string[], nextPeople: string[]) => onChange({ teams: nextTeams, people: nextPeople })
  const teamsLeft = allTeams.filter((t) => !teams.includes(t.id))
  const needle = search.trim().toLowerCase()
  const found = needle
    ? (peopleQuery.data ?? [])
        .filter((p) => !chosenPeople.includes(p.id))
        .filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(needle))
        .slice(0, 6)
    : []

  return (
    <div>
      {rows.length === 0 ? (
        <p className="rounded-[var(--radius-row)] bg-raised px-4 py-3 text-body-sm text-on-surface-variant">{empty}</p>
      ) : (
        <ul aria-label={label} className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li
              key={`${row.kind}:${row.id}`}
              className="flex items-center gap-2 rounded-[var(--radius-row)] bg-raised px-4 py-2.5"
            >
              <span className="min-w-0 flex-1 truncate text-body-sm text-on-surface">{row.name}</span>
              <Pill tone={row.kind === 'team' ? 'blue' : 'neutral'}>{row.kind === 'team' ? 'Team' : 'Person'}</Pill>
              {editable && (
                <button
                  type="button"
                  onClick={() =>
                    row.kind === 'team'
                      ? set(teams.filter((id) => id !== row.id), chosenPeople)
                      : set(teams, chosenPeople.filter((id) => id !== row.id))
                  }
                  aria-label={`Remove ${row.name}`}
                  className="tap rounded-full px-2.5 py-1 text-label-md text-on-surface-variant hover:text-error"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <div className={`mt-2 grid grid-cols-1 gap-2 ${withPeople ? 'sm:grid-cols-2' : ''}`}>
          <Select
            aria-label={`${label}: add a team`}
            placeholder={teamsLeft.length > 0 ? 'Add a team…' : 'Every team is added'}
            value=""
            disabled={teamsLeft.length === 0}
            options={teamsLeft.map((t) => ({ value: t.id, label: t.name }))}
            onChange={(id) => id && set([...teams, id], chosenPeople)}
          />
          {withPeople && (
            <div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Add a person…"
                aria-label={`${label}: add a person`}
                className={inputClasses}
              />
              {needle && (
                <ul className="mt-1.5 flex flex-col gap-1" aria-label="People to add">
                  {found.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => {
                          set(teams, [...chosenPeople, p.id])
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
          )}
        </div>
      )}
    </div>
  )
}
