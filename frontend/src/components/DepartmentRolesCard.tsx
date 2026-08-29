import { type FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { QueryState } from './QueryState'
import { fetchDepartmentRoles, fetchRoleChecklistItems } from '../lib/queries'
import { useErrorText } from '../lib/useErrorText'
import { isCoordinatorRole } from '../lib/useTeamCoordinator'

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
}: {
  roleId: string
  departmentId: string
  canManage: boolean
}) {
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)

  const itemsQuery = useQuery({
    queryKey: ['role-checklist-items', [departmentId]],
    queryFn: () => fetchRoleChecklistItems([departmentId]),
  })
  const items = (itemsQuery.data ?? []).filter((i) => i.role_id === roleId)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['role-checklist-items'] })

  const addItem = useMutation({
    mutationFn: async (text: string) => {
      const { error } = await supabase.from('department_role_checklist_items').insert({
        role_id: roleId,
        department_id: departmentId,
        label: text,
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

  return (
    <div className="mt-2 border-l border-border-subtle pl-3">
      {items.length === 0 ? (
        <p className="text-label-sm text-on-surface-variant">No checklist items for this role yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 text-body-sm">
              <span className="text-on-surface">{item.label}</span>
              {canManage && (
                <button
                  onClick={() => deleteItem.mutate(item.id)}
                  className="shrink-0 text-label-sm text-error hover:underline"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
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
            placeholder="Check batteries, test focus…"
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
        isEmpty={rolesQuery.data?.length === 0}
        emptyMessage={canManage ? 'No roles yet — add the first one below.' : 'No roles defined yet.'}
      >
        <ul className="mt-4 flex flex-col gap-2">
          {rolesQuery.data?.map((role) => (
            <li
              key={role.id}
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
                  <span className="text-body-sm font-medium text-on-surface">{role.name}</span>
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
                  <RoleChecklistEditor roleId={role.id} departmentId={departmentId} canManage={canManage} />
                </details>
              )}
            </li>
          ))}
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
