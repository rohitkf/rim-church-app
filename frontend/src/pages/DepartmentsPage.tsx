import { type FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { fetchDepartments } from '../lib/queries'
import { DEFAULT_DEPT_COLOR } from '../lib/deptBadge'
import type { Department } from '../lib/types'

/** Admin-only swatch that saves the department's badge color when the
 * picker closes (onBlur), not on every drag tick of the native input. */
function DeptColorControl({ dept }: { dept: Department }) {
  const queryClient = useQueryClient()
  const [color, setColor] = useState(dept.color ?? DEFAULT_DEPT_COLOR)

  const saveColor = useMutation({
    mutationFn: async (value: string) => {
      const { error } = await supabase.from('departments').update({ color: value }).eq('id', dept.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['departments'] }),
  })

  return (
    <label className="mt-3 flex items-center gap-2 text-body-sm text-on-surface-variant">
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        onBlur={() => {
          if (color !== (dept.color ?? DEFAULT_DEPT_COLOR)) saveColor.mutate(color)
        }}
        className="h-6 w-9 cursor-pointer rounded-sm border border-border-subtle bg-transparent p-0"
        aria-label={`Badge color for ${dept.name}`}
      />
      {saveColor.isPending ? 'Saving…' : saveColor.isError ? 'Could not save color' : 'Badge color'}
    </label>
  )
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
              <li key={dept.id} className="rounded-lg border border-border-subtle bg-surface-lowest p-5">
                <Link to={`/departments/${dept.id}`} className="block hover:text-secondary">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: dept.color ?? DEFAULT_DEPT_COLOR }}
                    />
                    <span className="text-headline-md">{dept.name}</span>
                  </div>
                  <div className="mt-1 text-body-sm text-on-surface-variant">
                    {dept.handbook_url ? 'Handbook on file' : 'No handbook uploaded'}
                  </div>
                </Link>
                {isAdmin && <DeptColorControl dept={dept} />}
              </li>
            ))}
          </ul>
        </QueryState>
      </div>
    </div>
  )
}
