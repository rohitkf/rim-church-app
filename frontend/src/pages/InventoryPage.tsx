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
        description="Every asset carries a tag, every movement is logged, and counts are verified by whoever last checked them."
        action={
          canManage ? (
            <ActionButton glyph="+" onClick={() => setAdding((v) => !v)}>
              {adding ? 'Close' : 'Add item'}
            </ActionButton>
          ) : null
        }
      />

      {error && (
        <p className="mb-5 rounded-xl bg-error-container px-3.5 py-2.5 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

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
                  {['Tag', 'Item', 'Status', 'Where / who', 'Last checked', ''].map((h) => (
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

                      <td className="px-4 py-3 align-top font-mono text-label-sm text-on-surface-variant">
                        {item.last_audited_at ? formatRelativeTime(item.last_audited_at) : 'never'}
                      </td>

                      <td className="px-4 py-3 align-top">
                        <RowActions
                          item={item}
                          canManage={canManage}
                          busy={act.isPending}
                          onAct={(fn, args) => act.mutate({ fn, args: { item_id: item.id, ...args } })}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </QueryState>
      </Card>

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

/** What this viewer can do to this item, right now. */
function RowActions({
  item,
  canManage,
  busy,
  onAct,
}: {
  item: InventoryItem
  canManage: boolean
  busy: boolean
  onAct: (fn: string, args: Record<string, unknown>) => void
}) {
  const status = statusOf(item)
  const kind = kindOf(item)
  const button =
    'rounded-full px-3 py-1.5 text-label-sm text-on-surface ring-1 ring-black/8 transition-all duration-500 ease-[var(--ease-glide)] hover:ring-black/20 active:scale-[0.98] disabled:opacity-40 dark:ring-white/10 dark:hover:ring-white/25'

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {kind === 'asset' && status === 'in_service' && (
        <button className={button} disabled={busy} onClick={() => onAct('inventory_check_out', {})}>
          Sign out
        </button>
      )}
      {kind === 'asset' && status === 'on_loan' && (
        <button className={button} disabled={busy} onClick={() => onAct('inventory_check_in', {})}>
          Return
        </button>
      )}
      {kind === 'consumable' && canManage && (
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
      <button className={button} disabled={busy} onClick={() => onAct('inventory_audit', {})}>
        Seen it
      </button>
      {canManage && status !== 'in_repair' && status !== 'retired' && (
        <button
          className={button}
          disabled={busy}
          onClick={() => onAct('inventory_set_status', { new_status: 'in_repair' })}
        >
          Repair
        </button>
      )}
      {canManage && status === 'in_repair' && (
        <button
          className={button}
          disabled={busy}
          onClick={() => onAct('inventory_set_status', { new_status: 'in_service' })}
        >
          Back in service
        </button>
      )}
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

        <div className="flex items-end sm:col-span-2 lg:col-span-3">
          <ActionButton type="submit" disabled={add.isPending || !name.trim()} glyph="+">
            {add.isPending ? 'Adding' : 'Add item'}
          </ActionButton>
        </div>
      </form>
    </Panel>
  )
}
