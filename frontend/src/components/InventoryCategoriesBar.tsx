import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { Eyebrow } from './Surface'
import { useErrorText } from '../lib/useErrorText'
import { nextCategoryOrder } from '../lib/inventoryCategories'
import type { InventoryCategory } from '../lib/types'

/**
 * Naming the shelves a team's inventory is filed on.
 *
 * Deliberately small and out of the way. Most of the time nobody is
 * arranging anything — they are looking for a memory card — so this is a
 * line of chips and one button, not a panel. It appears only for whoever
 * runs the team, because for everybody else it is a set of controls that
 * would do nothing.
 *
 * Deleting a shelf never deletes what is on it: the column is `on delete
 * set null`, so the items fall back to Uncategorised. That is worth being
 * sure of before pressing it, so the button says where they go.
 */
export function InventoryCategoriesBar({
  departmentId,
  categories,
  counts,
  onError,
}: {
  departmentId: string
  categories: InventoryCategory[]
  /** How many items sit on each shelf, so a delete can say what it frees. */
  counts: Map<string, number>
  onError: (message: string) => void
}) {
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [renaming, setRenaming] = useState<InventoryCategory | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['inventory-categories', departmentId] })

  const fail = (fallback: string) => (err: unknown) => onError(errorText(err, fallback))

  const add = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('inventory_categories').insert({
        department_id: departmentId,
        name,
        sort_order: nextCategoryOrder(categories),
      })
      if (error) throw error
    },
    onSuccess: () => {
      setDraft('')
      setAdding(false)
      refresh()
    },
    onError: fail('Could not add that category. Is one already called that?'),
  })

  const rename = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('inventory_categories').update({ name }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      setRenaming(null)
      refresh()
    },
    onError: fail('Could not rename that category.'),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('inventory_categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      setRenaming(null)
      // The items carry the id of the shelf they were on; the list has to
      // be re-read or it keeps drawing a heading that is gone.
      queryClient.invalidateQueries({ queryKey: ['inventory-items', departmentId] })
      refresh()
    },
    onError: fail('Could not delete that category.'),
  })

  const busy = add.isPending || rename.isPending || remove.isPending

  return (
    <div className="mb-5">
      <Eyebrow>Categories</Eyebrow>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => {
              setRenaming(category)
              setRenameDraft(category.name)
            }}
            className="tap rounded-full bg-raised px-3 py-1.5 text-label-md text-on-surface hairline transition-colors hover:bg-surface-container"
          >
            {category.name}
            <span className="ml-1.5 text-on-surface-faint">{counts.get(category.id) ?? 0}</span>
          </button>
        ))}

        {adding ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (draft.trim()) add.mutate(draft.trim())
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Cables"
              aria-label="Name of the new category"
              className="min-w-0 rounded-full bg-surface-lowest px-3 py-1.5 text-body-sm text-on-surface hairline focus:outline-none focus-visible:shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]"
            />
            <button
              type="submit"
              disabled={!draft.trim() || busy}
              className="tap rounded-full bg-primary px-3.5 py-1.5 text-label-sm font-medium text-on-primary disabled:opacity-40"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false)
                setDraft('')
              }}
              className="tap rounded-full px-2.5 py-1.5 text-label-sm text-on-surface-variant hover:text-on-surface"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="tap rounded-full bg-secondary-container px-3.5 py-1.5 text-label-md font-medium text-on-surface transition-colors hover:bg-surface-container"
          >
            + Add category
          </button>
        )}
      </div>

      {renaming && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-chip)] bg-raised p-3">
          <input
            autoFocus
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            aria-label={`Rename ${renaming.name}`}
            className="min-w-0 flex-1 rounded-full bg-surface-lowest px-3 py-1.5 text-body-sm text-on-surface hairline focus:outline-none focus-visible:shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]"
          />
          <button
            type="button"
            disabled={!renameDraft.trim() || renameDraft.trim() === renaming.name || busy}
            onClick={() => rename.mutate({ id: renaming.id, name: renameDraft.trim() })}
            className="tap rounded-full bg-primary px-3.5 py-1.5 text-label-sm font-medium text-on-primary disabled:opacity-40"
          >
            Rename
          </button>
          {/* Says where the items go, because "delete" beside a heading
              with eleven things under it reads like it takes them too. */}
          <button
            type="button"
            disabled={busy}
            onClick={() => remove.mutate(renaming.id)}
            className="tap rounded-full px-2.5 py-1.5 text-label-sm text-on-surface-variant transition-colors hover:text-error disabled:opacity-40"
          >
            Delete — items become uncategorised
          </button>
          <button
            type="button"
            onClick={() => setRenaming(null)}
            className="tap rounded-full px-2.5 py-1.5 text-label-sm text-on-surface-variant hover:text-on-surface"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
