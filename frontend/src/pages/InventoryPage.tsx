import { type FormEvent, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { ActionButton, Card, Eyebrow, Field, PageHeader, Panel, inputClasses } from '../components/Surface'
import { StatusChip } from '../components/SectionPanel'
import { InventoryHistory } from '../components/InventoryHistory'
import { useErrorText } from '../lib/useErrorText'
import { todayIso } from '../lib/monthGrid'
import { formatRelativeTime } from '../lib/relativeTime'
import {
  formatMoney,
  itemValue,
  isLowStock,
  isOverdue,
  kindOf,
  matchesSearch,
  needsAttention,
  statusOf,
  summarise,
  STATUS_LABEL,
  STATUS_TONE,
} from '../lib/inventory'
import { departmentSchema, inventoryItemSchema, type Department, type InventoryItem } from '../lib/types'

type Filter = 'all' | 'assets' | 'consumables' | 'out' | 'attention'

async function fetchDepartment(id: string): Promise<Department | null> {
  const { data, error } = await supabase.from('departments').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? departmentSchema.parse(data) : null
}

async function fetchItems(departmentId: string): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*, holder:profiles!inventory_items_held_by_fkey(id, first_name, last_name)')
    .eq('department_id', departmentId)
    .order('asset_tag', { nullsFirst: false })
  if (error) throw error
  return z.array(inventoryItemSchema).parse(data)
}

export function InventoryPage() {
  const { id } = useParams<{ id: string }>()
  const { isAdmin, isDepartmentHead } = useAuth()
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const today = todayIso()

  // Heads and their assisting heads own the register; everyone on the team
  // can sign kit out, bring it back, and record a count.
  const canManage = isAdmin || (!!id && isDepartmentHead(id))

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [openItem, setOpenItem] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<InventoryItem | null>(null)
  const [deleting, setDeleting] = useState<InventoryItem | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data])
  const summary = useMemo(() => summarise(items, today), [items, today])

  const shown = useMemo(
    () =>
      items.filter((item) => {
        if (!matchesSearch(item, search)) return false
        if (filter === 'assets') return kindOf(item) === 'asset'
        if (filter === 'consumables') return kindOf(item) === 'consumable'
        if (filter === 'out') return statusOf(item) === 'on_loan'
        if (filter === 'attention') return needsAttention(item, today)
        return true
      }),
    [items, search, filter, today],
  )

  const refresh = () => {
    setError(null)
    queryClient.invalidateQueries({ queryKey: ['inventory-items', id] })
    queryClient.invalidateQueries({ queryKey: ['inventory-events'] })
  }

  /** Every movement goes through a database function, never a bare update. */
  const act = useMutation({
    mutationFn: async ({ fn, args }: { fn: string; args: Record<string, unknown> }) => {
      const { error } = await supabase.rpc(fn, args)
      if (error) throw error
    },
    onSuccess: refresh,
    onError: (err: unknown) => setError(errorText(err, 'That did not go through.')),
  })

  const FILTERS: { value: Filter; label: string; count?: number }[] = [
    { value: 'all', label: 'Everything', count: items.length },
    { value: 'assets', label: 'Assets', count: summary.assets },
    { value: 'consumables', label: 'Consumables', count: summary.consumables },
    { value: 'out', label: 'Signed out', count: summary.onLoan },
    { value: 'attention', label: 'Needs attention', count: summary.attention },
  ]

  return (
    <div>
      <Link
        to="/inventory"
        className="text-body-sm text-secondary transition-opacity duration-300 ease-[var(--ease-glide)] hover:opacity-80"
      >
        ← All teams
      </Link>

      <PageHeader
        eyebrow="Equipment register"
        title={`${deptQuery.data?.name ?? 'Team'} inventory`}
        description={
          canManage
            ? 'Every asset carries a tag, every movement is logged, and counts are verified by whoever last checked them.'
            : "Anyone signed in can see what the church owns and where it lives. Changes are the team head's."
        }
        action={
          canManage ? (
            <ActionButton glyph="+" onClick={() => setAdding((v) => !v)}>
              {adding ? 'Close' : 'Add item'}
            </ActionButton>
          ) : (
            <StatusChip>View only</StatusChip>
          )
        }
      />

      {error && (
        <p className="mb-5 rounded-xl bg-error-container px-3.5 py-2.5 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'In service', value: String(summary.assets + summary.consumables - summary.attention) },
          { label: 'Signed out', value: String(summary.onLoan) },
          { label: 'Needs attention', value: String(summary.attention) },
          { label: 'Value in service', value: formatMoney(summary.value) },
        ].map((tile) => (
          <Card key={tile.label}>
            <div className="px-4 py-3.5">
              <Eyebrow>{tile.label}</Eyebrow>
              <div className="mt-1.5 text-headline-md tabular-nums">{tile.value}</div>
            </div>
          </Card>
        ))}
      </div>

      {adding && canManage && id && (
        <AddItemForm departmentId={id} onDone={() => { setAdding(false); refresh() }} onError={setError} />
      )}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tag, name, model, serial or location…"
          aria-label="Search the register"
          className={`${inputClasses} max-w-sm`}
        />
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`rounded-full px-3.5 py-1.5 text-body-sm transition-all duration-500 ease-[var(--ease-glide)] ${
                filter === f.value
                  ? 'bg-primary text-on-primary shadow-[var(--shadow-ambient)]'
                  : 'text-on-surface-variant ring-1 ring-black/8 hover:text-on-surface dark:ring-white/10'
              }`}
            >
              {f.label}
              {typeof f.count === 'number' && (
                <span className="ml-1.5 font-mono text-label-sm opacity-70">{f.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <QueryState
          isLoading={itemsQuery.isLoading}
          error={itemsQuery.error}
          isEmpty={shown.length === 0}
          emptyMessage={
            items.length === 0
              ? 'Nothing on the register yet.'
              : 'Nothing matches that.'
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead>
                <tr className="border-b border-black/5 dark:border-white/8">
                  {['Tag', 'Item', 'Status', 'Where / who', 'Value', 'Last checked', ...(canManage ? [''] : [])].map((h) => (
                    <th key={h} className="px-4 py-3">
                      <Eyebrow>{h}</Eyebrow>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((item) => {
                  const status = statusOf(item)
                  const kind = kindOf(item)
                  const low = isLowStock(item)
                  const overdue = isOverdue(item, today)

                  return (
                    <tr
                      key={item.id}
                      className="border-b border-black/5 last:border-0 transition-colors duration-300 ease-[var(--ease-glide)] hover:bg-surface-low dark:border-white/8"
                    >
                      <td className="px-4 py-3 align-top">
                        <span className="font-mono text-label-sm text-on-surface">
                          {item.asset_tag ?? '—'}
                        </span>
                      </td>

                      <td className="px-4 py-3 align-top">
                        <button
                          type="button"
                          onClick={() => setOpenItem(openItem === item.id ? null : item.id)}
                          className="text-left text-body-md text-on-surface transition-colors duration-300 hover:text-secondary"
                        >
                          {item.name}
                        </button>
                        <div className="text-label-sm text-on-surface-variant">
                          {[item.model, item.serial_number && `SN ${item.serial_number}`]
                            .filter(Boolean)
                            .join(' · ') || (kind === 'consumable' ? 'Consumable' : 'Asset')}
                        </div>
                      </td>

                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusChip tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusChip>
                          {overdue && <StatusChip tone="bad">Overdue</StatusChip>}
                          {low && <StatusChip tone="warn">Low stock</StatusChip>}
                        </div>
                        {kind === 'consumable' && (
                          <div className="mt-1.5 font-mono text-label-sm text-on-surface-variant">
                            {item.quantity} in stock
                            {typeof item.reorder_level === 'number' && ` · reorder at ${item.reorder_level}`}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 align-top text-body-sm text-on-surface-variant">
                        {status === 'on_loan' && item.holder
                          ? `${item.holder.first_name} ${item.holder.last_name}`
                          : (item.location ?? '—')}
                        {item.due_back && status === 'on_loan' && (
                          <div className="font-mono text-label-sm">due {item.due_back}</div>
                        )}
                      </td>

                      <td className="px-4 py-3 align-top font-mono text-label-sm tabular-nums text-on-surface-variant">
                        {itemValue(item) > 0 ? (
                          formatMoney(itemValue(item))
                        ) : item.estimated_cost ? (
                          <span title="Not counted — the item isn't in service">—</span>
                        ) : (
                          '—'
                        )}
                      </td>

                      <td className="px-4 py-3 align-top font-mono text-label-sm text-on-surface-variant">
                        {item.last_audited_at ? formatRelativeTime(item.last_audited_at) : 'never'}
                      </td>

                      {canManage && (
                      <td className="px-4 py-3 align-top">
                        <RowActions
                          item={item}
                          canManage={canManage}
                          busy={act.isPending}
                          onAct={(fn, args) => act.mutate({ fn, args: { item_id: item.id, ...args } })}
                          onEdit={() => setEditing(item)}
                          onDelete={() => setDeleting(item)}
                        />
                      </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </QueryState>
      </Card>

      {editing && canManage && (
        <EditItemDialog
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refresh()
          }}
          onError={setError}
        />
      )}

      {deleting && canManage && (
        <DeleteItemDialog
          item={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null)
            setOpenItem(null)
            refresh()
          }}
          onError={setError}
        />
      )}

      {openItem && (
        <div className="mt-6">
          <InventoryHistory
            itemId={openItem}
            title={items.find((i) => i.id === openItem)?.name ?? 'Item'}
            onClose={() => setOpenItem(null)}
          />
        </div>
      )}
    </div>
  )
}

/**
 * What this viewer can do to this item, right now.
 *
 * Only the team head and Admin can change anything; for everyone else the
 * register is a reference, and no button appears that would refuse them.
 */
function RowActions({
  item,
  canManage,
  busy,
  onAct,
  onEdit,
  onDelete,
}: {
  item: InventoryItem
  canManage: boolean
  busy: boolean
  onAct: (fn: string, args: Record<string, unknown>) => void
  onEdit: () => void
  onDelete: () => void
}) {
  if (!canManage) return null

  const status = statusOf(item)
  const kind = kindOf(item)
  const button =
    'rounded-full px-3 py-1.5 text-label-sm text-on-surface ring-1 ring-black/8 transition-all duration-500 ease-[var(--ease-glide)] hover:ring-black/20 active:scale-[0.98] disabled:opacity-40 dark:ring-white/10 dark:hover:ring-white/25'

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {kind === 'asset' && status === 'in_service' && (
        <button
          className={button}
          disabled={busy}
          title="Record that this has left the building, and who has it"
          onClick={() => onAct('inventory_check_out', {})}
        >
          Sign out
        </button>
      )}
      {kind === 'asset' && status === 'on_loan' && (
        <button className={button} disabled={busy} onClick={() => onAct('inventory_check_in', {})}>
          Book back in
        </button>
      )}
      {kind === 'consumable' && (
        <>
          <button
            className={button}
            disabled={busy}
            aria-label={`Take one ${item.name}`}
            onClick={() => onAct('inventory_adjust_quantity', { delta: -1 })}
          >
            −1
          </button>
          <button
            className={button}
            disabled={busy}
            aria-label={`Add one ${item.name}`}
            onClick={() => onAct('inventory_adjust_quantity', { delta: 1 })}
          >
            +1
          </button>
        </>
      )}
      <button
        className={button}
        disabled={busy}
        title="Record that you have physically seen this item, and that it is as the register says. Updates Last checked."
        onClick={() => onAct('inventory_audit', {})}
      >
        Stock check
      </button>
      {status !== 'in_repair' && status !== 'retired' && (
        <button
          className={button}
          disabled={busy}
          onClick={() => onAct('inventory_set_status', { new_status: 'in_repair' })}
        >
          Repair
        </button>
      )}
      {status === 'in_repair' && (
        <button
          className={button}
          disabled={busy}
          onClick={() => onAct('inventory_set_status', { new_status: 'in_service' })}
        >
          Back in service
        </button>
      )}
      <button className={button} onClick={onEdit}>
        Edit
      </button>
      <button
        className="rounded-full px-3 py-1.5 text-label-sm text-on-surface-variant transition-colors duration-300 hover:text-error"
        onClick={onDelete}
      >
        Delete
      </button>
    </div>
  )
}

/** Adding to the register: an asset gets a tag, a consumable gets a level. */
function AddItemForm({
  departmentId,
  onDone,
  onError,
}: {
  departmentId: string
  onDone: () => void
  onError: (message: string) => void
}) {
  const errorText = useErrorText()
  const [kind, setKind] = useState<'asset' | 'consumable'>('asset')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [model, setModel] = useState('')
  const [serial, setSerial] = useState('')
  const [location, setLocation] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [reorder, setReorder] = useState('')
  const [cost, setCost] = useState('')

  const add = useMutation({
    mutationFn: async () => {
      // The tag is minted by the database so two people adding at once
      // can't be handed the same number.
      const { data: tag, error: tagError } = await supabase.rpc('next_asset_tag', {
        dept_id: departmentId,
        category: category.trim() || name.trim(),
      })
      if (tagError) throw tagError

      const { error } = await supabase.from('inventory_items').insert({
        department_id: departmentId,
        name: name.trim(),
        category: category.trim() || null,
        kind,
        asset_tag: tag,
        model: model.trim() || null,
        serial_number: serial.trim() || null,
        location: location.trim() || null,
        quantity: kind === 'consumable' ? Number(quantity) || 0 : 1,
        reorder_level: kind === 'consumable' && reorder ? Number(reorder) : null,
        estimated_cost: cost.trim() === '' ? null : Number(cost),
      })
      if (error) throw error
    },
    onSuccess: onDone,
    onError: (err: unknown) => onError(errorText(err, 'Could not add that item.')),
  })

  return (
    <Panel title="Add to the register" className="mb-6">
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          if (name.trim()) add.mutate()
        }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <Field label="Kind">
          <div className="flex rounded-full p-0.5 ring-1 ring-black/8 dark:ring-white/10">
            {(['asset', 'consumable'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`flex-1 rounded-full px-3 py-1.5 text-body-sm capitalize transition-all duration-500 ease-[var(--ease-glide)] ${
                  kind === k ? 'bg-primary text-on-primary' : 'text-on-surface-variant'
                }`}
              >
                {k}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Wireless mic pack" className={inputClasses} />
        </Field>

        <Field label="Category" hint="Three letters of this become the middle of the tag.">
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Microphone" className={inputClasses} />
        </Field>

        {kind === 'asset' ? (
          <>
            <Field label="Model">
              <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Sennheiser EW 100" className={inputClasses} />
            </Field>
            <Field label="Serial number" hint="The manufacturer's, if it has one.">
              <input value={serial} onChange={(e) => setSerial(e.target.value)} className={inputClasses} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Quantity">
              <input type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClasses} />
            </Field>
            <Field label="Reorder at" hint="Flagged as low stock at or below this.">
              <input type="number" min="0" value={reorder} onChange={(e) => setReorder(e.target.value)} className={inputClasses} />
            </Field>
          </>
        )}

        <Field label="Where it lives">
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Storage cupboard A" className={inputClasses} />
        </Field>

        <Field
          label="Estimated cost"
          hint={kind === 'consumable' ? 'Per unit.' : 'What replacing it would cost.'}
        >
          <input
            type="number"
            min="0"
            step="0.01"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="0"
            className={inputClasses}
          />
        </Field>

        <div className="flex items-end sm:col-span-2 lg:col-span-3">
          <ActionButton type="submit" disabled={add.isPending || !name.trim()} glyph="+">
            {add.isPending ? 'Adding' : 'Add item'}
          </ActionButton>
        </div>
      </form>
    </Panel>
  )
}

/** Correcting the register: the details, the price, where it lives. */
function EditItemDialog({
  item,
  onClose,
  onSaved,
  onError,
}: {
  item: InventoryItem
  onClose: () => void
  onSaved: () => void
  onError: (message: string) => void
}) {
  const errorText = useErrorText()
  const [name, setName] = useState(item.name)
  const [model, setModel] = useState(item.model ?? '')
  const [serial, setSerial] = useState(item.serial_number ?? '')
  const [location, setLocation] = useState(item.location ?? '')
  const [cost, setCost] = useState(item.estimated_cost != null ? String(item.estimated_cost) : '')
  const [quantity, setQuantity] = useState(String(item.quantity))
  const [reorder, setReorder] = useState(item.reorder_level != null ? String(item.reorder_level) : '')

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('inventory_items')
        .update({
          name: name.trim(),
          model: model.trim() || null,
          serial_number: serial.trim() || null,
          location: location.trim() || null,
          estimated_cost: cost.trim() === '' ? null : Number(cost),
          // The count itself is moved by adjust/audit so it stays in the
          // ledger; here it is only editable for a consumable's setup.
          quantity: kindOf(item) === 'consumable' ? Number(quantity) || 0 : item.quantity,
          reorder_level: kindOf(item) === 'consumable' && reorder.trim() !== '' ? Number(reorder) : null,
        })
        .eq('id', item.id)
      if (error) throw error
    },
    onSuccess: onSaved,
    onError: (err: unknown) => onError(errorText(err, 'Could not save those changes.')),
  })

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-item-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
    >
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          if (name.trim()) save.mutate()
        }}
        className="w-full max-w-xl rounded-[var(--radius-shell)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12"
      >
        <Eyebrow>{item.asset_tag ?? 'Item'}</Eyebrow>
        <h2 id="edit-item-title" className="mt-1 text-headline-md">
          Edit {item.name}
        </h2>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClasses} />
          </Field>
          <Field label="Where it lives">
            <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputClasses} />
          </Field>

          {kindOf(item) === 'asset' ? (
            <>
              <Field label="Model">
                <input value={model} onChange={(e) => setModel(e.target.value)} className={inputClasses} />
              </Field>
              <Field label="Serial number">
                <input value={serial} onChange={(e) => setSerial(e.target.value)} className={inputClasses} />
              </Field>
            </>
          ) : (
            <>
              <Field label="Quantity">
                <input type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClasses} />
              </Field>
              <Field label="Reorder at">
                <input type="number" min="0" value={reorder} onChange={(e) => setReorder(e.target.value)} className={inputClasses} />
              </Field>
            </>
          )}

          <Field
            label="Estimated cost"
            hint={
              kindOf(item) === 'consumable'
                ? 'Per unit — the total counts cost × quantity.'
                : 'What it would cost to replace. Only counted while the item is in service.'
            }
          >
            <input
              type="number"
              min="0"
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className={inputClasses}
            />
          </Field>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2.5 text-body-sm font-medium text-on-surface ring-1 ring-black/8 transition-all duration-500 ease-[var(--ease-glide)] hover:ring-black/20 dark:ring-white/10"
          >
            Cancel
          </button>
          <ActionButton type="submit" disabled={save.isPending || !name.trim()} glyph="✓">
            {save.isPending ? 'Saving' : 'Save changes'}
          </ActionButton>
        </div>
      </form>
    </div>
  )
}

/**
 * Removing an item. Deleting takes its history with it, so retiring is
 * offered alongside — it keeps the trail and stops counting the value.
 */
function DeleteItemDialog({
  item,
  onClose,
  onDeleted,
  onError,
}: {
  item: InventoryItem
  onClose: () => void
  onDeleted: () => void
  onError: (message: string) => void
}) {
  const errorText = useErrorText()

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('inventory_items').delete().eq('id', item.id)
      if (error) throw error
    },
    onSuccess: onDeleted,
    onError: (err: unknown) => onError(errorText(err, 'Could not delete that item.')),
  })

  const retire = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('inventory_set_status', {
        item_id: item.id,
        new_status: 'retired',
        note: 'Retired from the register',
      })
      if (error) throw error
    },
    onSuccess: onDeleted,
    onError: (err: unknown) => onError(errorText(err, 'Could not retire that item.')),
  })

  const busy = remove.isPending || retire.isPending

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-item-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-[var(--radius-shell)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12">
        <h2 id="delete-item-title" className="text-headline-md">
          Remove {item.name}?
        </h2>
        <p className="mt-2 text-body-sm text-on-surface-variant">
          Deleting takes its whole history with it — every sign-out, repair and stock check. If it
          is simply gone or beyond use, retiring keeps the record and stops it counting toward the
          team's value.
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2.5 text-body-sm font-medium text-on-surface ring-1 ring-black/8 transition-all duration-500 ease-[var(--ease-glide)] hover:ring-black/20 dark:ring-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => retire.mutate()}
            disabled={busy}
            className="rounded-full px-4 py-2.5 text-body-sm font-medium text-on-surface ring-1 ring-black/8 transition-all duration-500 ease-[var(--ease-glide)] hover:ring-black/20 disabled:opacity-50 dark:ring-white/10"
          >
            {retire.isPending ? 'Retiring…' : 'Retire instead'}
          </button>
          <button
            type="button"
            onClick={() => remove.mutate()}
            disabled={busy}
            className="rounded-full bg-error px-5 py-2.5 text-body-sm font-medium text-on-error shadow-[var(--shadow-ambient)] transition-transform duration-500 ease-[var(--ease-glide)] active:scale-[0.98] disabled:opacity-50"
          >
            {remove.isPending ? 'Deleting…' : 'Delete for good'}
          </button>
        </div>
      </div>
    </div>
  )
}
