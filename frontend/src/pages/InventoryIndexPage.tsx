import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { QueryState } from '../components/QueryState'
import { ListSearch } from '../components/ListSearch'
import { useListSearch } from '../lib/useListSearch'
import { ActionButton, Card, Eyebrow, PageHeader, Statistic, Tile, type TileTone } from '../components/Surface'
import { ExportInventoryDialog } from '../components/ExportInventoryDialog'
import { PurchaseRequests } from '../components/PurchaseRequests'
import { usePermissions } from '../lib/usePermissions'
import { fetchDepartments } from '../lib/queries'
import { TeamMark } from '../components/TeamMark'
import { teamWash } from '../lib/teamGradient'
import { useTeamStyle } from '../lib/useTeamStyle'
import { formatMoney, needsAttention, totalValue } from '../lib/inventory'
import { todayIso } from '../lib/monthGrid'
import { inventoryCategorySchema, inventoryItemSchema, type InventoryItem } from '../lib/types'

/**
 * Every item the viewer is allowed to see, across teams — RLS does the
 * narrowing, so a head sees their own team's worth and an Admin sees the
 * church's.
 */
async function fetchAllItems(): Promise<InventoryItem[]> {
  // Who has each thing signed out, for the export's column of it.
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*, holder:profiles!inventory_items_held_by_fkey(id, first_name, last_name)')
  if (error) throw error
  return z.array(inventoryItemSchema).parse(data)
}

export function InventoryIndexPage() {
  const { can } = usePermissions()
  const today = todayIso()
  const { teamStyle } = useTeamStyle()
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  const itemsQuery = useQuery({ queryKey: ['inventory-all'], queryFn: fetchAllItems })
  const [exporting, setExporting] = useState(false)
  // Every team's shelves, for the export's Shelf column; read only once asked.
  const categoriesQuery = useQuery({
    queryKey: ['inventory-categories', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('inventory_categories').select('id, department_id, name, sort_order')
      if (error) throw error
      return z.array(inventoryCategorySchema).parse(data)
    },
    enabled: exporting,
  })

  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data])
  const byTeam = useMemo(() => {
    const map = new Map<string, InventoryItem[]>()
    for (const item of items) {
      map.set(item.department_id, [...(map.get(item.department_id) ?? []), item])
    }
    return map
  }, [items])

  /*
   * Finding a piece of kit without knowing whose it is. The page is a tile
   * for each team, so "where is the spare mic?" meant opening registers one
   * at a time. The box looks through every item this person may see, by
   * what it is called, its tag, make, model, serial number, shelf or team,
   * and each result opens its own entry in its team's register.
   */
  const teamNames = useMemo(() => new Map((departmentsQuery.data ?? []).map((d) => [d.id, d.name])), [departmentsQuery.data])
  const search = useListSearch(items, (i) => [
    { text: i.name, weight: 3 },
    { text: `${i.asset_tag ?? ''} ${i.brand ?? ''} ${i.model ?? ''}`, weight: 2 },
    { text: `${i.serial_number ?? ''} ${i.category ?? ''} ${i.location ?? ''} ${teamNames.get(i.department_id) ?? ''}` },
  ])

  const churchValue = totalValue(items)
  const flagged = items.filter((i) => needsAttention(i, today)).length

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Every team's register. Value counts only what is in service — anything retired, missing, on loan or in repair is left out."
        action={
          <ActionButton tone="quiet" onClick={() => setExporting(true)} disabled={!departmentsQuery.data}>
            Export
          </ActionButton>
        }
      />

      {exporting && departmentsQuery.data && (
        <ExportInventoryDialog
          departments={departmentsQuery.data}
          items={items}
          categories={categoriesQuery.data ?? []}
          todayIso={today}
          onClose={() => setExporting(false)}
        />
      )}

      {/* Three figures, and the two that carry a judgement wear it: money
          that is actually in service reads as good news, anything flagged
          reads as work. The count itself is just a count.

          On a phone the money takes the full width and the two counts share
          the row below it: three full-width tiles of one number each were a
          screen and a half of figures before the first team. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {(
          [
            { label: 'Items on the books', value: String(items.length), tone: 'plain', note: undefined },
            {
              label: 'Value in service',
              value: formatMoney(churchValue),
              tone: 'success',
              note: undefined,
            },
            {
              label: 'Needs attention',
              value: String(flagged),
              tone: flagged > 0 ? 'warning' : 'plain',
              note: flagged > 0 ? 'warranty, repair, missing' : undefined,
            },
          ] as { label: string; value: string; tone: TileTone; note?: string }[]
        ).map((tile) => (
          <Tile
            key={tile.label}
            tone={tile.tone}
            className={tile.label === 'Value in service' ? 'order-first col-span-2 sm:order-none sm:col-span-1' : ''}
          >
            {/* A block, so that on a phone, where "Items on the books" takes two
                lines, they sit at the label's own leading and not the tile's. */}
            <Eyebrow className="block">{tile.label}</Eyebrow>
            <Statistic className="mt-2.5" value={tile.value} unit={tile.note} />
          </Tile>
        ))}
      </div>

      {/* The totals above are the church's; everything below is one team at
          a time. The two are different questions, so they get a gap and a
          label rather than running together as one grid. */}
      <div className="mt-12 mb-4 flex items-baseline justify-between gap-4 border-t border-border-subtle pt-8">
        <Eyebrow>By team</Eyebrow>
        <span className="font-mono text-label-sm text-on-surface-faint">
          {departmentsQuery.data?.length ?? 0} teams
        </span>
      </div>

      <QueryState
        isLoading={departmentsQuery.isLoading}
        error={departmentsQuery.error}
        isEmpty={departmentsQuery.data?.length === 0}
        emptyMessage="No teams visible to you yet."
      >
        <ListSearch
          search={search}
          label="Find a piece of kit"
          placeholder="Find kit in any team: name, tag, make, serial or shelf"
          noun={['item', 'items']}
          className="mb-5"
        />
        {search.searching && search.shown.length > 0 && (
          <ul data-testid="kit-found" className="flex flex-col gap-2">
            {search.shown.slice(0, 50).map((item) => (
              <li key={item.id}>
                <Link
                  to={`/inventory/${item.department_id}?item=${item.id}`}
                  className="tap flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-[var(--radius-row)] bg-raised px-4 py-3.5 hairline transition-colors duration-200 hover:bg-raised-strong"
                >
                  <span className="min-w-0">
                    <span className="block break-words text-body-md font-medium text-on-surface">{item.name}</span>
                    <span className="block break-words text-label-sm text-on-surface-variant">
                      {[item.asset_tag, item.brand, item.model, item.location].filter(Boolean).join(' · ') || 'No details yet'}
                    </span>
                  </span>
                  <span className="shrink-0 text-label-sm text-on-surface-faint">{teamNames.get(item.department_id) ?? ''}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <ul hidden={search.searching} className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {departmentsQuery.data?.map((dept) => {
            const teamItems = byTeam.get(dept.id) ?? []
            const teamFlagged = teamItems.filter((i) => needsAttention(i, today)).length

            return (
              <Card key={dept.id} as="li" interactive>
                <Link
                  to={`/inventory/${dept.id}`}
                  className="group/link block rounded-[var(--radius-tile)] p-5"
                  style={teamWash(dept.color, teamStyle)}
                >
                  <div className="flex items-start gap-2">
                    <TeamMark color={dept.color} className="mt-1" />
                    <span className="text-headline-md leading-tight transition-colors duration-200 ease-[var(--ease-glide)] group-hover/link:text-accent-blue-soft">
                      {dept.name}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <span className="font-mono text-body-md tabular-nums text-on-surface">
                      {formatMoney(totalValue(teamItems))}
                    </span>
                    <span className="text-label-sm text-on-surface-variant">
                      {teamItems.length} {teamItems.length === 1 ? 'item' : 'items'}
                      {teamFlagged > 0 && ` · ${teamFlagged} to look at`}
                    </span>
                  </div>
                </Link>
              </Card>
            )
          })}
        </ul>
      </QueryState>

      {/* Every team's asks in one place, for whoever answers them
          everywhere — "what is everyone waiting on?" is nobody else's question. */}
      {can('inv.purchase_decide') && (
        <div className="mt-8">
          <PurchaseRequests departmentId={null} />
        </div>
      )}
    </div>
  )
}
