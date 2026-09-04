import { describe, expect, it } from 'vitest'
import {
  UNCATEGORISED_LABEL,
  categoryOptions,
  groupByCategory,
  nextCategoryOrder,
  rowsForGroups,
  worthGrouping,
} from './inventoryCategories'
import type { InventoryCategory } from './types'

const cat = (id: string, name: string, sort_order: number): InventoryCategory => ({
  id,
  name,
  sort_order,
  department_id: 'd1',
})

const item = (id: string, category_id: string | null) => ({ id, category_id })

const CATS = [cat('c2', 'Cables', 1), cat('c1', 'Cameras', 0)]
const names = (g: { name: string }[]) => g.map((x) => x.name)

describe('groupByCategory', () => {
  it('reads the shelves in the order the team put them in', () => {
    const groups = groupByCategory([item('a', 'c1'), item('b', 'c2')], CATS)
    expect(names(groups)).toEqual(['Cameras', 'Cables'])
  })

  it('puts whatever is on no shelf last, under its own heading', () => {
    // Last rather than first: a team that has bothered to sort its cables
    // should not scroll past the unsorted to reach them.
    const groups = groupByCategory([item('a', null), item('b', 'c1')], CATS)
    expect(names(groups)).toEqual(['Cameras', 'Cables', UNCATEGORISED_LABEL])
    expect(groups[2].items.map((i) => i.id)).toEqual(['a'])
  })

  it('leaves out the uncategorised heading when everything is filed', () => {
    const groups = groupByCategory([item('a', 'c1'), item('b', 'c2')], CATS)
    expect(names(groups)).not.toContain(UNCATEGORISED_LABEL)
  })

  it('keeps an empty shelf, so a team can see it is there to fill', () => {
    const groups = groupByCategory([item('a', 'c1')], CATS)
    expect(groups.find((g) => g.name === 'Cables')?.items).toEqual([])
  })

  it('rescues an item pointing at a shelf that is gone', () => {
    // A category deleted in another tab leaves its id on the row until the
    // page reloads. The item must reappear as uncategorised, not vanish.
    const groups = groupByCategory([item('a', 'deleted-elsewhere')], CATS)
    const loose = groups.find((g) => g.id === null)
    expect(loose?.items.map((i) => i.id)).toEqual(['a'])
  })

  it('loses nothing, whatever the shelves say', () => {
    const items = [item('a', 'c1'), item('b', null), item('c', 'gone'), item('d', 'c2')]
    const groups = groupByCategory(items, CATS)
    expect(groups.flatMap((g) => g.items).map((i) => i.id).sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('copes with a team that has named no shelves', () => {
    const groups = groupByCategory([item('a', null)], [])
    expect(names(groups)).toEqual([UNCATEGORISED_LABEL])
  })
})

describe('worthGrouping', () => {
  it('is false for a team with no shelves, which keeps its plain list', () => {
    expect(worthGrouping([])).toBe(false)
  })

  it('is true once a shelf exists', () => {
    expect(worthGrouping(CATS)).toBe(true)
  })
})

describe('categoryOptions', () => {
  it('offers the shelves in order, with the way back off one first', () => {
    expect(categoryOptions(CATS)).toEqual([
      { value: '', label: UNCATEGORISED_LABEL },
      { value: 'c1', label: 'Cameras' },
      { value: 'c2', label: 'Cables' },
    ])
  })
})

describe('nextCategoryOrder', () => {
  it('puts the next shelf on the end', () => {
    expect(nextCategoryOrder(CATS)).toBe(2)
  })

  it('starts at nought', () => {
    expect(nextCategoryOrder([])).toBe(0)
  })
})

describe('rowsForGroups', () => {
  it('puts a heading before each shelf and its items after it', () => {
    const groups = groupByCategory([item('a', 'c1'), item('b', null)], CATS)
    expect(rowsForGroups(groups, []).map((r) => (r.kind === 'heading' ? `# ${r.name}` : r.item.id)))
      .toEqual(['# Cameras', 'a', '# Cables', `# ${UNCATEGORISED_LABEL}`, 'b'])
  })

  it('counts what is under each heading', () => {
    const groups = groupByCategory([item('a', 'c1'), item('b', 'c1')], CATS)
    const heading = rowsForGroups(groups, []).find((r) => r.kind === 'heading')
    expect(heading).toMatchObject({ name: 'Cameras', count: 2 })
  })

  it('is the plain list, headings and all absent, for a team with no shelves', () => {
    const flat = [item('a', null), item('b', null)]
    expect(rowsForGroups(null, flat)).toEqual([
      { kind: 'item', item: flat[0] },
      { kind: 'item', item: flat[1] },
    ])
  })
})
