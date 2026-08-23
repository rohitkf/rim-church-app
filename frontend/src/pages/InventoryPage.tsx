import { type FormEvent, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import type { Department, InventoryItem } from '../lib/types'

async function fetchDepartment(id: string): Promise<Department | null> {
  const { data, error } = await supabase.from('departments').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

async function fetchItems(departmentId: string): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('department_id', departmentId)
    .order('name')
  if (error) throw error
  return data
}

export function InventoryPage() {
  const { id } = useParams<{ id: string }>()
  const { isAdmin, hasRole } = useAuth()
  const queryClient = useQueryClient()
  const canManage = isAdmin || hasRole('department_head', { departmentId: id })

  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('0')
  const [location, setLocation] = useState('')
  const [addError, setAddError] = useState<string | null>(null)

  const deptQuery = useQuery({
    queryKey: ['department', id],
    queryFn: () => fetchDepartment(id!),
    enabled: !!id,
  })
  const itemsQuery = useQuery({
    queryKey: ['inventory-items', id],
    queryFn: () => fetchItems(id!),
    enabled: !!id,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['inventory-items', id] })

  const addItem = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('inventory_items').insert({
        department_id: id,
        name: name.trim(),
        quantity: Number(quantity) || 0,
        location: location.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setName('')
      setQuantity('0')
      setLocation('')
      setAddError(null)
      invalidate()
    },
    onError: (err: unknown) => setAddError(err instanceof Error ? err.message : 'Could not add item.'),
  })

  const updateField = useMutation({
    mutationFn: async ({ itemId, patch }: { itemId: string; patch: Partial<InventoryItem> }) => {
      const { error } = await supabase.from('inventory_items').update(patch).eq('id', itemId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from('inventory_items').delete().eq('id', itemId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    addItem.mutate()
  }

  const items = itemsQuery.data ?? []

  return (
    <QueryState
      isLoading={deptQuery.isLoading}
      error={deptQuery.error}
      isEmpty={deptQuery.data === null}
      emptyMessage="Department not found, or you don't have access to it."
    >
      <div>
        <Link to="/inventory" className="text-body-sm text-secondary">
          ← Back to Inventory
        </Link>
        <h1 className="mt-2 text-headline-xl">{deptQuery.data?.name} Inventory</h1>

        <QueryState isLoading={itemsQuery.isLoading} error={itemsQuery.error}>
          <div className="mt-6 overflow-x-auto rounded-lg border border-border-subtle bg-surface-lowest">
            <table className="w-full text-left text-body-sm">
              <thead>
                <tr className="border-b border-border-subtle font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Quantity</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Last Checked</th>
                  {canManage && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-3 font-medium text-on-surface">{item.name}</td>
                    <td className="px-4 py-3">
                      {canManage ? (
                        <input
                          type="number"
                          min={0}
                          defaultValue={item.quantity}
                          onBlur={(e) => {
                            const value = Number(e.target.value)
                            if (Number.isNaN(value) || value === item.quantity) return
                            updateField.mutate({ itemId: item.id, patch: { quantity: value } })
                          }}
                          className="w-20 rounded-sm border border-border-subtle px-2 py-1"
                        />
                      ) : (
                        item.quantity
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {canManage ? (
                        <input
                          defaultValue={item.status ?? ''}
                          placeholder="Good, needs repair…"
                          onBlur={(e) => {
                            const value = e.target.value.trim() || null
                            if (value === item.status) return
                            updateField.mutate({ itemId: item.id, patch: { status: value } })
                          }}
                          className="w-full rounded-sm border border-border-subtle px-2 py-1"
                        />
                      ) : (
                        item.status ?? '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {canManage ? (
                        <input
                          defaultValue={item.location ?? ''}
                          onBlur={(e) => {
                            const value = e.target.value.trim() || null
                            if (value === item.location) return
                            updateField.mutate({ itemId: item.id, patch: { location: value } })
                          }}
                          className="w-full rounded-sm border border-border-subtle px-2 py-1"
                        />
                      ) : (
                        item.location ?? '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {canManage ? (
                        <input
                          type="date"
                          defaultValue={item.last_checked ?? ''}
                          onChange={(e) =>
                            updateField.mutate({ itemId: item.id, patch: { last_checked: e.target.value || null } })
                          }
                          className="rounded-sm border border-border-subtle px-2 py-1"
                        />
                      ) : (
                        item.last_checked ?? '—'
                      )}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => deleteItem.mutate(item.id)}
                          className="text-body-sm text-error hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 6 : 5} className="px-4 py-6 text-center text-on-surface-variant">
                      No inventory items yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </QueryState>

        {canManage && (
          <form onSubmit={handleAdd} className="mt-6 flex flex-wrap items-end gap-2 rounded-lg border border-border-subtle bg-surface-lowest p-4">
            <label className="flex flex-1 flex-col gap-1 text-body-sm text-on-surface-variant">
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Wireless mic pack"
                className="rounded-sm border border-border-subtle px-3 py-2 text-body-md text-on-surface"
              />
            </label>
            <label className="flex flex-col gap-1 text-body-sm text-on-surface-variant">
              Quantity
              <input
                type="number"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-24 rounded-sm border border-border-subtle px-3 py-2 text-body-md text-on-surface"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-body-sm text-on-surface-variant">
              Location
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Storage cupboard A"
                className="rounded-sm border border-border-subtle px-3 py-2 text-body-md text-on-surface"
              />
            </label>
            <button
              type="submit"
              disabled={addItem.isPending}
              className="rounded-sm bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
            >
              {addItem.isPending ? 'Adding…' : 'Add Item'}
            </button>
          </form>
        )}
        {addError && (
          <p className="mt-2 rounded-sm bg-error-container px-3 py-2 text-body-sm text-on-error-container">{addError}</p>
        )}
      </div>
    </QueryState>
  )
}
