import { type FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { QueryState } from './QueryState'
import { fetchDepartmentRoles } from '../lib/queries'

/**
 * The roles this team fills at a service. These are the options the Team
 * Rota offers when assigning someone, so this list is the single place
 * they're defined.
 */
export function DepartmentRolesCard({ departmentId, canManage }: { departmentId: string; canManage: boolean }) {
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
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Could not add that role.'),
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
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Could not rename that role.'),
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
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Could not delete that role.'),
  })

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    addRole.mutate(newName.trim())
  }

  return (
    <section className="rounded-lg border border-border-subtle bg-surface-lowest p-6">
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
              className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-border-subtle px-3 py-2"
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
                    className="min-w-0 flex-1 rounded-sm border border-border-subtle px-2 py-1 text-body-sm text-on-surface"
                  />
                  <button
                    type="submit"
                    disabled={renameRole.isPending}
                    className="rounded-sm bg-primary px-3 py-1.5 text-body-sm font-medium text-on-primary disabled:opacity-50"
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
                  {canManage && (
                    <span className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          setEditingId(role.id)
                          setEditingName(role.name)
                        }}
                        className="text-body-sm font-medium text-secondary hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteRole.mutate(role.id)}
                        disabled={deleteRole.isPending}
                        className="text-body-sm text-error hover:underline disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </span>
                  )}
                </>
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
              className="rounded-sm border border-border-subtle px-3 py-2 text-body-md text-on-surface focus:border-2 focus:border-secondary focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={addRole.isPending}
            className="rounded-sm bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
          >
            {addRole.isPending ? 'Adding…' : 'Add'}
          </button>
        </form>
      )}

      {error && (
        <p className="mt-2 rounded-sm bg-error-container px-3 py-2 text-body-sm text-on-error-container">{error}</p>
      )}
    </section>
  )
}
