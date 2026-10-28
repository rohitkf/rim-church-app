import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchDepartments } from '../lib/queries'
import { fetchPeopleOptions } from '../lib/plannerControls'
import { SHOWN, describeChange, fetchChanges } from '../lib/permissionLog'
import { QueryState } from './QueryState'
import { Tile } from './Surface'

/**
 * Access & Privileges › History (0216): who changed which rule, and when.
 *
 * Every change to the grid, to a team's own rules and to a grant is a row
 * of `permission_changes`, written by the database as it happens, so this
 * is the whole story since the log began — a change made in any room, or
 * by another Admin on another phone, is here too.
 */

const WHEN = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function PermissionLogCard() {
  const changes = useQuery({ queryKey: ['permission-changes'], queryFn: fetchChanges })
  const people = useQuery({ queryKey: ['people-options'], queryFn: fetchPeopleOptions })
  const teams = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  const personName = (id: string) => {
    const p = (people.data ?? []).find((x) => x.id === id)
    return p ? [p.first_name, p.last_name].filter(Boolean).join(' ') : 'Somebody since removed'
  }
  const teamName = (id: string) => (teams.data ?? []).find((t) => t.id === id)?.name ?? 'A team since removed'
  const rows = changes.data ?? []

  return (
    <QueryState isLoading={changes.isLoading} error={changes.error}>
      <Tile>
        <h2 className="text-body-lg font-semibold text-on-surface">Who changed which rule</h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Every change to the grid, to a team’s own rules and to what has been given to somebody, newest first — from any
          room, by any Admin. The database writes it as the change happens.
        </p>
        {rows.length === 0 ? (
          <p className="mt-4 text-body-sm text-on-surface-faint">No rule has changed since the log began.</p>
        ) : (
          <ol aria-label="Changes to who can do what" className="mt-4 flex flex-col">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-col gap-0.5 border-t border-border-subtle py-2.5 first:border-t-0">
                <span className="text-body-sm text-on-surface">{describeChange(row, personName, teamName)}</span>
                <span className="font-mono text-label-sm text-on-surface-faint">
                  {WHEN.format(new Date(row.changed_at))} · {row.changed_by ? personName(row.changed_by) : 'The app itself'}
                  {row.user_id && (
                    <>
                      {' · '}
                      <Link
                        to={`/settings/access?tab=person&person=${row.user_id}`}
                        className="text-accent-blue-soft hover:text-on-surface"
                      >
                        What they can do now
                      </Link>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}
        {rows.length === SHOWN && (
          <p className="mt-3 text-label-md text-on-surface-faint">The latest {SHOWN} changes.</p>
        )}
      </Tile>
    </QueryState>
  )
}
