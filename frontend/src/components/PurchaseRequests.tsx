import { type FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { useErrorText } from '../lib/useErrorText'
import { Field, Overlay, inputClasses } from './Surface'
import { Select } from './Select'
import { NumberDial } from './NumberDial'
import { QueryState } from './QueryState'
import { inventoryCategorySchema, type InventoryCategory } from '../lib/types'
import { categoryOptions } from '../lib/inventoryCategories'
import { valueHint } from '../lib/inventory'
import {
  type RequestDraft,
  draftFrom,
  draftToRow,
  emptyDraft,
  itemFromRequest,
} from '../lib/purchaseRequest'

const requestSchema = z.object({
  id: z.string(),
  department_id: z.string(),
  requested_by: z.string().nullable(),
  item_name: z.string(),
  /** Asked at request time now, rather than guessed from the count. */
  kind: z.enum(['asset', 'consumable']).nullable().optional(),
  quantity: z.number(),
  estimated_cost: z.union([z.number(), z.string()]).nullable(),
  product_url: z.string().nullable(),
  reason: z.string().nullable(),
  // The rest of what the shelf will need, asked for once, here.
  brand: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  serial_number: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  category_id: z.string().nullable().optional(),
  reorder_level: z.number().nullable().optional(),
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

const REQUEST_COLUMNS =
  'id, department_id, requested_by, item_name, kind, quantity, estimated_cost, product_url, reason, brand, model, serial_number, location, category, category_id, reorder_level, status, decision_note, decided_at, created_at, inventory_item_id, requester:profiles!purchase_requests_requested_by_fkey(first_name, last_name), decider:profiles!purchase_requests_decided_by_fkey(first_name, last_name), department:departments(name, color)'

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
    .select(REQUEST_COLUMNS)
    .order('created_at', { ascending: false })
  if (departmentId) query = query.eq('department_id', departmentId)
  const { data, error } = await query
  if (error) throw error
  return z.array(requestSchema).parse(data)
}

/**
 * The shelves the team has, so a request can say which one it is for.
 *
 * The same query the inventory page runs, under the same key, so opening
 * one after the other costs nothing.
 */
function useCategories(departmentId: string | null) {
  const query = useQuery({
    queryKey: ['inventory-categories', departmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_categories')
        .select('id, department_id, name, sort_order')
        .eq('department_id', departmentId!)
      if (error) throw error
      return z.array(inventoryCategorySchema).parse(data)
    },
    enabled: !!departmentId,
  })
  return query.data ?? []
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
  const [editing, setEditing] = useState<PurchaseRequest | null>(null)
  const [showDecided, setShowDecided] = useState(false)

  const requestsQuery = useQuery({
    queryKey: ['purchase-requests', departmentId],
    queryFn: () => fetchRequests(departmentId),
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['purchase-requests'] })
  const mayDecide = (row: PurchaseRequest) => isAdmin || isDepartmentHead(row.department_id)

  const ask = useMutation({
    mutationFn: async (draft: RequestDraft) => {
      if (!departmentId) throw new Error('Pick a team to ask on behalf of.')
      const { error: insertError } = await supabase.from('purchase_requests').insert({
        department_id: departmentId,
        requested_by: session!.user.id,
        ...draftToRow(draft),
      })
      if (insertError) throw insertError
    },
    onSuccess: () => {
      setAsking(false)
      setError(null)
      refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not send that request.')),
  })

  /**
   * Correcting a request.
   *
   * Somebody types the wrong model number, or the price they guessed at
   * turns out to be double. Without this the only way to fix it was to
   * delete the request and write it again, which lost who asked and when.
   * Who may is the database's answer, not this form's: whoever asked while
   * nobody has answered yet, and a Head or an Admin at any point.
   */
  const edit = useMutation({
    mutationFn: async ({ id, draft }: { id: string; draft: RequestDraft }) => {
      const { error: updateError } = await supabase
        .from('purchase_requests')
        .update(draftToRow(draft))
        .eq('id', id)
      if (updateError) throw updateError
    },
    onSuccess: () => {
      setEditing(null)
      setError(null)
      refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not save those changes.')),
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
   *
   * Everything asked for on the request crosses over, so nobody has to go
   * and find out the brand and the serial number a second time. The asset
   * tag is the one thing the request cannot carry: it is minted here, by
   * the database, so two people buying at once can't be handed the same
   * number.
   */
  const markPurchased = useMutation({
    mutationFn: async (row: PurchaseRequest) => {
      const { data: tag, error: tagError } = await supabase.rpc('next_asset_tag', {
        dept_id: row.department_id,
        category: row.category?.trim() || row.item_name.trim(),
      })
      if (tagError) throw tagError

      const { data: created, error: insertError } = await supabase
        .from('inventory_items')
        .insert(itemFromRequest(row, tag))
        .select('id')
        .single()
      if (insertError) throw insertError

      const { error: updateError } = await supabase
        .from('purchase_requests')
        .update({ status: 'purchased', inventory_item_id: created.id })
        .eq('id', row.id)
      if (updateError) throw updateError
      return row.department_id
    },
    onSuccess: (deptId) => {
      setError(null)
      refresh()
      // The register is keyed by team — invalidating 'inventory' refreshed
      // nothing at all, which is how a bought item failed to appear until
      // the page was reloaded.
      queryClient.invalidateQueries({ queryKey: ['inventory-items', deptId] })
      queryClient.invalidateQueries({ queryKey: ['inventory-events'] })
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not add it to the inventory.')),
  })

  /**
   * Taking it back off the list. A request is a sentence somebody wrote, and
   * changing your mind about needing something is not an event worth keeping
   * a record of — so this really deletes rather than marking it withdrawn.
   * The database decides who may: whoever asked, while nobody has answered
   * yet, and a Head or an Admin at any point.
   */
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error: deleteError } = await supabase.from('purchase_requests').delete().eq('id', id)
      if (deleteError) throw deleteError
    },
    onSuccess: () => { setError(null); refresh() },
    onError: (err: unknown) => setError(errorText(err, 'Could not remove that request.')),
  })

  const rows = requestsQuery.data ?? []
  // Three lists, not one: what is still being asked for, what has been said
  // yes to and is waiting to be bought, and what is settled either way.
  const wanted = useMemo(() => rows.filter((r) => r.status === 'requested'), [rows])
  const waiting = useMemo(() => rows.filter((r) => r.status === 'approved'), [rows])
  const decided = useMemo(() => rows.filter((r) => r.status === 'declined' || r.status === 'purchased'), [rows])

  // Whoever wrote it may take it back while it is still a question; a Head
  // or an Admin may clear anything off either list.
  const mayRemove = (row: PurchaseRequest) =>
    mayDecide(row) || (row.requested_by === session?.user.id && row.status === 'requested')
  // The same people may correct it — except once it has been bought, when
  // the item on the shelf is the record and this is only its history.
  const mayEdit = (row: PurchaseRequest) => row.status !== 'purchased' && mayRemove(row)

  const lineTotal = (r: PurchaseRequest) =>
    r.estimated_cost == null ? 0 : Number(r.estimated_cost) * r.quantity
  // What is still being asked for, and what has been agreed but not yet
  // bought. The inventory's own total is what has been spent; these are the
  // other halves of the same question.
  const outstanding = wanted.reduce((sum, r) => sum + lineTotal(r), 0)
  const committed = waiting.reduce((sum, r) => sum + lineTotal(r), 0)

  const rowProps = (row: PurchaseRequest) => ({
    row,
    showTeam: !departmentId,
    canDecide: mayDecide(row),
    onDecide: (status: PurchaseRequest['status']) => decide.mutate({ id: row.id, status }),
    onPurchased: () => markPurchased.mutate(row),
    onEdit: mayEdit(row) ? () => setEditing(row) : undefined,
    onRemove: mayRemove(row) ? () => remove.mutate(row.id) : undefined,
    busy: decide.isPending || markPurchased.isPending || remove.isPending,
  })

  return (
    <div className="flex flex-col gap-5">
      {/* Approved and waiting to be bought, above the asking. Once somebody
          has said yes it is no longer a wish, and leaving it among the
          questions is how an agreed purchase sits for a month unbought. */}
      {waiting.length > 0 && (
        <section className="rounded-[var(--radius-card)] bg-surface-lowest p-5 hairline sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <div>
              <h2 className="text-headline-md">Purchase waitlist</h2>
              <p className="mt-1 text-label-md text-on-surface-faint">
                Agreed, and waiting to be bought. Buying it moves it onto the register.
              </p>
            </div>
            <span className="font-mono text-label-sm text-on-surface-variant">
              {waiting.length} waiting{committed > 0 ? ` · ${money(committed)}` : ''}
            </span>
          </div>
          <ul className="mt-3 flex flex-col gap-2.5">
            {waiting.map((row) => (
              <RequestRow key={row.id} {...rowProps(row)} />
            ))}
          </ul>
        </section>
      )}

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
        <div className="mt-4 border-t border-border-subtle pt-4">
          <RequestFields
            departmentId={departmentId}
            initial={emptyDraft()}
            submitLabel="Send request"
            pendingLabel="Sending…"
            pending={ask.isPending}
            onSubmit={(draft) => ask.mutate(draft)}
            onCancel={() => setAsking(false)}
          />
        </div>
      )}

      <QueryState isLoading={requestsQuery.isLoading} error={requestsQuery.error}>
        {wanted.length === 0 ? (
          <p className="mt-4 text-body-sm text-on-surface-variant">Nothing on the wishlist.</p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-baseline gap-x-2 font-mono text-label-sm text-on-surface-variant">
              <span>{wanted.length} open</span>
              {outstanding > 0 && (
                <>
                  <span aria-hidden="true" className="text-on-surface-faint">·</span>
                  <span>{money(outstanding)} asked for</span>
                </>
              )}
            </div>
            <ul className="mt-2 flex flex-col gap-2.5">
              {wanted.map((row) => (
                <RequestRow key={row.id} {...rowProps(row)} />
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
                  <RequestRow
                    key={row.id}
                    row={row}
                    showTeam={!departmentId}
                    canDecide={false}
                    onEdit={mayEdit(row) ? () => setEditing(row) : undefined}
                    onRemove={mayRemove(row) ? () => remove.mutate(row.id) : undefined}
                    busy={remove.isPending}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </QueryState>
    </section>

      {editing && (
        <Overlay onDismiss={() => setEditing(null)} label={`Edit the request for ${editing.item_name}`}>
          <div className="w-full max-w-2xl rounded-[var(--radius-card)] bg-surface-container p-5 shadow-[var(--shadow-lifted)] sm:p-6">
            <h3 className="text-headline-md">Edit request</h3>
            <p className="mt-1 text-label-md text-on-surface-faint">
              What is filled in here is what the register gets when it is bought.
            </p>
            {error && (
              <p className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
                {error}
              </p>
            )}
            <div className="mt-4">
              <RequestFields
                departmentId={editing.department_id}
                initial={draftFrom(editing)}
                submitLabel="Save changes"
                pendingLabel="Saving…"
                pending={edit.isPending}
                onSubmit={(draft) => edit.mutate({ id: editing.id, draft })}
                onCancel={() => setEditing(null)}
              />
            </div>
          </div>
        </Overlay>
      )}
    </div>
  )
}

/**
 * What a request asks for — the same questions the add-item form asks.
 *
 * They match on purpose. Every field left out here was a field somebody
 * had to fill in a second time when the thing arrived, from facts they
 * were not in the room for, so the register ended up with blanks in it.
 * One form, used both for asking and for correcting.
 */
function RequestFields({
  departmentId,
  initial,
  submitLabel,
  pendingLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  departmentId: string
  initial: RequestDraft
  submitLabel: string
  pendingLabel: string
  pending: boolean
  onSubmit: (draft: RequestDraft) => void
  onCancel: () => void
}) {
  const categories: InventoryCategory[] = useCategories(departmentId)
  const [draft, setDraft] = useState<RequestDraft>(initial)
  const set = <K extends keyof RequestDraft>(key: K, value: RequestDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        if (draft.itemName.trim()) onSubmit(draft)
      }}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      <Field label="Kind" hint="An asset keeps its own tag; a consumable is counted and reordered.">
        <div className="flex rounded-full p-0.5 ring-1 ring-black/8 dark:ring-white/10">
          {(['asset', 'consumable'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => set('kind', k)}
              className={`flex-1 rounded-full px-3 py-1.5 text-body-sm capitalize transition-all duration-500 ease-[var(--ease-glide)] ${
                draft.kind === k ? 'bg-primary text-on-primary' : 'text-on-surface-variant'
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </Field>

      <Field label="What is needed">
        <input
          value={draft.itemName}
          onChange={(e) => set('itemName', e.target.value)}
          placeholder="Radio mic, spare XLR cables…"
          className={inputClasses}
        />
      </Field>

      {/* Only when the team has shelves to file onto. A picker whose one
          option is "Uncategorised" is a question with a single answer. */}
      {categories.length > 0 && (
        <Field label="Category" hint="Which shelf it will be filed on.">
          <Select
            value={draft.categoryId}
            onChange={(value) => set('categoryId', value)}
            options={categoryOptions(categories)}
            aria-label="Category for the requested item"
          />
        </Field>
      )}

      {/* Not the shelf — that is the picker above. This is the word the
          asset tag is minted from when it is bought. */}
      <Field label="Tag word" hint="Three letters of this become the middle of the tag — MEM in MED-MEM-0001.">
        <input
          value={draft.category}
          onChange={(e) => set('category', e.target.value)}
          placeholder="Microphone"
          className={inputClasses}
        />
      </Field>

      <Field label="Brand" hint="Who makes it.">
        <input
          value={draft.brand}
          onChange={(e) => set('brand', e.target.value)}
          placeholder="Sennheiser"
          className={inputClasses}
        />
      </Field>

      {draft.kind === 'asset' ? (
        <>
          <Field label="Product / model" hint="The manufacturer's name for it.">
            <input
              value={draft.model}
              onChange={(e) => set('model', e.target.value)}
              placeholder="EW 100 G4"
              className={inputClasses}
            />
          </Field>
          <Field label="Serial number" hint="If it is already known — otherwise fill it in when it arrives.">
            <input
              value={draft.serial}
              onChange={(e) => set('serial', e.target.value)}
              className={inputClasses}
            />
          </Field>
        </>
      ) : (
        <Field label="Reorder at" hint="Flagged as low stock at or below this.">
          <NumberDial
            value={Number(draft.reorder) || 0}
            onChange={(next) => set('reorder', String(next))}
            min={0}
            max={50}
            majorEvery={5}
            label="Reorder at"
          />
        </Field>
      )}

      <Field label="How many">
        <NumberDial
          value={Number(draft.quantity) || 1}
          onChange={(next) => set('quantity', String(next))}
          min={1}
          max={draft.kind === 'consumable' ? 500 : 100}
          majorEvery={5}
          label="How many"
        />
      </Field>

      <Field label="Where it will live" hint="Optional — the cupboard or rack it belongs in.">
        <input
          value={draft.location}
          onChange={(e) => set('location', e.target.value)}
          placeholder="Storage cupboard A"
          className={inputClasses}
        />
      </Field>

      <Field label="Roughly what one costs (optional)" hint={valueHint(draft.quantity, draft.cost)}>
        <input
          type="number"
          min="0"
          step="0.01"
          value={draft.cost}
          onChange={(e) => set('cost', e.target.value)}
          className={inputClasses}
        />
      </Field>

      <Field label="Product page (optional)" className="sm:col-span-2">
        <input
          type="url"
          value={draft.url}
          onChange={(e) => set('url', e.target.value)}
          placeholder="https://…"
          className={inputClasses}
        />
      </Field>

      <Field label="Why (optional)" className="sm:col-span-2">
        <textarea
          value={draft.reason}
          onChange={(e) => set('reason', e.target.value)}
          rows={2}
          className={`${inputClasses} resize-y`}
        />
      </Field>

      <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-3 py-1.5 text-label-md text-on-surface-variant hover:text-on-surface"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending || !draft.itemName.trim()}
          className="tap rounded-full bg-primary px-4 py-1.5 text-label-md font-medium text-on-primary disabled:opacity-40"
        >
          {pending ? pendingLabel : submitLabel}
        </button>
      </div>
    </form>
  )
}

function RequestRow({
  row,
  showTeam,
  canDecide,
  onDecide,
  onPurchased,
  onEdit,
  onRemove,
  busy,
}: {
  row: PurchaseRequest
  showTeam: boolean
  canDecide: boolean
  onDecide?: (status: PurchaseRequest['status']) => void
  onPurchased?: () => void
  /** Given only to somebody allowed to correct this one. */
  onEdit?: () => void
  /** Given only to somebody allowed to take this off the list. */
  onRemove?: () => void
  busy: boolean
}) {
  const each = money(row.estimated_cost)
  // Ten screws at a pound each is ten pounds. Both numbers are shown,
  // because the one that gets typed in wrong is whichever is not.
  const total = row.estimated_cost == null ? null : money(Number(row.estimated_cost) * row.quantity)
  // What the register will get. Shown so the person approving can see it
  // is filled in — a blank here is a blank on the shelf later.
  const specifics = [
    row.brand,
    row.model,
    row.serial_number && `SN ${row.serial_number}`,
    row.location,
    row.kind === 'consumable' && row.reorder_level != null && `reorder at ${row.reorder_level}`,
  ].filter(Boolean) as string[]

  return (
    <li className="rounded-[var(--radius-row)] bg-raised p-3.5 hairline">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="min-w-0 break-words text-body-md font-medium text-on-surface">
          {row.item_name}
        </span>
        {row.quantity > 1 && (
          <span className="shrink-0 font-mono text-label-sm text-on-surface-variant">
            ×{row.quantity}
          </span>
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
            <span>
              {each} each
              {row.quantity > 1 && total ? ` · ${total} in all` : ''}
            </span>
          </>
        )}
        {row.decider && (
          <>
            <span aria-hidden="true">·</span>
            <span>{row.status === 'declined' ? 'Declined' : 'Decided'} by {row.decider.first_name} {row.decider.last_name}</span>
          </>
        )}
      </div>

      {specifics.length > 0 && (
        <p className="mt-1 break-words font-mono text-label-sm text-on-surface-faint">
          {specifics.join(' · ')}
        </p>
      )}

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

      {(onEdit || onRemove) && (
        <div className="mt-2 flex flex-wrap gap-3">
          {onEdit && (
            <button
              type="button"
              disabled={busy}
              onClick={onEdit}
              aria-label={`Edit the request for ${row.item_name}`}
              className="text-label-md text-on-surface-faint hover:text-on-surface disabled:opacity-40"
            >
              Edit
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onRemove()}
              aria-label={`Remove ${row.item_name} from the list`}
              className="text-label-md text-on-surface-faint hover:text-error disabled:opacity-40"
            >
              Remove
            </button>
          )}
        </div>
      )}
    </li>
  )
}
