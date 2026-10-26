import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExportInventoryDialog } from './ExportInventoryDialog'
import type { Department, InventoryCategory, InventoryItem } from '../lib/types'
import type { ExportSheet } from '../lib/volunteerExport'

/*
 * The export dialog, driven as somebody would: the chips, the search, the
 * shelf, unticking one item, the wishlist — and what reaches the file.
 */

const state = vi.hoisted(() => ({
  written: [] as { sheets: ExportSheet[]; name: string }[],
  asked: [] as (string | null)[],
}))

vi.mock('../lib/useErrorText', () => ({ useErrorText: () => (_e: unknown, fallback: string) => fallback }))
vi.mock('../lib/writeWorkbook', () => ({
  writeWorkbook: (sheets: ExportSheet[], name: string) => {
    state.written.push({ sheets, name })
    return Promise.resolve()
  },
}))
vi.mock('../lib/purchaseRequest', () => ({
  fetchRequests: (departmentId: string | null) => {
    state.asked.push(departmentId)
    const line = (id: string, status: string, department_id = 'media') => ({
      id,
      status,
      department_id,
      item_name: `Wish ${id}`,
      kind: 'asset',
      quantity: 1,
      estimated_cost: 10,
      product_url: null,
      reason: null,
      decision_note: null,
      created_at: '2026-10-01T00:00:00Z',
      requester: null,
      department: { name: department_id === 'media' ? 'Media' : 'Audio', color: null },
    })
    return Promise.resolve([
      line('w1', 'requested'),
      line('w2', 'approved'),
      line('w3', 'purchased'),
      line('w4', 'declined'),
      line('w5', 'requested', 'audio'),
    ])
  },
}))

const TODAY = '2026-10-26'
const dept = (id: string, name: string): Department => ({
  id,
  name,
  handbook_url: null,
  color: null,
  is_service_flow: false,
  is_worship: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
})
const item = (over: Partial<InventoryItem> & { id: string; name: string }): InventoryItem => ({
  department_id: 'media',
  quantity: 1,
  status: null,
  location: null,
  last_checked: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  kind: 'asset',
  item_status: 'in_service',
  ...over,
})
const shelves: InventoryCategory[] = [
  { id: 'cams', department_id: 'media', name: 'Cameras', sort_order: 1 },
  { id: 'cables', department_id: 'media', name: 'Cables', sort_order: 2 },
]
const items = [
  item({ id: 'a', name: 'Sony camera', category_id: 'cams' }),
  item({ id: 'b', name: 'Canon camera', category_id: 'cams', item_status: 'on_loan' }),
  item({ id: 'c', name: 'XLR cable', category_id: 'cables', item_status: 'in_repair' }),
  item({ id: 'd', name: 'AA batteries', kind: 'consumable', quantity: 3, reorder_level: 5, category_id: 'cables' }),
  item({ id: 'e', name: 'Gaffer tape', kind: 'consumable', quantity: 20 }),
]

function show(props: Partial<Parameters<typeof ExportInventoryDialog>[0]> = {}) {
  const onClose = vi.fn()
  render(
    <ExportInventoryDialog
      departments={[dept('media', 'Media')]}
      items={items}
      categories={shelves}
      todayIso={TODAY}
      onClose={onClose}
      {...props}
    />,
  )
  return { user: userEvent.setup(), onClose }
}

const listed = () =>
  within(screen.getByRole('list', { name: 'Items to export' }))
    .queryAllByRole('checkbox')
    .map((box) => box.getAttribute('aria-label')!.replace(/^Export /, ''))

const exportedNames = () => {
  const sheet = state.written.at(-1)!.sheets[0]
  const col = sheet.columns.findIndex((c) => c.label === 'Name')
  return sheet.rows.map((r) => r[col])
}

beforeEach(() => {
  state.written = []
  state.asked = []
})

describe('exporting the inventory', () => {
  it('starts from what the page was showing, and exports exactly that', async () => {
    const { user, onClose } = show({ startFilter: 'attention' })
    expect(screen.getByRole('button', { name: /Needs attention/ })).toHaveAttribute('aria-pressed', 'true')
    expect(listed()).toEqual(['XLR cable', 'AA batteries'])
    await user.click(screen.getByRole('button', { name: 'Export 2 items' }))
    expect(exportedNames()).toEqual(['XLR cable', 'AA batteries'])
    expect(state.written[0].sheets.map((s) => s.name)).toEqual(['Items'])
    expect(state.written[0].name).toMatch(/^rim-inventory-media-\d{4}-\d{2}-\d{2}\.xlsx$/)
    expect(onClose).toHaveBeenCalled()
  })

  it('narrows by each chip, with counts that match the list', async () => {
    const { user } = show()
    expect(listed()).toHaveLength(5)
    for (const [chip, names] of [
      ['Assets', ['Sony camera', 'Canon camera', 'XLR cable']],
      ['Consumables', ['AA batteries', 'Gaffer tape']],
      ['Signed out', ['Canon camera']],
      ['Needs attention', ['XLR cable', 'AA batteries']],
      ['Everything', ['Sony camera', 'Canon camera', 'XLR cable', 'AA batteries', 'Gaffer tape']],
    ] as const) {
      const button = screen.getByRole('button', { name: new RegExp(`^${chip}`) })
      await user.click(button)
      expect(listed(), chip).toEqual(names)
      expect(button, chip).toHaveTextContent(String(names.length))
    }
  })

  it('narrows by search and by shelf, together', async () => {
    const { user } = show()
    await user.type(screen.getByRole('textbox', { name: 'Search the items to export' }), 'camera')
    expect(listed()).toEqual(['Sony camera', 'Canon camera'])
    await user.clear(screen.getByRole('textbox', { name: 'Search the items to export' }))

    await user.click(screen.getByRole('combobox', { name: 'Shelf' }))
    await user.click(screen.getByRole('option', { name: 'Cables' }))
    expect(listed()).toEqual(['XLR cable', 'AA batteries'])
    await user.click(screen.getByRole('button', { name: /^Consumables/ }))
    expect(listed()).toEqual(['AA batteries'])

    await user.click(screen.getByRole('combobox', { name: 'Shelf' }))
    await user.click(screen.getByRole('option', { name: 'Uncategorised' }))
    expect(listed()).toEqual(['Gaffer tape'])
    await user.click(screen.getByRole('button', { name: 'Export 1 item' }))
    expect(exportedNames()).toEqual(['Gaffer tape'])
  })

  it('leaves out an item unticked by hand, through a change of filter and back', async () => {
    const { user } = show()
    await user.click(screen.getByRole('checkbox', { name: 'Export Canon camera' }))
    expect(screen.getByTestId('export-count')).toHaveTextContent('4/5')
    await user.click(screen.getByRole('button', { name: /^Signed out/ }))
    expect(screen.getByRole('checkbox', { name: 'Export Canon camera' })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Nothing to export' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /^Everything/ }))
    await user.click(screen.getByRole('button', { name: 'Export 4 items' }))
    expect(exportedNames()).toEqual(['Sony camera', 'XLR cable', 'AA batteries', 'Gaffer tape'])
  })

  it('unticks and reticks every item listed at once', async () => {
    const { user } = show()
    const all = screen.getByRole('checkbox', { name: 'Every item listed' })
    await user.click(all)
    expect(screen.getByTestId('export-count')).toHaveTextContent('0/5')
    await user.click(all)
    expect(screen.getByTestId('export-count')).toHaveTextContent('5/5')
  })

  it('leaves the wishlist out unless asked, and then takes what is still wanted', async () => {
    const { user } = show()
    await user.click(screen.getByRole('button', { name: 'Export 5 items' }))
    expect(state.asked).toEqual([])
    expect(state.written[0].sheets).toHaveLength(1)

    await user.click(screen.getByRole('checkbox', { name: /Include the wishlist/ }))
    const statuses = screen.getByRole('group', { name: 'Wishlist items to include' })
    expect(within(statuses).getByRole('checkbox', { name: 'Asked for' })).toBeChecked()
    expect(within(statuses).getByRole('checkbox', { name: 'Approved' })).toBeChecked()
    expect(within(statuses).getByRole('checkbox', { name: 'Bought' })).not.toBeChecked()
    expect(within(statuses).getByRole('checkbox', { name: 'Declined' })).not.toBeChecked()

    await user.click(within(statuses).getByRole('checkbox', { name: 'Bought' }))
    await user.click(screen.getByRole('button', { name: 'Export 5 items + wishlist' }))
    // The team's own list, asked of the database for this team only.
    expect(state.asked).toEqual(['media'])
    const wish = state.written[1].sheets[1]
    expect(wish.name).toBe('Wishlist')
    const col = wish.columns.findIndex((c) => c.label === 'Item')
    expect(wish.rows.map((r) => r[col])).toEqual(['Wish w1', 'Wish w2', 'Wish w3'])
  })

  it('exports the wishlist alone when every item is unticked', async () => {
    const { user } = show()
    await user.click(screen.getByRole('checkbox', { name: 'Every item listed' }))
    await user.click(screen.getByRole('checkbox', { name: /Include the wishlist/ }))
    await user.click(screen.getByRole('button', { name: 'Export 0 items + wishlist' }))
    expect(state.written[0].sheets[0].rows).toHaveLength(0)
    expect(state.written[0].sheets[1].rows).toHaveLength(2)
  })

  it('on the all-teams page, takes the teams ticked — items and wishlist alike', async () => {
    const { user } = show({
      departments: [dept('media', 'Media'), dept('audio', 'Audio')],
      items: [...items, item({ id: 'g', name: 'Sound desk', department_id: 'audio' })],
    })
    expect(screen.queryByRole('combobox', { name: 'Shelf' })).not.toBeInTheDocument()
    expect(listed()).toHaveLength(6)
    await user.click(screen.getByRole('checkbox', { name: 'Media' }))
    expect(listed()).toEqual(['Sound desk'])
    await user.click(screen.getByRole('checkbox', { name: /Include the wishlist/ }))
    await user.click(screen.getByRole('button', { name: 'Export 1 item + wishlist' }))
    // Every team's list asked for, then narrowed to the teams ticked.
    expect(state.asked).toEqual([null])
    const [items_, wish] = state.written[0].sheets
    expect(items_.columns[0].label).toBe('Team')
    expect(items_.rows.map((r) => r[0])).toEqual(['Audio'])
    expect(wish.rows.map((r) => r[0])).toEqual(['Audio'])
    expect(state.written[0].name).toMatch(/^rim-inventory-all-teams-/)
  })
})
