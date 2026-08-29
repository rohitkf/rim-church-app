import { Navigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { QueryState } from '../components/QueryState'
import { PageHeader } from '../components/Surface'

/**
 * Where a scanned label lands.
 *
 * The QR carries a link so any phone camera opens it, which means this
 * route is reached cold — often by someone who was not in the app a moment
 * ago. All it does is find which team's register holds the item and hand
 * over to that page with the item named, so there is one place that knows
 * how to act on an item rather than two.
 */
export function InventoryScanPage() {
  const { itemId } = useParams<{ itemId: string }>()

  const itemQuery = useQuery({
    queryKey: ['scanned-item', itemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('id, department_id')
        .eq('id', itemId!)
        .maybeSingle()
      if (error) throw error
      return data ? z.object({ id: z.string(), department_id: z.string() }).parse(data) : null
    },
    enabled: !!itemId,
  })

  if (itemQuery.data) {
    return (
      <Navigate
        to={`/inventory/${itemQuery.data.department_id}?item=${itemQuery.data.id}`}
        replace
      />
    )
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <PageHeader eyebrow="Equipment register" title="Opening item…" />
      <QueryState
        isLoading={itemQuery.isLoading}
        error={itemQuery.error}
        isEmpty={itemQuery.data === null}
        emptyMessage="That code does not match anything on the register — the item may have been deleted, or the label belongs to another church's copy of the app."
      >
        <p className="text-body-sm text-on-surface-variant">Taking you there…</p>
      </QueryState>
    </div>
  )
}
