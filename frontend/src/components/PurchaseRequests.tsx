import { type FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { useErrorText } from '../lib/useErrorText'
import { Field, inputClasses } from './Surface'
import { QueryState } from './QueryState'

const requestSchema = z.object({
  id: z.string(),
  department_id: z.string(),
  requested_by: z.string().nullable(),
  item_name: z.string(),
  quantity: z.number(),
  estimated_cost: z.union([z.number(), z.string()]).nullable(),
  product_url: z.string().nullable(),
  reason: z.string().nullable(),
  status: z.enum(['requested', 'approved', 'declined', 'purchased']),
  decision_note: z.string().nullable(),
  decided_at: z.string().nullable(),
  created_at: z.string(),
  inventory_item_id: z.string().nullable(),
  requester: z.object({ first_name: z.string(), last_name: z.string() }).nullable(),
  decider: z.object({ first_name: z.string(), last_name: z.string() }).nullable(),
  department: z.object({ name: z.string(), color: z.string().nullable() }).nullable(),
})
export type PurchaseRequest = z.infer<typeof requestSchema>

const money = (value: number | string | null | undefined) =>
  value == null || value === '' ? null : `£${Number(value).toFixed(2)}`

const STATUS_TONE: Record<PurchaseRequest['status'], string> = {
  requested: 'bg-accent-orange/15 text-accent-orange',
  approved: 'bg-secondary/15 text-secondary',
  declined: 'bg-error-container text-on-error-container',
  purchased: 'bg-accent-green/15 text-accent-green',
}

async function fetchRequests(departmentId: string | null): Promise<PurchaseRequest[]> {
  let query = supabase
    .from('purchase_requests')
    .select(
      'id, department_id, requested_by, item_name, quantity, estimated_cost, product_url, reason, status, decision_note, decided_at, created_at, inventory_item_id, requester:profiles!purchase_requests_requested_by_fkey(first_name, last_name), decider:profiles!purchase_requests_decided_by_fkey(first_name, last_name), department:departments(name, color)',
    )
    .order('created_at', { ascending: false })
  if (departmentId) query = query.eq('department_id', departmentId)
  const { data, error } = await query
  if (error) throw error
  return z.array(requestSchema).parse(data)
}

/**
 * The things not bought yet.
 *
 * "We need another radio mic" is said in a corridor and remembered by whoever
 * heard it. Here it is written down, it goes to the person who can say yes,
 * and once it has actually been bought it becomes an inventory item — so the
 * wishlist and the shelf are the same list at two points in time, and the
 * money already spent and the money still asked for can be read together.
 *
 * On a team's page it is that team's list. On the inventory index an Admin
 * sees every team's, because "what is everyone asking for" is an Admin's
 * question and nobody else's.
 */
export function PurchaseRequests({
  departmentId,
  departmentName,
}: {
  /** A team's own list, or null for every team's. */
  departmentId: string | null
  departmentName?: string
}) {
  const { session, isAdmin, isDepartmentHead } = useAuth()
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [showDecided, setShowDecided] = useState(false)

  const [itemName, setItemName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [cost, setCost] = useState('')
  const [url, setUrl] = useState('')
  const [reason, setReason] = useState('')

  const requestsQuery = useQuery({
    queryKey: ['purchase-requests', departmentId],
    queryFn: () => fetchRequests(departmentId),
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['purchase-requests'] })
  const mayDecide = (row: PurchaseRequest) => isAdmin || isDepartmentHead(row.department_id)

  const ask = useMutation({
    mutationFn: async () => {
      if (!departmentId) throw new Error('Pick a team to ask on behalf of.')
      const { error: insertError } = await supabase.from('purchase_requests').insert({
        department_id: departmentId,
        requested_by: session!.user.id,
        item_name: itemName.trim(),
        quantity: Number(quantity) || 1,
        estimated_cost: cost.trim() === '' ? null : Number(cost),
        product_url: url.trim() || null,
        reason: reason.trim() || null,
      })
      if (insertError) throw insertError
    },
    onSuccess: () => {
      setAsking(false)
      setItemName(''); setQuantity('1'); setCost(''); setUrl(''); setReason('')
      setError(null)
      refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not send that request.')),
  })

  const decide = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PurchaseRequest['status'] }) => {
      const { error: updateError } = await supabase
        .from('purchase_requests')
        .update({ status })
        .eq('id', id)
      if (updateError) throw updateError
    },
    onSuccess: () => { setError(null); refresh() },
    onError: (err: unknown) => setError(errorText(err, 'Could not save that decision.')),
  })

  /**
   * Bought. The request becomes a real item, which is the only way the money
   * asked for turns into money spent — and the totals on the inventory page
   * count it from that moment because they count items, not requests.
   */
  const markPurchased = useMutation({
    mutationFn: async (row: PurchaseRequest) => {
      const { data: created, error: insertError } = await supabase
        .from('inventory_items')
        .insert({
          department_id: row.department_id,
          name: row.item_name,
          quantity: row.quantity,
          kind: row.quantity > 1 ? 'consumable' : 'asset',
          estimated_cost: row.estimated_cost == null ? null : Number(row.estimated_cost),
          product_url: row.product_url,
          notes: row.reason,
        })
        .select('id')
        .single()
      if (insertError) throw insertError

      const { error: updateError } = await supabase
        .from('purchase_requests')
        .update({ status: 'purchased', inventory_item_id: created.id })
        .eq('id', row.id)
      if (updateError) throw updateError
    },
    onSuccess: () => {
      setError(null)
      refresh()
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not add it to the inventory.')),
  })

  const rows = requestsQuery.data ?? []
  const open = useMemo(() => rows.filter((r) => r.status === 'requested' || r.status === 'approved'), [rows])
  const decided = useMemo(() => rows.filter((r) => r.status === 'declined' || r.status === 'purchased'), [rows])

  // What is still being asked for, in money. The inventory's own total is
  // what has been bought; this is the other half of the same question.
  const outstanding = open.reduce(
    (sum, r) => sum + (r.estimated_cost == null ? 0 : Number(r.estimated_cost) * r.quantity),
    0,
  )

  function handleAsk(e: FormEvent) {
    e.preventDefault()
    if (!itemName.trim()) return
    ask.mutate()
  }

  return (
    <section className="rounded-[var(--radius-card)] bg-surface-lowest p-5 hairline sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="text-headline-md">Purchase wishlist</h2>
          <p className="mt-1 text-label-md text-on-surface-faint">
            {departmentName
              ? `What ${departmentName} is asking for. Requests go to the team's Head.`
              : 'What every team is asking for.'}
          </p>
        </div>
        {departmentId && !asking && (
          <button
            type="button"
            onClick={() => setAsking(true)}
            className="tap rounded-full bg-primary px-4 py-2 text-body-sm font-medium text-on-primary hover:opacity-90"
          >
            Request something
          </button>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      {asking && departmentId && (
        <form onSubmit={handleAsk} className="mt-4 grid grid-cols-1 gap-3 border-t border-border-subtle pt-4 sm:grid-cols-2">
          <Field label="What is needed" className="sm:col-span-2">
            <input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="Radio mic, spare XLR cables…"
              autoFocus
              className={inputClasses}
            />
          </Field>
          <Field label="How many">
            <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClasses} />
          </Field>
          <Field label="Roughly what each (optional)">
            <input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} className={inputClasses} />
          </Field>
          <Field label="Product page (optional)" className="sm:col-span-2">
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className={inputClasses} />
          </Field>
          <Field label="Why (optional)" className="sm:col-span-2">
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className={`${inputClasses} resize-y`} />
          </Field>
          <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={() => setAsking(false)} className="rounded-full px-3 py-1.5 text-label-md text-on-surface-variant hover:text-on-surface">
              Cancel
            </button>
            <button
              type="submit"
              disabled={ask.isPending || !itemName.trim()}
              className="tap rounded-full bg-primary px-4 py-1.5 text-label-md font-medium text-on-primary disabled:opacity-40"
            >
              {ask.isPending ? 'Sending…' : 'Send request'}
            </button>
          </div>
        </form>
      )}

      <QueryState isLoading={requestsQuery.isLoading} error={requestsQuery.error}>
        {open.length === 0 ? (
          <p className="mt-4 text-body-sm text-on-surface-variant">Nothing on the wishlist.</p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-baseline gap-x-2 font-mono text-label-sm text-on-surface-variant">
              <span>{open.length} open</span>
              {outstanding > 0 && (
                <>
                  <span aria-hidden="true" className="text-on-surface-faint">·</span>
                  <span>{money(outstanding)} asked for</span>
                </>
              )}
            </div>
            <ul className="mt-2 flex flex-col gap-2.5">
              {open.map((row) => (
                <RequestRow
                  key={row.id}
                  row={row}
                  showTeam={!departmentId}
                  canDecide={mayDecide(row)}
                  onDecide={(status) => decide.mutate({ id: row.id, status })}
                  onPurchased={() => markPurchased.mutate(row)}
                  busy={decide.isPending || markPurchased.isPending}
                />
              ))}
            </ul>
          </>
        )}

        {decided.length > 0 && (
          <div className="mt-5">
            <button
              type="button"
              onClick={() => setShowDecided((v) => !v)}
              aria-expanded={showDecided}
              className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint hover:text-on-surface"
            >
              {showDecided ? 'Hide' : 'Show'} what has been decided ({decided.length})
            </button>
            {showDecided && (
              <ul className="mt-2 flex flex-col gap-2.5">
                {decided.map((row) => (
                  <RequestRow key={row.id} row={row} showTeam={!departmentId} canDecide={false} busy={false} />
                ))}
              </ul>
            )}
          </div>
        )}
      </QueryState>
    </section>
  )
}

function RequestRow({
  row,
  showTeam,
  canDecide,
  onDecide,
  onPurchased,
  busy,
}: {
  row: PurchaseRequest
  showTeam: boolean
  canDecide: boolean
  onDecide?: (status: PurchaseRequest['status']) => void
  onPurchased?: () => void
  busy: boolean
}) {
  const each = money(row.estimated_cost)
  return (
    <li className="rounded-[var(--radius-row)] bg-raised p-3.5 hairline">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="min-w-0 break-words text-body-md font-medium text-on-surface">
          {row.item_name}
        </span>
        {row.quantity > 1 && (
          <span className="shrink-0 font-mono text-label-sm text-on-surface-variant">×{row.quantity}</span>
        )}
        <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-label-sm uppercase tracking-wide ${STATUS_TONE[row.status]}`}>
          {row.status}
        </span>
        {showTeam && row.department && (
          <span className="shrink-0 font-mono text-label-sm text-on-surface-faint">{row.department.name}</span>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-label-sm text-on-surface-faint">
        {row.requester && <span>Asked by {row.requester.first_name} {row.requester.last_name}</span>}
        {each && (
          <>
            <span aria-hidden="true">·</span>
            <span>{each} each</span>
          </>
        )}
        {row.decider && (
          <>
            <span aria-hidden="true">·</span>
            <span>{row.status === 'declined' ? 'Declined' : 'Decided'} by {row.decider.first_name} {row.decider.last_name}</span>
          </>
        )}
      </div>

      {row.reason && <p className="mt-1.5 text-body-sm text-on-surface-variant">{row.reason}</p>}
      {row.product_url && (
        <a
          href={row.product_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 inline-block break-all text-body-sm text-secondary hover:underline"
        >
          Product page ↗
        </a>
      )}

      {canDecide && (
        <div className="mt-3 flex flex-wrap gap-2">
          {row.status === 'requested' && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => onDecide?.('approved')}
                className="tap rounded-full bg-secondary px-3.5 py-1.5 text-label-md font-medium text-on-primary disabled:opacity-40"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onDecide?.('declined')}
                className="tap rounded-full hairline px-3.5 py-1.5 text-label-md text-on-surface-variant hover:text-error disabled:opacity-40"
              >
                Decline
              </button>
            </>
          )}
          {row.status === 'approved' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onPurchased?.()}
              className="tap rounded-full bg-primary px-3.5 py-1.5 text-label-md font-medium text-on-primary disabled:opacity-40"
            >
              Bought it — add to inventory
            </button>
          )}
        </div>
      )}
    </li>
  )
}
