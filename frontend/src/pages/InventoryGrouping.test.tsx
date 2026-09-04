import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { groupByCategory, rowsForGroups, UNCATEGORISED_LABEL } from '../lib/inventoryCategories'
import type { InventoryCategory } from '../lib/types'

/*
 * The register drawn with headings in it.
 *
 * The grouping helpers are tested on their own, but "the helper returns
 * the right array" and "the page draws the right page" are different
 * claims. This renders the row stream the way the inventory list does —
 * a heading row, then its items — so that the order the eye sees is
 * pinned, not just the order the array is in.
 */

const cat = (id: string, name: string, sort_order: number): InventoryCategory => ({
  id,
  name,
  sort_order,
  department_id: 'd1',
})

const item = (id: string, name: string, category_id: string | null) => ({ id, name, category_id })

function List({
  items,
  categories,
}: {
  items: ReturnType<typeof item>[]
  categories: InventoryCategory[]
}) {
  const groups = categories.length > 0 ? groupByCategory(items, categories) : null
  return (
    <ul>
      {rowsForGroups(groups, items).map((row) =>
        row.kind === 'heading' ? (
          <li key={`h-${row.id ?? 'loose'}`} data-heading>
            {row.name} {row.count}
          </li>
        ) : (
          <li key={row.item.id}>{row.item.name}</li>
        ),
      )}
    </ul>
  )
}

const CATS = [cat('c1', 'Cameras', 0), cat('c2', 'Cables', 1)]
const ITEMS = [
  item('a', 'Vision Mixer', 'c1'),
  item('b', 'Memory Card', null),
  item('c', 'HDMI 5m', 'c2'),
]

const readOut = () =>
  screen.getAllByRole('listitem').map((li) => (li.hasAttribute('data-heading') ? `# ${li.textContent}` : li.textContent))

describe('the register, drawn with its shelves', () => {
  it('reads heading, then what is on it, in order', () => {
    render(<List items={ITEMS} categories={CATS} />)
    expect(readOut()).toEqual([
      '# Cameras 1',
      'Vision Mixer',
      '# Cables 1',
      'HDMI 5m',
      `# ${UNCATEGORISED_LABEL} 1`,
      'Memory Card',
    ])
  })

  it('draws no headings at all for a team that has named no shelves', () => {
    render(<List items={ITEMS} categories={[]} />)
    expect(screen.queryByText(/Cameras/)).not.toBeInTheDocument()
    expect(readOut()).toEqual(['Vision Mixer', 'Memory Card', 'HDMI 5m'])
  })

  it('shows every item exactly once, however the shelves are arranged', () => {
    render(<List items={ITEMS} categories={CATS} />)
    for (const name of ['Vision Mixer', 'Memory Card', 'HDMI 5m']) {
      expect(screen.getAllByText(name)).toHaveLength(1)
    }
  })

  it('keeps an item whose shelf was deleted, under Uncategorised', () => {
    render(<List items={[item('z', 'Orphan', 'gone')]} categories={CATS} />)
    const loose = screen.getByText(new RegExp(UNCATEGORISED_LABEL)).parentElement!
    expect(within(loose).getByText('Orphan')).toBeInTheDocument()
  })
})
