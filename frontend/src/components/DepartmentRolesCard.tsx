import { type FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { QueryState } from './QueryState'
import { fetchDepartmentRoles, fetchRoleChecklistItems } from '../lib/queries'
import { useErrorText } from '../lib/useErrorText'
import { isCoordinatorRole } from '../lib/useTeamCoordinator'
import { useDragReorder } from '../lib/useDragReorder'
import { PHASES, byPhase } from '../lib/checklistPhase'
import { suggestChecklistItems } from '../lib/checklistSuggestions'
import { itemsToCopy, rolesWithChecklists } from '../lib/copyChecklist'
import type { ChecklistPhase } from '../lib/types'
import { DragHandle } from './DragHandle'

/**
 * The roles this team fills at a service. These are the options the Team
 * Rota offers when assigning someone, so this list is the single place
 * they're defined.
 */
/** The standing checklist for one role: what the person holding it must
 * do at every service. Whoever holds the role in the Team Rota works this
 * list on the Checklists page. */
function RoleChecklistEditor({
  roleId,
  departmentId,
  canManage,
  phase,
  roleNames,
}: {
  roleId: string
  departmentId: string
  canManage: boolean
  phase: ChecklistPhase
  /** Role id → name, for saying which role a suggestion came from. */
  roleNames: Map<string, string>
}) {
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)

  const itemsQuery = useQuery({
    queryKey: ['role-checklist-items', [departmentId]],
    queryFn: () => fetchRoleChecklistItems([departmentId]),
  })
  const items = byPhase(
    (itemsQuery.data ?? []).filter((i) => i.role_id === roleId),
    phase,
  )

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['role-checklist-items'] })

  // What the team's other roles already call this job. Camera Operator 1
  // and Camera Operator 2 check the same batteries; typing it out twice is
  // slower and ends in two nearly-identical lines that read as two jobs.
  const suggestions = useMemo(
    () =>
      suggestChecklistItems({
        items: itemsQuery.data ?? [],
        roleNames,
        roleId,
        phase,
        query: label,
      }),
    [itemsQuery.data, roleNames, roleId, phase, label],
  )

  const addItem = useMutation({
    mutationFn: async (text: string) => {
      const { error } = await supabase.from('department_role_checklist_items').insert({
        role_id: roleId,
        department_id: departmentId,
        label: text,
        phase,
        sort_order: items.length,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setLabel('')
      setError(null)
      invalidate()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not add that item.')),
  })

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('department_role_checklist_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: (err: unknown) => setError(errorText(err, 'Could not delete that item.')),
  })

  const reorder = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.rpc('reorder_role_checklist_items', { role: roleId, ids })
      if (error) throw error
    },
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not reorder the checklist.')),
  })

  const byId = new Map(items.map((i) => [i.id, i]))
  // The order the list is drawn in, which during a drag is ahead of what
  // the database has been told.
  const { ordered, handleProps, rowProps } = useDragReorder(
    items.map((i) => i.id),
    (ids) => reorder.mutate(ids),
    { enabled: canManage },
  )

  return (
    <div className="mt-2 border-l border-border-subtle pl-3">
      {items.length === 0 ? (
        <p className="text-label-sm text-on-surface-variant">Nothing here yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {ordered.map((id) => {
            const item = byId.get(id)
            if (!item) return null
            return (
              <li
                key={item.id}
                {...rowProps(item.id)}
                className="flex items-center justify-between gap-2 rounded-[var(--radius-chip)] bg-surface-lowest text-body-sm"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {canManage && <DragHandle label={item.label} {...handleProps(item.id)} />}
                  <span className="min-w-0 break-words text-on-surface">{item.label}</span>
                </span>
                {canManage && (
                  <button
                    onClick={() => deleteItem.mutate(item.id)}
                    className="shrink-0 text-label-sm text-on-surface-faint hover:text-error hover:underline"
                  >
                    Remove
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {canManage && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (label.trim()) addItem.mutate(label.trim())
          }}
          className="mt-2 flex flex-wrap items-center gap-2"
        >
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={
              phase === 'pre' ? 'Check batteries, test focus…' : 'Batteries on charge, cards filed…'
            }
            className="min-w-0 flex-1 rounded-full hairline px-2 py-1 text-body-sm text-on-surface"
          />
          <button
            type="submit"
            disabled={addItem.isPending}
            className="tap rounded-full hairline px-3 py-1 text-label-sm font-medium text-on-surface hover:border-secondary disabled:opacity-50"
          >
            Add item
          </button>
        </form>
      )}

      {canManage && suggestions.length > 0 && (
        <div className="mt-1.5">
          <div className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
            Already on another role
          </div>
          <ul className="mt-1 flex flex-col gap-1">
            {suggestions.map((s) => (
              <li key={s.label}>
                <button
                  type="button"
                  onClick={() => addItem.mutate(s.label)}
                  disabled={addItem.isPending}
                  className="tap flex w-full items-baseline gap-2 rounded-[var(--radius-chip)] bg-surface-lowest px-2 py-1 text-left text-body-sm text-on-surface hover:bg-raised disabled:opacity-50"
                >
                  <span className="min-w-0 break-words">{s.label}</span>
                  {s.usedBy.length > 0 && (
                    <span className="ml-auto shrink-0 text-label-sm text-on-surface-faint">
                      {s.usedBy.length > 2
                        ? `${s.usedBy.length} roles`
                        : s.usedBy.join(', ')}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="mt-1 text-label-sm text-error">{error}</p>}
    </div>
  )
}

/**
 * "Same as Camera Operator 1" — the whole checklist in one go.
 *
 * The suggestions box under each input already saves the typing, but it
 * still asks for one interaction per line, and a role that does the same
 * job as another has one thing to say, not ten. This says it.
 *
 * It copies rather than links, deliberately — see lib/copyChecklist.ts.
 * The copied lines are ordinary items from the moment they land: reorder
 * them, reword them, delete the two that do not apply, add your own. The
 * role it came from neither knows nor cares.
 */
function CopyChecklistFrom({
  roleId,
  departmentId,
  roles,
}: {
  roleId: string
  departmentId: string
  roles: { id: string; name: string }[]
}) {
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const itemsQuery = useQuery({
    // Same key the per-phase editors use, so this reads the cache they
    // already filled rather than fetching the team's items a third time.
    queryKey: ['role-checklist-items', [departmentId]],
    queryFn: () => fetchRoleChecklistItems([departmentId]),
  })
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data])

  const sources = useMemo(
    () => rolesWithChecklists({ items, roles, excludeRoleId: roleId }),
    [items, roles, roleId],
  )

  const copy = useMutation({
    mutationFn: async (fromRoleId: string) => {
      const rows = itemsToCopy({ items, fromRoleId, toRoleId: roleId })
      const from = roles.find((r) => r.id === fromRoleId)?.name ?? 'that role'
      // Nothing new to take is a normal outcome, not a failure: it is what
      // copying the same role twice looks like, and saying so is kinder
      // than a silent no-op that reads as a broken button.
      if (rows.length === 0) return { added: 0, from }
      const { error: insertError } = await supabase
        .from('department_role_checklist_items')
        .insert(rows.map((r) => ({ ...r, role_id: roleId, department_id: departmentId })))
      if (insertError) throw insertError
      return { added: rows.length, from }
    },
    onSuccess: ({ added, from }) => {
      setError(null)
      setCopied(
        added === 0
          ? `Nothing new to take from ${from} — this role already has all of it.`
          : `Copied ${added} ${added === 1 ? 'item' : 'items'} from ${from}.`,
      )
      queryClient.invalidateQueries({ queryKey: ['role-checklist-items'] })
    },
    onError: (err: unknown) => {
      setCopied(null)
      setError(errorText(err, 'Could not copy that checklist.'))
    },
  })

  if (sources.length === 0) return null

  return (
    <div className="rounded-[var(--radius-chip)] bg-surface-lowest/60 p-2.5">
      <label className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
          Same as
        </span>
        <select
          // Deliberately not a controlled selection: this is an action, not
          // a setting. Nothing about the role afterwards is "same as" any
          // other, so leaving a name sitting in the box would claim a link
          // that does not exist.
          value=""
          disabled={copy.isPending}
          onChange={(e) => {
            const from = e.target.value
            if (from) copy.mutate(from)
            e.target.value = ''
          }}
          className="min-w-0 flex-1 rounded-full hairline bg-transparent px-2 py-1 text-body-sm text-on-surface disabled:opacity-50"
        >
          <option value="">{copy.isPending ? 'Copying…' : 'Choose a role to copy from…'}</option>
          {sources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.count})
            </option>
          ))}
        </select>
      </label>
      <p className="mt-1 text-label-sm text-on-surface-faint">
        Takes that role&rsquo;s whole checklist, before and after. Anything this role already has is
        left alone, and you can still add your own.
      </p>
      {copied && <p className="mt-1 text-label-sm text-on-surface-variant">{copied}</p>}
      {error && <p className="mt-1 text-label-sm text-error">{error}</p>}
    </div>
  )
}

export function DepartmentRolesCard({ departmentId, canManage }: { departmentId: string; canManage: boolean }) {
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const rolesQuery = useQuery({
    queryKey: ['department-roles', [departmentId]],
    queryFn: () => fetchDepartmentRoles([departmentId]),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['department-roles'] })

  const addRole = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('department_roles').insert({ department_id: departmentId, name })
      if (error) throw error
    },
    onSuccess: () => {
      setNewName('')
      setError(null)
      invalidate()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not add that role.')),
  })

  const renameRole = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('department_roles').update({ name }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      setEditingId(null)
      setError(null)
      invalidate()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not rename that role.')),
  })

  const deleteRole = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('department_roles').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not delete that role.')),
  })

  const reorderRoles = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.rpc('reorder_department_roles', {
        dept: departmentId,
        ids,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not reorder the roles.')),
  })

  const roles = rolesQuery.data ?? []
  const roleById = new Map(roles.map((r) => [r.id, r]))
  // Stable across renders so the suggestion list isn't recomputed on every
  // keystroke's re-render of the card around it.
  const roleNames = useMemo(() => new Map(roles.map((r) => [r.id, r.name])), [roles])
  const { ordered, handleProps, rowProps } = useDragReorder(
    roles.map((r) => r.id),
    (ids) => reorderRoles.mutate(ids),
    { enabled: canManage },
  )

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    addRole.mutate(newName.trim())
  }

  return (
    <section className="rounded-[var(--radius-card)] bg-surface-lowest hairline p-6">
      <h2 className="text-headline-md">Roles</h2>
      <p className="mt-1 text-body-sm text-on-surface-variant">
        The jobs this team fills at a service. These are the options offered when building the Team
        Rota.
      </p>

      <QueryState
        isLoading={rolesQuery.isLoading}
        error={rolesQuery.error}
        isEmpty={roles.length === 0}
        emptyMessage={canManage ? 'No roles yet — add the first one below.' : 'No roles defined yet.'}
      >
        <ul className="mt-4 flex flex-col gap-2">
          {ordered.map((id) => {
            const role = roleById.get(id)
            if (!role) return null
            return (
            <li
              key={role.id}
              {...rowProps(role.id)}
              /* Once this row grew a Checklist block underneath it, it
                 stopped being one line — and `rounded-full` on a tall box
                 draws an ellipse, not a pill. */
              className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-[var(--radius-chip)] hairline px-3 py-2"
            >
              {editingId === role.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const name = editingName.trim()
                    if (!name || name === role.name) return setEditingId(null)
                    renameRole.mutate({ id: role.id, name })
                  }}
                  className="flex flex-1 flex-wrap items-center gap-2"
                >
                  <input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    autoFocus
                    className="min-w-0 flex-1 rounded-full hairline px-2 py-1 text-body-sm text-on-surface"
                  />
                  <button
                    type="submit"
                    disabled={renameRole.isPending}
                    className="rounded-full bg-primary px-3 py-1.5 text-body-sm font-medium text-on-primary disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="text-body-sm text-on-surface-variant hover:underline"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <span className="flex min-w-0 items-center gap-1.5">
                    {canManage && <DragHandle label={role.name} {...handleProps(role.id)} />}
                    <span className="min-w-0 break-words text-body-sm font-medium text-on-surface">
                      {role.name}
                    </span>
                  </span>
                  {/* Coordinator is not an ordinary role: whoever the rota
                      puts in it can verify this team's checklist, and every
                      team is given one. Renaming or deleting it would take
                      that away by accident, so it is shown as the fixture
                      it is. */}
                  {isCoordinatorRole(role.name) ? (
                    <span className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
                      Built in
                    </span>
                  ) : (
                    canManage && (
                      <span className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            setEditingId(role.id)
                            setEditingName(role.name)
                          }}
                          className="tap text-body-sm font-medium text-secondary hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteRole.mutate(role.id)}
                          disabled={deleteRole.isPending}
                          className="tap text-body-sm text-error hover:underline disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </span>
                    )
                  )}
                </>
              )}
              {editingId !== role.id && (
                <details className="mt-1 w-full">
                  <summary className="cursor-pointer text-label-sm text-secondary">Checklist</summary>
                  {/* Two lists, not one: the jobs before the doors open and
                      the jobs once everyone has gone are done hours apart,
                      and reading them as a single column means scanning past
                      half of it at both ends. */}
                  <div className="mt-2 flex flex-col gap-4">
                    {canManage && (
                      <CopyChecklistFrom
                        roleId={role.id}
                        departmentId={departmentId}
                        roles={roles}
                      />
                    )}
                    {PHASES.map((p) => (
                      <div key={p.value} className="rounded-[var(--radius-chip)] bg-surface-lowest/60 p-2.5">
                        <div className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
                          {p.label}
                        </div>
                        <p className="text-label-sm text-on-surface-faint">{p.blurb}</p>
                        <RoleChecklistEditor
                          roleId={role.id}
                          departmentId={departmentId}
                          canManage={canManage}
                          phase={p.value}
                          roleNames={roleNames}
                        />
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </li>
            )
          })}
        </ul>
      </QueryState>

      {canManage && (
        <form onSubmit={handleAdd} className="mt-4 flex flex-wrap items-end gap-2 border-t border-border-subtle pt-4">
          <label className="flex flex-1 flex-col gap-1 text-body-sm text-on-surface-variant">
            New role
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Cameraman, Sound Desk, Usher…"
              className="rounded-full hairline px-3 py-2 text-body-md text-on-surface focus:border-2 focus:border-secondary focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={addRole.isPending}
            className="rounded-full bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
          >
            {addRole.isPending ? 'Adding…' : 'Add'}
          </button>
        </form>
      )}

      {error && (
        <p className="mt-2 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">{error}</p>
      )}
    </section>
  )
}
