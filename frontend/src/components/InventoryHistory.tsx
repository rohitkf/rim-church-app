import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { QueryState } from './QueryState'
import { Panel } from './Surface'
import { ActivityIcon } from './icons'
import { formatRelativeTime } from '../lib/relativeTime'
import { inventoryEventSchema, type InventoryEvent } from '../lib/types'

async function fetchEvents(itemId: string): Promise<InventoryEvent[]> {
  const { data, error } = await supabase
    .from('inventory_events')
    .select('*, actor:profiles!inventory_events_actor_id_fkey(id, first_name, last_name)')
    .eq('item_id', itemId)
    .order('at', { ascending: false })
    .limit(50)
  if (error) throw error
  return z.array(inventoryEventSchema).parse(data)
}

/** What each entry says, in the words someone would use out loud. */
function describe(event: InventoryEvent): string {
  switch (event.event_type) {
    case 'created':
      return `Added to the register as ${event.to_value ?? 'a new item'}`
    case 'checked_out':
      return 'Signed out'
    case 'checked_in':
      return 'Returned'
    case 'quantity_adjusted':
      return `Count ${event.from_value} → ${event.to_value}`
    case 'status_changed':
      return `${event.from_value} → ${event.to_value}`
    case 'moved':
      return `Moved to ${event.to_value}`
    case 'audited':
      return event.quantity_delta ? `Counted: ${event.from_value} → ${event.to_value}` : 'Verified in place'
    default:
      return event.note ?? 'Noted'
  }
}

const DOT: Record<InventoryEvent['event_type'], string> = {
  created: 'bg-status-pending',
  checked_out: 'bg-warning',
  checked_in: 'bg-success',
  quantity_adjusted: 'bg-status-member',
  status_changed: 'bg-status-head',
  moved: 'bg-status-member',
  audited: 'bg-secondary',
  note: 'bg-status-pending',
}

/**
 * One item's history, newest first.
 *
 * This is the point of the register: not what an item is now, but what has
 * happened to it — who had it, when it came back, when someone last laid
 * eyes on it. Entries are written only by the movement functions, so the
 * trail can't be edited after the fact.
 */
export function InventoryHistory({
  itemId,
  title,
  onClose,
}: {
  itemId: string
  title: string
  onClose: () => void
}) {
  const eventsQuery = useQuery({
    queryKey: ['inventory-events', itemId],
    queryFn: () => fetchEvents(itemId),
  })

  return (
    <Panel
      title={`History · ${title}`}
      icon={ActivityIcon}
      aside={
        <button
          type="button"
          onClick={onClose}
          className="text-label-sm text-on-surface-variant transition-colors duration-300 hover:text-on-surface"
        >
          Close
        </button>
      }
    >
      <QueryState
        isLoading={eventsQuery.isLoading}
        error={eventsQuery.error}
        isEmpty={eventsQuery.data?.length === 0}
        emptyMessage="Nothing recorded against this yet."
      >
        <ol className="flex flex-col">
          {eventsQuery.data?.map((event, i) => (
            <li key={event.id} className="flex gap-3.5">
              <span className="flex flex-col items-center">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[event.event_type]}`} />
                {i < (eventsQuery.data?.length ?? 0) - 1 && (
                  <span className="w-px flex-1 bg-black/8 dark:bg-white/10" />
                )}
              </span>
              <div className="pb-4">
                <div className="text-body-sm text-on-surface">{describe(event)}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-label-sm text-on-surface-variant">
                  <span>
                    {event.actor ? `${event.actor.first_name} ${event.actor.last_name}` : 'Someone'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{formatRelativeTime(event.at)}</span>
                </div>
                {event.note && (
                  <p className="mt-1 text-body-sm text-on-surface-variant">“{event.note}”</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </QueryState>
    </Panel>
  )
}
