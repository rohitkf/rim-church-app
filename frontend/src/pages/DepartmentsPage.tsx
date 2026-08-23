import { type FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import type { Department } from '../lib/types'

async function fetchDepartments(): Promise<Department[]> {
  const { data, error } = await supabase.from('departments').select('*').order('name')
  if (error) throw error
  return data
}

export function DepartmentsPage() {
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()
  const [newName, setNewName] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
  })

  const createDepartment = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('departments').insert({ name })
      if (error) throw error
    },
    onSuccess: () => {
      setNewName('')
      setFormError(null)
      queryClient.invalidateQueries({ queryKey: ['departments'] })
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : 'Could not create department.')
    },
  })

  function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    createDepartment.mutate(newName.trim())
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-headline-xl">Departments</h1>
      </div>
      <p className="mt-2 text-body-md text-on-surface-variant">
        Only the departments you're a core member, guest, or head of — plus every department if
        you're an Admin — show up here.
      </p>

      {isAdmin && (
        <form onSubmit={handleCreate} className="mt-6 flex max-w-md items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-body-sm text-on-surface-variant">
            New department name
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="rounded-sm border border-border-subtle px-3 py-2 text-body-md text-on-surface focus:border-2 focus:border-secondary focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={createDepartment.isPending}
            className="rounded-sm bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
          >
            {createDepartment.isPending ? 'Creating…' : 'Create'}
          </button>
        </form>
      )}
      {formError && (
        <p className="mt-2 max-w-md rounded-sm bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {formError}
        </p>
      )}

      <div className="mt-8">
        <QueryState isLoading={isLoading} error={error} isEmpty={data?.length === 0} emptyMessage="No departments yet.">
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data?.map((dept) => (
              <li key={dept.id}>
                <Link
                  to={`/departments/${dept.id}`}
                  className="block rounded-lg border border-border-subtle bg-surface-lowest p-5 hover:border-secondary"
                >
                  <div className="text-headline-md">{dept.name}</div>
                  <div className="mt-1 text-body-sm text-on-surface-variant">
                    {dept.handbook_url ? 'Handbook on file' : 'No handbook uploaded'}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </QueryState>
      </div>
    </div>
  )
}
