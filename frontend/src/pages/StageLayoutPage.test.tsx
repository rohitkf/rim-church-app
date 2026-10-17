import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
}))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'me' } } }) }))
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
          single: () =>
            Promise.resolve({
              data: { id: 's1', service_id: 'svc', session_name: 'English', start_time: '2026-10-18T09:30:00Z', service: { date: '2026-10-18', service_type: 'English Service' } },
              error: null,
            }),
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
    fetchStageLog: () =>
      Promise.resolve([
        { id: 'g1', layout_id: 'l1', block_id: 'b1', block_label: 'Keyboard', kind: 'moved', detail: {}, by: 'me', at: '2026-10-17T10:00:00Z', actor: { id: 'me', first_name: 'Rohit', last_name: 'K' } },
      ]),
    fetchStageTemplates: () => Promise.resolve([{ id: 't1', name: 'Full band', area_id: 'A', width: 1200, height: 700, blocks: [{}, {}], created_by: null, created_at: 'x', updated_at: 'x' }]),
    ensureStageLayout: () => Promise.resolve(db.layout ?? { id: 'l1', session_id: 's1', area_id: 'A', service_id: 'svc', width: 1200, height: 700, created_by: 'me', created_at: 'x', updated_at: 'x' }),
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
  id: 'b1', layout_id: 'l1', label: 'Keyboard', person_id: null, color: '#0A84FF',
  x: 100, y: 100, w: 160, h: 100, rotation: 0, z: 1, kind: 'block', seats: 0,
  placed_by: 'u', placed_at: '2026-10-17T10:00:00Z', updated_by: 'u2', updated_at: '2026-10-17T11:00:00Z',
  person: null,
  placer: { id: 'u', first_name: 'Rohit', last_name: 'K' },
  updater: { id: 'u2', first_name: 'Blessy', last_name: 'T' },
  ...over,
})

const layout = (): StageLayout => ({ id: 'l1', session_id: 's1', area_id: 'A', service_id: 'svc', width: 1200, height: 700, created_by: 'me', created_at: 'x', updated_at: 'x' })

function show() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/stage/s1/A']}>
        <Routes>
          <Route path="/stage/:sessionId/:areaId" element={<StageLayoutPage />} />
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
})

describe('a session’s stage', () => {
  it('names the session and draws what is on the stage', async () => {
    show()
    expect(await screen.findByRole('heading', { name: 'English · Stage' })).toBeInTheDocument()
    // The other areas are a tab away.
    expect(screen.getByRole('link', { name: 'Audience' })).toHaveAttribute('href', '/stage/s1/B')
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
    await user.click(await screen.findByRole('button', { name: '+ Add block' }))
    await user.clear(screen.getByRole('spinbutton', { name: 'Seats' }))
    await user.type(screen.getByRole('spinbutton', { name: 'Seats' }), '12')
    await user.click(screen.getByRole('button', { name: 'Add row' }))
    await waitFor(() => expect(db.added).toEqual(['Drums', 'Row A']))
    expect(db.addedRows.at(-1)).toMatchObject({ kind: 'seats', seats: 12 })
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
    expect(db.saved[0].name).toBe('2026-10-18-english-stage-layout-dark.pdf')
    expect(db.saved[0].bytes).toBeGreaterThan(500)
  })
})
