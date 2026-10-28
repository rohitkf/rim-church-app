import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { fetchDepartments } from '../lib/queries'
import { fetchPeopleOptions } from '../lib/plannerControls'
import { CHANGE_KINDS, SHOWN, changeMatches, describeChange, fetchChanges, putBack, type ChangeKind, type PermissionChangeRow } from '../lib/permissionLog'
import { PERMISSIONS_KEY, usePermissions } from '../lib/usePermissions'
import { useErrorText } from '../lib/useErrorText'
import { QueryState } from './QueryState'
import { Select } from './Select'
import { Tile, inputClasses } from './Surface'

/**
 * Access & Privileges › History (0216): who changed which rule, and when.
 *
 * Every change to the grid, to a team's own rules and to a grant is a row
 * of `permission_changes`, written by the database as it happens, so this
 * is the whole story since the log began — a change made in any room, or
 * by another Admin on another phone, is here too. It can be searched by
 * name, team or action and narrowed to one kind of change; and a change
 * can be put back, which is the rule before it said again — and so a
 * change of its own, here, a moment later.
 */

const WHEN = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function PermissionLogCard() {
  const changes = useQuery({ queryKey: ['permission-changes'], queryFn: fetchChanges })
  const people = useQuery({ queryKey: ['people-options'], queryFn: fetchPeopleOptions })
  const teams = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  const { can } = usePermissions()
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<ChangeKind | ''>('')
  const [putBackId, setPutBackId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const personName = (id: string) => {
    const p = (people.data ?? []).find((x) => x.id === id)
    return p ? [p.first_name, p.last_name].filter(Boolean).join(' ') : 'Somebody since removed'
  }
  const teamName = (id: string) => (teams.data ?? []).find((t) => t.id === id)?.name ?? 'A team since removed'
  /** Still here: a change naming somebody or a team since removed cannot be put back. */
  const stillHere = (row: PermissionChangeRow) =>
    (!row.user_id || (people.data ?? []).some((p) => p.id === row.user_id)) &&
    (!row.department_id || (teams.data ?? []).some((t) => t.id === row.department_id))
  const rows = changes.data ?? []
  // Two hundred rows at most: filtered as drawn, no memo to keep honest.
  const shown = rows.filter((row) => (!kind || row.kind === kind) && changeMatches(row, query, personName, teamName))
  const editable = can('app.permissions')

  const revert = useMutation({
    mutationFn: async (row: PermissionChangeRow) => {
      const call = putBack(row)
      if (!call) return
      const { error } = await supabase.rpc(call.fn, call.args)
      if (error) throw error
      return row.id
    },
    onSuccess: async (id) => {
      setError(null)
      setPutBackId(id ?? null)
      await queryClient.invalidateQueries({ queryKey: PERMISSIONS_KEY })
      await queryClient.invalidateQueries({ queryKey: ['permission-changes'] })
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not put that back.')),
  })

  return (
    <QueryState isLoading={changes.isLoading} error={changes.error}>
      <Tile>
        <h2 className="text-body-lg font-semibold text-on-surface">Who changed which rule</h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Every change to the grid, to a team’s own rules and to what has been given to somebody, newest first — from any
          room, by any Admin. The database writes it as the change happens.
          {editable && ' Put one back and the rule is as it was before it; that is a change too, logged here.'}
        </p>
        {rows.length === 0 ? (
          <p className="mt-4 text-body-sm text-on-surface-faint">No rule has changed since the log began.</p>
        ) : (
          <>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                type="search"
                aria-label="Search the changes"
                placeholder="A name, a team or an action"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className={inputClasses}
              />
              <Select
                aria-label="Which changes"
                value={kind}
                onChange={(next) => setKind(next as ChangeKind | '')}
                options={CHANGE_KINDS}
                className="sm:w-56"
              />
            </div>
            {shown.length === 0 ? (
              <p className="mt-4 text-body-sm text-on-surface-faint">No change reads like that.</p>
            ) : (
              <ol aria-label="Changes to who can do what" className="mt-4 flex flex-col">
                {shown.map((row) => {
                  const sentence = describeChange(row, personName, teamName)
                  const canPutBack = editable && stillHere(row) && putBack(row) !== null
                  return (
                    <li key={row.id} className="flex flex-col gap-0.5 border-t border-border-subtle py-2.5 first:border-t-0">
                      <span className="text-body-sm text-on-surface">{sentence}</span>
                      <span className="flex flex-wrap items-center gap-x-1 font-mono text-label-sm text-on-surface-faint">
                        <span>
                          {WHEN.format(new Date(row.changed_at))} · {row.changed_by ? personName(row.changed_by) : 'The app itself'}
                        </span>
                        {row.user_id && (
                          <>
                            <span>·</span>
                            <Link
                              to={`/settings/access?tab=person&person=${row.user_id}`}
                              className="text-accent-blue-soft hover:text-on-surface"
                            >
                              What they can do now
                            </Link>
                          </>
                        )}
                        {canPutBack && (
                          <>
                            <span>·</span>
                            {putBackId === row.id ? (
                              <span role="status">Put back.</span>
                            ) : (
                              <button
                                type="button"
                                aria-label={`Put it back: ${sentence}`}
                                onClick={() => {
                                  setPutBackId(null)
                                  revert.mutate(row)
                                }}
                                disabled={revert.isPending}
                                className="tap text-accent-blue-soft hover:text-on-surface disabled:opacity-60"
                              >
                                Put it back
                              </button>
                            )}
                          </>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ol>
            )}
            {error && (
              <p role="alert" className="mt-3 text-body-sm text-error">
                {error}
              </p>
            )}
            {shown.length < rows.length && (
              <p className="mt-3 text-label-md text-on-surface-faint">
                {shown.length} of the latest {rows.length}.
              </p>
            )}
            {rows.length === SHOWN && shown.length === rows.length && (
              <p className="mt-3 text-label-md text-on-surface-faint">The latest {SHOWN} changes.</p>
            )}
          </>
        )}
      </Tile>
    </QueryState>
  )
}
