import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StageLayoutPage } from './StageLayoutPage'
import type { StageBlock, StageLayout } from '../lib/stage'

/*
 * One session's stage, as the people who open it: somebody who may draw,
 * somebody who may only look, and the Admin who can clear it. The
 * database is stood in for at lib/stage, which is where the page talks
 * to it.
 */

const db = vi.hoisted(() => ({
  layout: null as StageLayout | null,
  blocks: [] as StageBlock[],
  added: [] as string[],
  addedRows: [] as Record<string, unknown>[],
  patched: [] as { id: string; patch: Record<string, unknown> }[],
  deleted: [] as string[],
  comments: [] as { body: string; blockId: string | null }[],
  cleared: 0,
  saved: [] as { name: string; bytes: number }[],
  may: { add: true, edit: true, delete: true, comment: true, templates: false },
  finished: false,
  isAdmin: false,
  locks: [] as { id: string; on: boolean }[],
  asks: [] as Record<string, unknown>[],
  decided: [] as { id: string; approve: boolean }[],
  pendingAsks: [] as Record<string, unknown>[],
}))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'me' } }, isAdmin: db.isAdmin }) }))
vi.mock('../lib/useTheme', () => ({ useTheme: () => ({ resolved: 'dark' }) }))
vi.mock('../lib/downloadFile', () => ({
  downloadFile: (data: Uint8Array, name: string) => db.saved.push({ name, bytes: data.length }),
}))
vi.mock('../lib/useStageAccess', () => ({
  useStageAccess: () => ({ may: (p: keyof typeof db.may) => db.may[p], settled: true, access: [] }),
}))
vi.mock('../lib/useFinishedServices', () => ({ useFinishedServices: () => ({ isFinished: () => db.finished }) }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { id: 'svc', date: '2026-10-18', service_type: 'English Service' }, error: null }),
        }),
        order: () => Promise.resolve({ data: table === 'profiles' ? [{ id: 'p1', first_name: 'Jolsna', last_name: 'R' }] : [], error: null }),
      }),
    }),
  },
}))
vi.mock('../lib/stage', async () => {
  const actual = await vi.importActual<typeof import('../lib/stage')>('../lib/stage')
  return {
    ...actual,
fetchStageAreas: () => Promise.resolve([
      { id: 'A', name: 'Stage', width: 1200, height: 700, top_label: 'Back of stage', bottom_label: 'Front · congregation', position: 0 },
      { id: 'B', name: 'Audience', width: 1200, height: 900, top_label: 'Stage', bottom_label: 'Back of hall', position: 1 },
    ]),
    fetchStageLayout: () => Promise.resolve(db.layout),
    fetchStageBlocks: () => Promise.resolve(db.blocks),
    fetchStageComments: () => Promise.resolve([]),
    fetchStageMoveRequests: () => Promise.resolve(db.pendingAsks),
    lockStageBlock: (id: string, on: boolean) => {
      db.locks.push({ id, on })
      return Promise.resolve()
    },
    requestStageMove: (id: string, box: unknown, note: string) => {
      db.asks.push({ id, box, note })
      return Promise.resolve()
    },
    decideStageMove: (id: string, approve: boolean) => {
      db.decided.push({ id, approve })
      return Promise.resolve()
    },
    fetchStageLog: () =>
      Promise.resolve([
        { id: 'g1', layout_id: 'l1', block_id: 'b1', block_label: 'Keyboard', kind: 'moved', detail: {}, by: 'me', at: '2026-10-17T10:00:00Z', actor: { id: 'me', first_name: 'Rohit', last_name: 'K' } },
      ]),
    fetchStageTemplates: () => Promise.resolve([{ id: 't1', name: 'Full band', blocks: [{}, {}], created_by: null, created_at: 'x', updated_at: 'x' }]),
    ensureStageLayout: () => Promise.resolve(db.layout ?? { id: 'l1', service_id: 'svc', created_by: 'me', created_at: 'x', updated_at: 'x' }),
    addStageBlock: (_l: string, b: { label: string }) => {
      db.added.push(b.label)
      db.addedRows.push(b)
      return Promise.resolve({ ...block({ id: `new-${db.added.length}`, label: b.label }) })
    },
    updateStageBlock: (id: string, patch: Record<string, unknown>) => {
      db.patched.push({ id, patch })
      return Promise.resolve()
    },
    deleteStageBlock: (id: string) => {
      db.deleted.push(id)
      return Promise.resolve()
    },
    addStageComment: (_l: string, body: string, _a: string, blockId: string | null) => {
      db.comments.push({ body, blockId })
      return Promise.resolve()
    },
    clearStageLayout: () => {
      db.cleared += 1
      return Promise.resolve()
    },
    applyStageTemplate: () => Promise.resolve(),
    saveStageTemplate: () => Promise.resolve('requested' as const),
  }
})

const block = (over: Partial<StageBlock> = {}): StageBlock => ({
  id: 'b1', layout_id: 'l1', area_id: 'A', label: 'Keyboard', person_id: null, color: '#0A84FF',
  x: 100, y: 100, w: 160, h: 100, rotation: 0, z: 1, kind: 'block', seats: 0, locked_by: null, locked_at: null,
  placed_by: 'u', placed_at: '2026-10-17T10:00:00Z', updated_by: 'u2', updated_at: '2026-10-17T11:00:00Z',
  person: null,
  placer: { id: 'u', first_name: 'Rohit', last_name: 'K' },
  updater: { id: 'u2', first_name: 'Blessy', last_name: 'T' },
  ...over,
})

const layout = (): StageLayout => ({ id: 'l1', service_id: 'svc', created_by: 'me', created_at: 'x', updated_at: 'x' })

function show() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/stage/svc']}>
        <Routes>
          <Route path="/stage/:serviceId" element={<StageLayoutPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeAll(() => {
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
})

beforeEach(() => {
  db.layout = layout()
  db.blocks = [block()]
  db.added = []
  db.addedRows = []
  db.patched = []
  db.deleted = []
  db.comments = []
  db.cleared = 0
  db.saved = []
  db.may = { add: true, edit: true, delete: true, comment: true, templates: false }
  db.finished = false
  db.isAdmin = false
  db.locks = []
  db.asks = []
  db.decided = []
  db.pendingAsks = []
})

describe('a session’s stage', () => {
  it('names the session and draws what is on the stage', async () => {
    show()
    expect(await screen.findByRole('heading', { name: 'English Service' })).toBeInTheDocument()
    // Both areas are on the one canvas.
    expect(document.querySelectorAll('[data-region]')).toHaveLength(2)
    expect(screen.getByText('Audience')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Keyboard' })).toBeInTheDocument()
  })

  it('says who placed a block and who last moved it, on a tap', async () => {
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'Keyboard' }))
    expect(screen.getByText(/Placed by/)).toHaveTextContent('Rohit K')
    expect(screen.getByText(/last changed by/)).toHaveTextContent('Blessy T')
  })

  it('adds a block with one tap on a usual name, and a row of seats', async () => {
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: '+ Add block' }))
    await user.click(screen.getByRole('button', { name: 'Drums' }))
    await waitFor(() => expect(db.added).toEqual(['Drums']))
    expect(db.addedRows[0]).toMatchObject({ area_id: 'A' })
    await user.click(await screen.findByRole('button', { name: '+ Add block' }))
    // Into the hall this time.
    await user.click(screen.getByRole('radio', { name: 'Audience' }))
    await user.clear(screen.getByRole('spinbutton', { name: 'Seats' }))
    await user.type(screen.getByRole('spinbutton', { name: 'Seats' }), '12')
    await user.click(screen.getByRole('button', { name: 'Add row' }))
    await waitFor(() => expect(db.added).toEqual(['Drums', 'Row A']))
    expect(db.addedRows.at(-1)).toMatchObject({ kind: 'seats', seats: 12, area_id: 'B' })
  })

  it('renames, recolours and puts a person on the selected block', async () => {
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'Keyboard' }))
    const name = screen.getByRole('textbox', { name: 'Block name' })
    await user.clear(name)
    await user.type(name, 'Keys{Enter}')
    await waitFor(() => expect(db.patched).toContainEqual({ id: 'b1', patch: { label: 'Keys' } }))
    await user.click(screen.getByRole('radio', { name: 'Green' }))
    await waitFor(() => expect(db.patched).toContainEqual({ id: 'b1', patch: { color: '#30D158' } }))
    await user.click(screen.getByRole('combobox', { name: 'Who is on this block' }))
    await user.click(await screen.findByRole('option', { name: 'Jolsna R' }))
    await waitFor(() => expect(db.patched).toContainEqual({ id: 'b1', patch: { person_id: 'p1' } }))
  })

  it('removes a block after asking', async () => {
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'Keyboard' }))
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.getByText('Remove Keyboard?')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Remove' }).at(-1)!)
    await waitFor(() => expect(db.deleted).toEqual(['b1']))
  })

  it('pins a note to a block, and posts in the thread', async () => {
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'Keyboard' }))
    await user.type(screen.getByRole('textbox', { name: 'e.g. needs a second DI box' }), 'Needs a DI box')
    await user.click(screen.getByRole('button', { name: 'Post' }))
    await waitFor(() => expect(db.comments).toEqual([{ body: 'Needs a DI box', blockId: 'b1' }]))
    await user.click(screen.getByRole('button', { name: /^Comments/ }))
    await user.type(screen.getByRole('textbox', { name: 'Say something about the stage' }), 'Looks right')
    await user.click(screen.getAllByRole('button', { name: 'Post' }).at(-1)!)
    await waitFor(() => expect(db.comments).toContainEqual({ body: 'Looks right', blockId: null }))
  })

  it('shows the history as sentences', async () => {
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'History' }))
    expect(await screen.findByText('Rohit K moved Keyboard')).toBeInTheDocument()
  })

  it('offers templates, and asks before replacing a drawn stage', async () => {
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'Templates' }))
    await user.click(await screen.findByRole('button', { name: 'Apply' }))
    expect(screen.getByText('Apply Full band?')).toBeInTheDocument()
    // Without the templates privilege, keeping one is an ask.
    expect(screen.getByText(/sent to an Admin/)).toBeInTheDocument()
  })

  it('clears the whole stage after asking', async () => {
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'Clear' }))
    await user.click(screen.getAllByRole('button', { name: 'Clear' }).at(-1)!)
    await waitFor(() => expect(db.cleared).toBe(1))
  })

  it('shows somebody who may only look the stage, and none of the tools', async () => {
    const user = userEvent.setup()
    db.may = { add: false, edit: false, delete: false, comment: false, templates: false }
    show()
    await user.click(await screen.findByRole('button', { name: 'Keyboard' }))
    expect(screen.getByText(/Placed by/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Add block' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Block name' })).toBeNull()
  })

  it('is a record once the service has finished', async () => {
    db.finished = true
    show()
    expect(await screen.findByText('Record')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Add block' })).toBeNull()
  })

  it('exports the drawing as a PDF named for the session and the area', async () => {
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'Export' }))
    expect(screen.getByRole('dialog', { name: 'Export this layout' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^PDF/ }))
    await waitFor(() => expect(db.saved).toHaveLength(1))
    expect(db.saved[0].name).toBe('2026-10-18-english-service-layout-dark.pdf')
    expect(db.saved[0].bytes).toBeGreaterThan(500)
  })

  it('lets an Admin lock a block, and says so on it', async () => {
    const user = userEvent.setup()
    db.isAdmin = true
    show()
    await user.click(await screen.findByRole('button', { name: 'Keyboard' }))
    await user.click(screen.getByRole('button', { name: 'Lock' }))
    await waitFor(() => expect(db.locks).toEqual([{ id: 'b1', on: true }]))
  })

  it('keeps a locked block still for everybody else, and offers an ask instead', async () => {
    const user = userEvent.setup()
    db.blocks = [block({ locked_by: 'a', locked_at: '2026-10-17T09:00:00Z', locker: { id: 'a', first_name: 'Blessy', last_name: 'T' } })]
    show()
    const el = await screen.findByRole('button', { name: 'Keyboard (locked)' })
    await user.click(el)
    expect(screen.getByText(/by Blessy T/)).toHaveTextContent(/Locked/)
    expect(screen.queryByRole('textbox', { name: 'Block name' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Lock' })).toBeNull()
    // A drag does nothing.
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 200, clientY: 100 })
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 200, clientY: 100 })
    expect(db.patched).toEqual([])
    // Propose: now a drag is an ask, with a word why.
    await user.click(screen.getByRole('button', { name: 'Propose a move' }))
    expect(screen.getByRole('status')).toHaveTextContent(/Drag Keyboard/)
    fireEvent.pointerDown(el, { pointerId: 2, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(el, { pointerId: 2, clientX: 160, clientY: 100 })
    fireEvent.pointerUp(el, { pointerId: 2, clientX: 160, clientY: 100 })
    expect(await screen.findByRole('dialog', { name: 'Ask to move Keyboard' })).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Why' }), 'Camera needs it left')
    await user.click(screen.getByRole('button', { name: 'Send the ask' }))
    await waitFor(() => expect(db.asks).toEqual([{ id: 'b1', box: { x: 220, y: 100, w: 160, h: 100, area_id: 'A' }, note: 'Camera needs it left' }]))
    expect(db.patched).toEqual([])
  })

  it('shows an Admin the asks on a block, to approve or decline', async () => {
    const user = userEvent.setup()
    db.isAdmin = true
    db.blocks = [block({ locked_by: 'me', locked_at: '2026-10-17T09:00:00Z' })]
    db.pendingAsks = [{ id: 'q1', block_id: 'b1', layout_id: 'l1', x: 300, y: 100, w: 160, h: 100, note: 'Camera', requested_by: 'u9', requested_at: '2026-10-17T10:00:00Z', status: 'pending', decided_by: null, decided_at: null, requester: { id: 'u9', first_name: 'Joel', last_name: 'S' } }]
    show()
    await user.click(await screen.findByRole('button', { name: 'Keyboard (locked)' }))
    expect(screen.getByText(/asked to move it to 300, 100/)).toHaveTextContent('Joel S')
    await user.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(db.decided).toEqual([{ id: 'q1', approve: true }]))
  })

  it('duplicates a block: same look, a step across, nobody on it, and selected', async () => {
    const user = userEvent.setup()
    db.blocks = [block({ person_id: 'p1', person: { id: 'p1', first_name: 'Jolsna', last_name: 'R' }, color: '#30D158' })]
    show()
    await user.click(await screen.findByRole('button', { name: 'Keyboard, Jolsna R' }))
    await user.click(screen.getByRole('button', { name: 'Duplicate' }))
    await waitFor(() => expect(db.added).toEqual(['Keyboard']))
    expect(db.addedRows[0]).toMatchObject({ area_id: 'A', color: '#30D158', x: 130, y: 130, w: 160, h: 100 })
    expect(db.addedRows[0]).not.toHaveProperty('person_id')
  })

  it('duplicates with Ctrl+D on the canvas', async () => {
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'Keyboard' }))
    fireEvent.keyDown(screen.getByRole('application', { name: 'Stage' }), { key: 'd', ctrlKey: true })
    await waitFor(() => expect(db.added).toEqual(['Keyboard']))
  })
})
