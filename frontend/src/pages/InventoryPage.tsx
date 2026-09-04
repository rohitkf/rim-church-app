import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ItemDocuments } from '../components/ItemDocuments'
import { NumberDial } from '../components/NumberDial'
import { PurchaseRequests } from '../components/PurchaseRequests'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { ActionButton, Card, Eyebrow, Field, PageHeader, Panel, inputClasses } from '../components/Surface'
import { StatusChip } from '../components/SectionPanel'
import { InventoryHistory } from '../components/InventoryHistory'
import { ItemQrDialog } from '../components/ItemQrDialog'
import { LabelSheetDialog } from '../components/LabelSheetDialog'
import { QrScanner } from '../components/QrScanner'
import { Overlay } from '../components/Surface'
import {
  categoryOptions,
  groupByCategory,
  rowsForGroups,
  worthGrouping,
} from '../lib/inventoryCategories'
import { inventoryCategorySchema, type InventoryCategory } from '../lib/types'
import { InventoryCategoriesBar } from '../components/InventoryCategoriesBar'
import { Select } from '../components/Select'
import { useErrorText } from '../lib/useErrorText'
import { todayIso } from '../lib/monthGrid'
import { formatRelativeTime } from '../lib/relativeTime'
import {
  formatMoney,
  itemValue,
  isLowStock,
  isOverdue,
  kindOf,
  matchesFilter,
  matchesSearch,
  statusOf,
  summarise,
  unitCostLabel,
  valueHint,
  filterCounts,
  FILTER_LABEL,
  FILTER_MEANING,
  FILTER_ORDER,
  STATUS_LABEL,
  STATUS_TONE,
  type InventoryFilter,
} from '../lib/inventory'
import { departmentSchema, inventoryItemSchema, type Department, type InventoryItem } from '../lib/types'

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
  const [docsFor, setDocsFor] = useState<InventoryItem | null>(null)

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<InventoryFilter>('all')
  const [openItem, setOpenItem] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [qrFor, setQrFor] = useState<InventoryItem | null>(null)
  // Ticked for a bulk label run. Ids rather than items, so the set survives
  // the list refreshing underneath it.
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  // Off until asked for: a tick box against every row is clutter on a page
  // whose everyday job is signing kit in and out, not printing.
  const [picking, setPicking] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [scanning, setScanning] = useState(false)
  // The item a scan landed on, whether from the camera here or from a
  // phone's own camera opening /inventory/scan/<id>.
  const [scanned, setScanned] = useState<string | null>(null)
  const [urlParams, setUrlParams] = useSearchParams()

  const scanParam = urlParams.get('item')
  useEffect(() => {
    if (!scanParam) return
    setScanned(scanParam)
    const next = new URLSearchParams(urlParams)
    next.delete('item')
    setUrlParams(next, { replace: true })
  }, [scanParam, urlParams, setUrlParams])
  /*
   * Which shelves are open. Empty means all shut, which is where the page
   * starts: every heading opened at once is the flat list the shelves were
   * meant to break up, and a heading you can read in one glance — its
   * count and what it is worth — is most of what somebody scrolling was
   * after anyway.
   */
  const [openCategories, setOpenCategories] = useState<ReadonlySet<string>>(new Set())
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
      items.filter((item) => matchesSearch(item, search) && matchesFilter(item, filter, today)),
    [items, search, filter, today],
  )

  const categoriesQuery = useQuery({
    queryKey: ['inventory-categories', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_categories')
        .select('id, department_id, name, sort_order')
        .eq('department_id', id!)
      if (error) throw error
      return z.array(inventoryCategorySchema).parse(data)
    },
    enabled: !!id,
  })
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data])

  /*
   * The register, split onto its shelves.
   *
   * A team that has named none keeps the plain list it has always had: one
   * heading over the only group on the page labels a distinction that does
   * not exist. Empty shelves are dropped for anybody who cannot fill them,
   * since to a reader they are just a word with nothing under it.
   */
  const itemsPerCategory = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of items) {
      if (item.category_id) counts.set(item.category_id, (counts.get(item.category_id) ?? 0) + 1)
    }
    return counts
  }, [items])

  const grouped = useMemo(() => {
    if (!worthGrouping(categories)) return null
    const groups = groupByCategory(shown, categories)
    return canManage ? groups : groups.filter((g) => g.items.length > 0)
  }, [shown, categories, canManage])

  // Only what is on screen can be ticked, so a filtered-out item can never
  // ride along into a print run the user cannot see.
  // While somebody is searching or filtering, every shelf is open: a
  // heading with a count and nothing under it is not an answer to "where
  // is the memory card".
  const searching = search.trim() !== '' || filter !== 'all'

  // A heading with no id is the Uncategorised run; it opens and closes
  // like any other, under a key of its own.
  const keyOf = (id: string | null) => id ?? 'uncategorised'
  const isCategoryOpen = (id: string | null) => searching || openCategories.has(keyOf(id))
  const toggleCategory = (id: string | null) =>
    setOpenCategories((current) => {
      const next = new Set(current)
      if (!next.delete(keyOf(id))) next.add(keyOf(id))
      return next
    })

  const pickedItems = useMemo(() => shown.filter((item) => picked.has(item.id)), [shown, picked])
  const allShownPicked = shown.length > 0 && shown.every((item) => picked.has(item.id))

  const togglePick = (itemId: string) =>
    setPicked((current) => {
      const next = new Set(current)
      if (!next.delete(itemId)) next.add(itemId)
      return next
    })

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

  // The chips and their numbers come from the same rule, so pressing one
  // always shows exactly as many rows as it said it would.
  const chipCounts = useMemo(() => filterCounts(items, today), [items, today])

  return (
    <div>
      <Link
        to="/inventory"
        className="tap inline-flex items-center text-body-sm text-secondary transition-opacity duration-300 ease-[var(--ease-glide)] hover:opacity-80"
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
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton tone="quiet" onClick={() => setScanning(true)}>
              Scan
            </ActionButton>
            {canManage && (
              <ActionButton
                tone="quiet"
                onClick={() => {
                  setPicking((v) => !v)
                  setPicked(new Set())
                }}
              >
                {picking ? 'Done' : 'Print QR codes'}
              </ActionButton>
            )}
            {canManage ? (
              <ActionButton glyph="+" onClick={() => setAdding((v) => !v)}>
                {adding ? 'Close' : 'Add item'}
              </ActionButton>
            ) : (
              <StatusChip>View only</StatusChip>
            )}
          </div>
        }
      />

      {error && (
        <p className="mb-5 rounded-xl bg-error-container px-3.5 py-2.5 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'In service', value: String(summary.inService) },
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
        <AddItemForm
          departmentId={id}
          categories={categories}
          onDone={() => { setAdding(false); refresh() }}
          onError={setError}
        />
      )}

      {canManage && id && (
        <InventoryCategoriesBar
          departmentId={id}
          categories={categories}
          counts={itemsPerCategory}
          onError={setError}
        />
      )}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tag, name, brand, model, serial or location…"
          aria-label="Search the register"
          className={`${inputClasses} max-w-sm`}
        />
        <div className="flex flex-wrap gap-1.5">
          {FILTER_ORDER.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              title={FILTER_MEANING[f]}
              aria-pressed={filter === f}
              className={`tap rounded-full px-3.5 py-1.5 text-body-sm transition-all duration-500 ease-[var(--ease-glide)] ${
                filter === f
                  ? 'bg-primary text-on-primary shadow-[var(--shadow-ambient)]'
                  : 'text-on-surface-variant ring-1 ring-black/8 hover:text-on-surface dark:ring-white/10'
              }`}
            >
              {FILTER_LABEL[f]}
              <span className="ml-1.5 font-mono text-label-sm opacity-70">{chipCounts[f]}</span>
            </button>
          ))}
        </div>
        {/* What the chip you are on actually means. Five words and five
            numbers said nothing about why a camera is one pile and gaffer
            tape another, and nobody can trust a filter they cannot read. */}
        <p className="w-full text-label-md text-on-surface-faint">{FILTER_MEANING[filter]}</p>
      </div>

      {picking && canManage && shown.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-[var(--radius-chip)] hairline px-3.5 py-2.5">
          <label className="flex items-center gap-2.5 text-body-sm text-on-surface">
            <input
              type="checkbox"
              checked={allShownPicked}
              onChange={() =>
                setPicked(allShownPicked ? new Set() : new Set(shown.map((item) => item.id)))
              }
              className="size-4 shrink-0 accent-[var(--color-primary)]"
            />
            Select all {shown.length === items.length ? '' : 'shown '}
          </label>

          <span className="font-mono text-label-sm tabular-nums text-on-surface-variant">
            {pickedItems.length} selected
          </span>

          {pickedItems.length > 0 && (
            <button
              type="button"
              onClick={() => setPicked(new Set())}
              className="tap rounded-full px-3 py-1.5 text-body-sm text-on-surface-variant hover:text-on-surface"
            >
              Clear
            </button>
          )}

          <button
            type="button"
            onClick={() => setPrinting(true)}
            disabled={pickedItems.length === 0}
            className="tap ml-auto rounded-full bg-primary px-4 py-2 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-40"
          >
            Preview labels
          </button>
        </div>
      )}

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
          {/*
            Six columns need 820px. Rather than hand a phone a sideways
            scroll with the actions column parked off the edge, each item
            becomes a card below `lg` — the same fields, stacked and
            labelled, with nothing out of reach.
          */}
          <ul className="flex flex-col gap-3 p-4 lg:hidden">
            {rowsForGroups(grouped, shown, itemValue, isCategoryOpen).map((row) => {
              if (row.kind === 'heading') {
                return (
                  <li key={`heading-${row.id ?? 'loose'}`} className="mt-2 first:mt-0">
                    <button
                      type="button"
                      onClick={() => toggleCategory(row.id)}
                      aria-expanded={isCategoryOpen(row.id)}
                      disabled={searching}
                      className="tap flex w-full items-center gap-2 border-b border-border-subtle pb-1.5 text-left"
                    >
                      <CategoryChevron open={isCategoryOpen(row.id)} />
                      <span className="font-mono text-label-sm uppercase tracking-[0.14em] text-on-surface-variant">
                        {row.name}
                      </span>
                      <span className="font-mono text-label-sm text-on-surface-faint">
                        {row.count}
                      </span>
                      {/* What the shelf is worth, on the same line as what
                          is on it — a category is a budget as much as a
                          place. */}
                      {row.value > 0 && (
                        <span className="ml-auto font-mono text-label-sm tabular-nums text-on-surface-faint">
                          {formatMoney(row.value)}
                        </span>
                      )}
                    </button>
                  </li>
                )
              }
              const item = row.item
              const status = statusOf(item)
              const kind = kindOf(item)
              const low = isLowStock(item)
              const overdue = isOverdue(item, today)
              const whereWho =
                status === 'on_loan' && item.holder
                  ? `${item.holder.first_name} ${item.holder.last_name}`
                  : (item.location ?? '—')

              return (
                <li key={item.id} className="rounded-[var(--radius-chip)] hairline p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {picking && canManage && (
                      <input
                        type="checkbox"
                        checked={picked.has(item.id)}
                        onChange={() => togglePick(item.id)}
                        aria-label={`Select ${item.name} for printing`}
                        className="mr-1 size-4 shrink-0 accent-[var(--color-primary)]"
                      />
                    )}
                    <StatusChip tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusChip>
                    {overdue && <StatusChip tone="bad">Overdue</StatusChip>}
                    {low && <StatusChip tone="warn">Low stock</StatusChip>}
                    <span className="ml-auto font-mono text-label-sm text-on-surface-variant">
                      {item.asset_tag ?? '—'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setOpenItem(openItem === item.id ? null : item.id)}
                    className="tap mt-2 block text-left text-body-md text-on-surface transition-colors duration-300 hover:text-secondary"
                  >
                    {item.name}
                  </button>
                  <div className="text-label-sm text-on-surface-variant">
                    {[
                      [item.brand, item.model].filter(Boolean).join(' '),
                      item.serial_number && `SN ${item.serial_number}`,
                    ]
                      .filter(Boolean)
                      .join(' · ') || (kind === 'consumable' ? 'Consumable' : 'Asset')}
                  </div>
                  {kind === 'consumable' && (
                    <div className="mt-1 font-mono text-label-sm text-on-surface-variant">
                      {item.quantity} in stock
                      {typeof item.reorder_level === 'number' && ` · reorder at ${item.reorder_level}`}
                      {unitCostLabel(item) && ` · ${unitCostLabel(item)}`}
                    </div>
                  )}

                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                    <div className="min-w-0">
                      <dt><Eyebrow>Where / who</Eyebrow></dt>
                      <dd className="break-words text-body-sm text-on-surface-variant">
                        {whereWho}
                        {item.due_back && status === 'on_loan' && (
                          <span className="block font-mono text-label-sm">due {item.due_back}</span>
                        )}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt><Eyebrow>Value</Eyebrow></dt>
                      <dd className="font-mono text-label-sm tabular-nums text-on-surface-variant">
                        {itemValue(item) > 0 ? formatMoney(itemValue(item)) : '—'}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt><Eyebrow>Last checked</Eyebrow></dt>
                      <dd className="font-mono text-label-sm text-on-surface-variant">
                        {item.last_audited_at ? formatRelativeTime(item.last_audited_at) : 'never'}
                      </dd>
                    </div>
                  </dl>

                  {canManage && (
                    <div className="mt-3">
                      <RowActions
                        item={item}
                        canManage={canManage}
                        busy={act.isPending}
                        onAct={(fn, args) => act.mutate({ fn, args: { item_id: item.id, ...args } })}
                        onEdit={() => setEditing(item)}
                        onDelete={() => setDeleting(item)}
                        onShowQr={() => setQrFor(item)}
                        onDocs={() => setDocsFor(item)}
                      />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead>
                <tr className="border-b border-black/5 dark:border-white/8">
                  {picking && canManage && (
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allShownPicked}
                        onChange={() =>
                          setPicked(allShownPicked ? new Set() : new Set(shown.map((i) => i.id)))
                        }
                        aria-label="Select every item shown for printing"
                        className="size-4 accent-[var(--color-primary)]"
                      />
                    </th>
                  )}
                  {['Tag', 'Item', 'Status', 'Where / who', 'Value', 'Last checked', ...(canManage ? [''] : [])].map((h) => (
                    <th key={h} className="px-4 py-3">
                      <Eyebrow>{h}</Eyebrow>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowsForGroups(grouped, shown, itemValue, isCategoryOpen).map((row) => {
                  if (row.kind === 'heading') {
                    return (
                      <tr key={`heading-${row.id ?? 'loose'}`} className="bg-surface-low">
                        <td colSpan={canManage ? 8 : 6} className="p-0">
                          <button
                            type="button"
                            onClick={() => toggleCategory(row.id)}
                            aria-expanded={isCategoryOpen(row.id)}
                            disabled={searching}
                            className="tap flex w-full items-center gap-2 px-4 py-2 text-left font-mono text-label-sm uppercase tracking-[0.14em] text-on-surface-variant"
                          >
                            <CategoryChevron open={isCategoryOpen(row.id)} />
                            {row.name}
                            <span className="text-on-surface-faint">{row.count}</span>
                            {row.value > 0 && (
                              <span className="ml-auto tabular-nums text-on-surface-faint">
                                {formatMoney(row.value)}
                              </span>
                            )}
                          </button>
                        </td>
                      </tr>
                    )
                  }
                  const item = row.item
                  const status = statusOf(item)
                  const kind = kindOf(item)
                  const low = isLowStock(item)
                  const overdue = isOverdue(item, today)

                  return (
                    <tr
                      key={item.id}
                      className="border-b border-black/5 last:border-0 transition-colors duration-300 ease-[var(--ease-glide)] hover:bg-surface-low dark:border-white/8"
                    >
                      {picking && canManage && (
                        <td className="px-4 py-3 align-top">
                          <input
                            type="checkbox"
                            checked={picked.has(item.id)}
                            onChange={() => togglePick(item.id)}
                            aria-label={`Select ${item.name} for printing`}
                            className="size-4 accent-[var(--color-primary)]"
                          />
                        </td>
                      )}
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
                          {[
                            [item.brand, item.model].filter(Boolean).join(' '),
                            item.serial_number && `SN ${item.serial_number}`,
                          ]
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
                            {unitCostLabel(item) && ` · ${unitCostLabel(item)}`}
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
                          onShowQr={() => setQrFor(item)}
                          onDocs={() => setDocsFor(item)}
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
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refresh()
          }}
          onError={setError}
        />
      )}

      {qrFor && <ItemQrDialog item={qrFor} onClose={() => setQrFor(null)} />}

      {printing && pickedItems.length > 0 && (
        <LabelSheetDialog items={pickedItems} onClose={() => setPrinting(false)} />
      )}

      {scanning && (
        <QrScanner
          onFound={(id) => {
            setScanning(false)
            setScanned(id)
          }}
          onClose={() => setScanning(false)}
        />
      )}

      {/* The wishlist sits under the shelf on purpose: what a team has and
          what it is still asking for are the same question at two points in
          time, and the money reads together. */}
      {id && (
        <div className="mt-8">
          <PurchaseRequests departmentId={id} departmentName={deptQuery.data?.name} />
        </div>
      )}

      {docsFor && (
        <Overlay label={`Paperwork for ${docsFor.name}`} onDismiss={() => setDocsFor(null)}>
          <div className="w-full max-w-lg rounded-[var(--radius-shell)] bg-surface-lowest p-2 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12">
            <div className="flex items-baseline justify-between gap-3 px-3 pt-3">
              <span className="min-w-0 break-words text-body-md font-medium text-on-surface">
                {docsFor.name}
              </span>
              <button
                type="button"
                onClick={() => setDocsFor(null)}
                className="tap shrink-0 text-label-md text-on-surface-variant hover:text-on-surface"
              >
                Close
              </button>
            </div>
            <div className="p-1">
              <ItemDocuments
                itemId={docsFor.id}
                departmentId={docsFor.department_id}
                canManage={canManage}
              />
            </div>
          </div>
        </Overlay>
      )}

      {scanned && (
        <ScannedItemDialog
          itemId={scanned}
          items={items}
          canManage={canManage}
          busy={act.isPending}
          onAct={(fn, args) => act.mutate({ fn, args: { item_id: scanned, ...args } })}
          onEdit={(item) => {
            setScanned(null)
            setEditing(item)
          }}
          onDelete={(item) => {
            setScanned(null)
            setDeleting(item)
          }}
          onShowQr={(item) => {
            setScanned(null)
            setQrFor(item)
          }}
          onDocs={(item) => {
            setScanned(null)
            setDocsFor(item)
          }}
          onClose={() => setScanned(null)}
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
/** Which way a shelf's heading points: shut, or opened downwards. */
function CategoryChevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width={12}
      height={12}
      className={`shrink-0 text-on-surface-faint transition-transform duration-300 ease-[var(--ease-glide)] ${
        open ? 'rotate-0' : '-rotate-90'
      }`}
    >
      <path
        d="M4 6.5 8 10.5 12 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function RowActions({
  item,
  canManage,
  busy,
  onAct,
  onEdit,
  onDelete,
  onShowQr,
  onDocs,
}: {
  item: InventoryItem
  canManage: boolean
  busy: boolean
  onAct: (fn: string, args: Record<string, unknown>) => void
  onEdit: () => void
  onDelete: () => void
  onShowQr: () => void
  onDocs: () => void
}) {
  if (!canManage) return null

  const status = statusOf(item)
  const kind = kindOf(item)
  // inline-flex rather than the default: this same pill is worn by the
  // Link anchor, and vertical padding on an inline element does not grow
  // its line box, so that one sat taller than the buttons beside it.
  const button =
    'tap inline-flex items-center justify-center rounded-full px-3 py-1.5 text-label-sm text-on-surface ring-1 ring-black/8 transition-all duration-500 ease-[var(--ease-glide)] hover:ring-black/20 active:scale-[0.98] disabled:opacity-40 dark:ring-white/10 dark:hover:ring-white/25'

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
      {item.product_url && (
        <a
          className={button}
          href={item.product_url}
          target="_blank"
          rel="noopener noreferrer"
          title="The page it was bought from"
        >
          Link
        </a>
      )}
      <button className={button} onClick={onDocs}>
        Paperwork
      </button>
      <button className={button} onClick={onShowQr}>
        QR
      </button>
      <button className={button} onClick={onEdit}>
        Edit
      </button>
      <button
        className="tap rounded-full px-3 py-1.5 text-label-sm text-on-surface-variant transition-colors duration-300 hover:text-error"
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
  categories,
  onDone,
  onError,
}: {
  departmentId: string
  categories: InventoryCategory[]
  onDone: () => void
  onError: (message: string) => void
}) {
  const errorText = useErrorText()
  const [kind, setKind] = useState<'asset' | 'consumable'>('asset')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  // The shelf to file it on. '' is Uncategorised, which is a real answer.
  const [categoryId, setCategoryId] = useState('')
  const [brand, setBrand] = useState('')
  const [productUrl, setProductUrl] = useState('')
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
        category_id: categoryId || null,
        kind,
        asset_tag: tag,
        brand: brand.trim() || null,
        product_url: productUrl.trim() || null,
        model: model.trim() || null,
        serial_number: serial.trim() || null,
        location: location.trim() || null,
        // However many there are, whatever the register calls it. This
        // used to force an asset to 1, so a pair of tripods entered as two
        // was saved as one and the value was half what the church owns.
        quantity: Math.max(Number(quantity) || (kind === 'consumable' ? 0 : 1), 0),
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

        {/* Only when the team has shelves to file onto. A picker whose one
            option is "Uncategorised" is a question with a single answer. */}
        {categories.length > 0 && (
          <Field label="Category" hint="Which shelf it is filed on.">
            <Select
              value={categoryId}
              onChange={setCategoryId}
              options={categoryOptions(categories)}
              aria-label="Category for the new item"
            />
          </Field>
        )}

        {/* Not the shelf — that is the picker above. This is the word the
            asset tag is minted from, asked for once and never again. */}
        <Field label="Tag word" hint="Three letters of this become the middle of the tag — MEM in MED-MEM-0001.">
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Microphone" className={inputClasses} />
        </Field>

        <Field label="Brand" hint="Who made it.">
          <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Sennheiser" className={inputClasses} />
        </Field>

        {/* The listing you bought it from: what you send somebody who asks
            for another one, and what you check before ordering a spare. */}
        <Field label="Product page" hint="A link to where it was bought, or the maker's page.">
          <input
            type="url"
            value={productUrl}
            onChange={(e) => setProductUrl(e.target.value)}
            placeholder="https://…"
            className={inputClasses}
          />
        </Field>

        {kind === 'asset' ? (
          <>
            <Field label="Product / model" hint="The manufacturer's name for it.">
              <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="EW 100 G4" className={inputClasses} />
            </Field>
            <Field label="Serial number" hint="The manufacturer's, if it has one.">
              <input value={serial} onChange={(e) => setSerial(e.target.value)} className={inputClasses} />
            </Field>
          </>
        ) : (
          <Field label="Reorder at" hint="Flagged as low stock at or below this.">
            <NumberDial
              value={Number(reorder) || 0}
              onChange={(next) => setReorder(String(next))}
              min={0}
              max={50}
              majorEvery={5}
              label="Reorder at"
            />
          </Field>
        )}

        {/* How many there are, on everything. A pair of tripods is two
            tripods whether the register files them as assets or not, and
            the value below counts them. */}
        <Field label="Number of units" hint="How many of it the church has.">
          <NumberDial
            value={Number(quantity) || 0}
            onChange={(next) => setQuantity(String(next))}
            min={kind === 'consumable' ? 0 : 1}
            max={kind === 'consumable' ? 500 : 100}
            majorEvery={5}
            label="Number of units"
          />
        </Field>

        <Field label="Where it lives">
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Storage cupboard A" className={inputClasses} />
        </Field>

        <Field label="Cost of one" hint={valueHint(quantity, cost)}>
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
  categories,
  onClose,
  onSaved,
  onError,
}: {
  item: InventoryItem
  categories: InventoryCategory[]
  onClose: () => void
  onSaved: () => void
  onError: (message: string) => void
}) {
  const errorText = useErrorText()
  const [name, setName] = useState(item.name)
  const [brand, setBrand] = useState(item.brand ?? '')
  const [productUrl, setProductUrl] = useState(item.product_url ?? '')
  const [model, setModel] = useState(item.model ?? '')
  const [serial, setSerial] = useState(item.serial_number ?? '')
  const [location, setLocation] = useState(item.location ?? '')
  const [cost, setCost] = useState(item.estimated_cost != null ? String(item.estimated_cost) : '')
  const [quantity, setQuantity] = useState(String(item.quantity))
  // '' is Uncategorised, which is a real answer rather than a missing one.
  const [categoryId, setCategoryId] = useState(item.category_id ?? '')
  const [reorder, setReorder] = useState(item.reorder_level != null ? String(item.reorder_level) : '')

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('inventory_items')
        .update({
          name: name.trim(),
          brand: brand.trim() || null,
          product_url: productUrl.trim() || null,
          model: model.trim() || null,
          serial_number: serial.trim() || null,
          location: location.trim() || null,
          estimated_cost: cost.trim() === '' ? null : Number(cost),
          category_id: categoryId || null,
          // Day-to-day movement of a count belongs to adjust/audit, which
          // write it to the ledger. This is the correction: what the church
          // actually has, on an asset as much as on a consumable.
          quantity: Math.max(Number(quantity) || 0, kindOf(item) === 'consumable' ? 0 : 1),
          reorder_level: kindOf(item) === 'consumable' && reorder.trim() !== '' ? Number(reorder) : null,
        })
        .eq('id', item.id)
      if (error) throw error
    },
    onSuccess: onSaved,
    onError: (err: unknown) => onError(errorText(err, 'Could not save those changes.')),
  })

  /*
   * This used to draw its own backdrop rather than using `Overlay`, and
   * so missed everything Overlay does: no Escape to close, no scroll lock
   * on the page behind, and no way to reach the ends of a form taller
   * than the phone. This is the longest form in the app, so it was the
   * one where all three mattered most.
   */
  return (
    <Overlay label={`Edit ${item.name}`} onDismiss={onClose}>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          if (name.trim()) save.mutate()
        }}
        className="w-full max-w-xl rounded-[var(--radius-shell)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12"
      >
        <Eyebrow>{item.asset_tag ?? 'Item'}</Eyebrow>
        <h2 className="mt-1 text-headline-md">Edit {item.name}</h2>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClasses} />
          </Field>
          <Field label="Where it lives">
            <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputClasses} />
          </Field>

          {/* Only when the team has shelves to file onto. A picker whose
              only option is "Uncategorised" is a question with one answer. */}
          {categories.length > 0 && (
            <Field label="Category" hint="Which shelf it is filed on.">
              <Select
                value={categoryId}
                onChange={setCategoryId}
                options={categoryOptions(categories)}
                aria-label={`Category for ${item.name}`}
              />
            </Field>
          )}

          <Field label="Brand">
            <input value={brand} onChange={(e) => setBrand(e.target.value)} className={inputClasses} />
          </Field>

          <Field label="Product page">
            <input
              type="url"
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              placeholder="https://…"
              className={inputClasses}
            />
          </Field>

          {kindOf(item) === 'asset' ? (
            <>
              <Field label="Product / model">
                <input value={model} onChange={(e) => setModel(e.target.value)} className={inputClasses} />
              </Field>
              <Field label="Serial number">
                <input value={serial} onChange={(e) => setSerial(e.target.value)} className={inputClasses} />
              </Field>
            </>
          ) : (
            <Field label="Reorder at">
              <NumberDial
                value={Number(reorder) || 0}
                onChange={(next) => setReorder(String(next))}
                min={0}
                max={50}
                majorEvery={5}
                label="Reorder at"
              />
            </Field>
          )}

          {/* On every item, asset included: a pair of tripods is two
              tripods, and the value counts them. Day-to-day movement of a
              consumable's count still belongs to +1/−1 and stock check,
              which write it to the ledger; this is for correcting it. */}
          <Field label="Number of units" hint="How many of it the church has.">
            <NumberDial
              value={Number(quantity) || 0}
              onChange={(next) => setQuantity(String(next))}
              min={kindOf(item) === 'consumable' ? 0 : 1}
              max={kindOf(item) === 'consumable' ? 500 : 100}
              majorEvery={5}
              label="Number of units"
            />
          </Field>

          <Field label="Cost of one" hint={valueHint(quantity, cost)}>
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
    </Overlay>
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
    <Overlay label={`Remove ${item.name}?`} onDismiss={onClose}>
      <div className="w-full max-w-md rounded-[var(--radius-shell)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12">
        <h2 className="text-headline-md">Remove {item.name}?</h2>
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
    </Overlay>
  )
}

/**
 * What a scan landed on, and what can be done about it.
 *
 * The buttons are the row's own `RowActions`, not a second set written for
 * this sheet: a scan should offer exactly what the register offers, and
 * two lists of actions would drift the first time one of them changed.
 *
 * A code can point at an item this register does not hold — someone
 * scanning a Media label while looking at Worship's page — so that is a
 * state worth naming rather than an empty sheet.
 */
function ScannedItemDialog({
  itemId,
  items,
  canManage,
  busy,
  onAct,
  onEdit,
  onDelete,
  onShowQr,
  onDocs,
  onClose,
}: {
  itemId: string
  items: InventoryItem[]
  canManage: boolean
  busy: boolean
  onAct: (fn: string, args: Record<string, unknown>) => void
  onEdit: (item: InventoryItem) => void
  onDelete: (item: InventoryItem) => void
  onShowQr: (item: InventoryItem) => void
  onDocs: (item: InventoryItem) => void
  onClose: () => void
}) {
  const item = items.find((i) => i.id === itemId) ?? null

  return (
    <Overlay label="Scanned item" align="sheet" onDismiss={onClose}>
      <div className="w-full rounded-t-[var(--radius-card)] bg-surface-lowest p-6 shadow-[inset_0_0_0_1px_var(--color-outline-variant),var(--shadow-lifted)] sm:max-w-md sm:rounded-[var(--radius-card)]">
        {item ? (
          <>
            <Eyebrow>Scanned</Eyebrow>
            <h2 className="mt-1 text-headline-md">{item.name}</h2>
            <p className="mt-1 font-mono text-label-sm text-on-surface-variant">
              {item.asset_tag ?? 'No asset tag'} · {STATUS_LABEL[statusOf(item)]}
            </p>
            {kindOf(item) === 'consumable' && (
              <p className="mt-1 font-mono text-label-sm text-on-surface-variant">
                {item.quantity} in stock
                {unitCostLabel(item) && ` · ${unitCostLabel(item)}`}
              </p>
            )}

            <div className="mt-5">
              {canManage ? (
                <RowActions
                  item={item}
                  canManage={canManage}
                  busy={busy}
                  onAct={onAct}
                  onEdit={() => onEdit(item)}
                  onDelete={() => onDelete(item)}
                  onShowQr={() => onShowQr(item)}
                  onDocs={() => onDocs(item)}
                />
              ) : (
                <p className="text-body-sm text-on-surface-variant">
                  You can see this item, but changing it is the team head&rsquo;s.
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <h2 className="text-headline-md">Not on this register</h2>
            <p className="mt-2 text-body-sm text-on-surface-variant">
              That code is one of ours, but the item is not in this team&rsquo;s inventory — it may
              belong to another team, or have been deleted.
            </p>
          </>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="tap rounded-full hairline px-4 py-2.5 text-body-sm font-medium text-on-surface"
          >
            Close
          </button>
        </div>
      </div>
    </Overlay>
  )
}
