import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { QueryState } from '../components/QueryState'
import { Card, Eyebrow, PageHeader, Statistic, Tile, type TileTone } from '../components/Surface'
import { fetchDepartments } from '../lib/queries'
import { DEFAULT_DEPT_COLOR } from '../lib/deptBadge'
import { formatMoney, needsAttention, totalValue } from '../lib/inventory'
import { todayIso } from '../lib/monthGrid'
import { inventoryItemSchema, type InventoryItem } from '../lib/types'

/**
 * Every item the viewer is allowed to see, across teams — RLS does the
 * narrowing, so a head sees their own team's worth and an Admin sees the
 * church's.
 */
async function fetchAllItems(): Promise<InventoryItem[]> {
  const { data, error } = await supabase.from('inventory_items').select('*')
  if (error) throw error
  return z.array(inventoryItemSchema).parse(data)
}

export function InventoryIndexPage() {
  const today = todayIso()
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  const itemsQuery = useQuery({ queryKey: ['inventory-all'], queryFn: fetchAllItems })

  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data])
  const byTeam = useMemo(() => {
    const map = new Map<string, InventoryItem[]>()
    for (const item of items) {
      map.set(item.department_id, [...(map.get(item.department_id) ?? []), item])
    }
    return map
  }, [items])

  const churchValue = totalValue(items)
  const flagged = items.filter((i) => needsAttention(i, today)).length

  return (
    <div>
      <PageHeader
        eyebrow="Equipment"
        title="Inventory"
        description="Every team's register. Value counts only what is in service — anything retired, missing, on loan or in repair is left out."
      />

      {/* Three figures, and the two that carry a judgement wear it: money
          that is actually in service reads as good news, anything flagged
          reads as work. The count itself is just a count. */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
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
          <Tile key={tile.label} tone={tile.tone}>
            <Eyebrow>{tile.label}</Eyebrow>
            <Statistic className="mt-2.5" value={tile.value} unit={tile.note} />
          </Tile>
        ))}
      </div>

      <QueryState
        isLoading={departmentsQuery.isLoading}
        error={departmentsQuery.error}
        isEmpty={departmentsQuery.data?.length === 0}
        emptyMessage="No teams visible to you yet."
      >
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {departmentsQuery.data?.map((dept) => {
            const teamItems = byTeam.get(dept.id) ?? []
            const teamFlagged = teamItems.filter((i) => needsAttention(i, today)).length

            return (
              <Card key={dept.id} as="li" interactive>
                <Link to={`/inventory/${dept.id}`} className="group/link block p-5">
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: dept.color ?? DEFAULT_DEPT_COLOR }}
                    />
                    <span className="text-headline-md leading-tight transition-colors duration-300 ease-[var(--ease-glide)] group-hover/link:text-secondary">
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
    </div>
  )
}
