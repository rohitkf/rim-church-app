import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ServicePlannerPage } from './ServicePlannerPage'
import type { ServiceSheet } from '../lib/serviceSheet'

/*
 * A session's note (0316): written by whoever plans the running order,
 * read by everybody who reads it, and carried onto the exported sheet.
 * Not a comment, which is private and is another file's (ServicePlannerComments).
 */

const SUNDAY = '2099-01-04'
const LAST_YEAR = '2025-09-07'
const db = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown>[]>,
  updates: [] as { table: string; id: unknown; patch: Record<string, unknown> }[],
  rights: [] as string[],
  sheet: null as unknown,
}))

vi.mock('../lib/supabaseClient', () => {
  const chain = (table: string): unknown => {
    let after: (() => { data: unknown; error: unknown }) | null = null
    let patch: Record<string, unknown> | null = null
    const result = () => Promise.resolve(after ? after() : { data: db.rows[table] ?? [], error: null })
    const proxy: unknown = new Proxy(
      {},
      {
        get: (_t, key) => {
          if (key === 'then') return (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => result().then(ok, bad)
          if (key === 'single' || key === 'maybeSingle') return () => Promise.resolve({ data: (db.rows[table] ?? [])[0] ?? null, error: null })
          if (key === 'update')
            return (next: Record<string, unknown>) => {
              patch = next
              return proxy
            }
          if (key === 'eq')
            return (_column: string, value: unknown) => {
              if (patch) {
                const change = patch
                after = () => {
                  db.updates.push({ table, id: value, patch: change })
                  // As the database does: the row changes, and so does when it last did.
                  db.rows[table] = (db.rows[table] ?? []).map((r) => (r.id === value ? { ...r, ...change, updated_at: `t${db.updates.length}` } : r))
                  return { data: null, error: null }
                }
              }
              return proxy
            }
          return () => proxy
        },
      },
    )
    return proxy
  }
  return {
    supabase: {
      from: (table: string) => chain(table),
      rpc: () => Promise.resolve({ data: null, error: null }),
      channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
      removeChannel: () => undefined,
    },
  }
})

vi.mock('../lib/usePageAccess', () => ({ usePageAccess: () => ({ settled: true, canOpen: () => false, standing: 'church' }) }))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } }, isAdmin: false, isSuperAdmin: false, isDepartmentHead: () => false }),
}))

vi.mock('../lib/usePermissions', () => ({
  usePermissions: () => ({ can: (cap: string) => db.rights.includes(cap) }),
}))

vi.mock('../lib/appSettings', async (original) => {
  const real = await original<typeof import('../lib/appSettings')>()
  return { ...real, useAppSettings: () => real.DEFAULT_SETTINGS }
})

// The dialog draws a file; what matters here is the sheet it is handed.
vi.mock('../components/ExportServiceDialog', () => ({
  ExportServiceDialog: ({ sheet }: { sheet: ServiceSheet }) => {
    db.sheet = sheet
    return <div role="dialog" aria-label="Export" />
  },
}))

const at = (hhmm: string, day = SUNDAY) => new Date(`${day}T${hhmm}:00`).toISOString()
const session = (id: string, name: string, start: string, order: number, note: string | null = null, day = SUNDAY) => ({
  id,
  service_id: 'svc',
  order_index: order,
  start_time: at(start, day),
  duration_minutes: 30,
  session_name: name,
  department_id: null,
  role_label: null,
  note,
  updated_at: '',
  assignees: [],
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/services/svc']}>
        <Routes>
          <Route path="/services/:serviceId" element={<ServicePlannerPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const NOTE = 'Communion follows. Elements on the table by 10:40.'
const noteRow = (name: string) => screen.queryByRole('group', { name: `Note for ${name}` })
const menuOf = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.click(screen.getByRole('button', { name: `Actions for ${name}` }))
  return within(screen.getByRole('menu'))
}

beforeEach(() => {
  db.updates = []
  db.rights = []
  db.sheet = null
  db.rows = {
    services: [{ id: 'svc', date: SUNDAY, service_type: 'English', created_at: '', ended_at: null, end_held_at: null, series_id: null }],
    service_sessions: [session('s1', 'Worship', '10:00', 0), session('s2', 'Sermon', '10:30', 1, NOTE)],
  }
})

describe('whoever plans the running order', () => {
  beforeEach(() => {
    db.rights = ['svc.sessions']
  })

  it('finds Add a note in a session’s menu, saying who sees it, above Remove', async () => {
    const user = show()
    await screen.findByRole('button', { name: 'Actions for Worship' })
    const items = (await menuOf(user, 'Worship')).getAllByRole('menuitem')
    const add = items.findIndex((item) => /Add a note/.test(item.textContent ?? ''))
    expect(add).toBeGreaterThan(-1)
    expect(items[add]).toHaveTextContent('Shown to everyone, and on the exported sheet')
    expect(items.at(-1)).toHaveTextContent('Remove this session')
    expect(add).toBeLessThan(items.length - 1)
  })

  it('writes a note on a session, tidied, and sees it stay there', async () => {
    const user = show()
    await screen.findByRole('button', { name: 'Actions for Worship' })
    expect(noteRow('Worship')).toBeNull()
    await user.click((await menuOf(user, 'Worship')).getByRole('menuitem', { name: /Add a note/ }))
    const box = within(noteRow('Worship')!).getByRole('textbox', { name: 'Note for Worship' })
    // Opened by a button, so the cursor is already in it.
    expect(box).toHaveFocus()
    await user.type(box, '  Two songs   only  ')
    await user.tab()
    await waitFor(() => expect(db.updates).toEqual([{ table: 'service_sessions', id: 's1', patch: { note: 'Two songs only' } }]))
    await waitFor(() => expect(within(noteRow('Worship')!).getByRole('textbox')).toHaveValue('Two songs only'))
  })

  it('changes a note where it stands, and its menu no longer offers to add one', async () => {
    const user = show()
    const box = within(await screen.findByRole('group', { name: 'Note for Sermon' })).getByRole('textbox')
    expect(box).toHaveValue(NOTE)
    expect((await menuOf(user, 'Sermon')).queryByRole('menuitem', { name: /Add a note/ })).toBeNull()
    await user.keyboard('{Escape}')
    await user.clear(box)
    await user.type(box, 'Reading first{Enter}')
    await waitFor(() => expect(db.updates).toEqual([{ table: 'service_sessions', id: 's2', patch: { note: 'Reading first' } }]))
  })

  it('takes a note off by clearing it, and the row goes', async () => {
    const user = show()
    const box = within(await screen.findByRole('group', { name: 'Note for Sermon' })).getByRole('textbox')
    await user.clear(box)
    await user.tab()
    await waitFor(() => expect(db.updates).toEqual([{ table: 'service_sessions', id: 's2', patch: { note: null } }]))
    await waitFor(() => expect(noteRow('Sermon')).toBeNull())
  })

  it('saves nothing when the box is opened and left empty, and puts it away', async () => {
    const user = show()
    await screen.findByRole('button', { name: 'Actions for Worship' })
    await user.click((await menuOf(user, 'Worship')).getByRole('menuitem', { name: /Add a note/ }))
    expect(noteRow('Worship')).not.toBeNull()
    await user.tab()
    await waitFor(() => expect(noteRow('Worship')).toBeNull())
    expect(db.updates).toEqual([])
  })

  it('saves nothing when a note is left as it was', async () => {
    const user = show()
    const box = within(await screen.findByRole('group', { name: 'Note for Sermon' })).getByRole('textbox')
    await user.click(box)
    await user.tab()
    expect(db.updates).toEqual([])
    expect(within(noteRow('Sermon')!).getByRole('textbox')).toHaveValue(NOTE)
  })

  it('takes no more than a note may be', async () => {
    show()
    const box = within(await screen.findByRole('group', { name: 'Note for Sermon' })).getByRole('textbox')
    expect(box).toHaveAttribute('maxlength', '500')
  })

  it('sees the note as the team does in Preview: words, and nothing to type in', async () => {
    const user = show()
    await screen.findByRole('group', { name: 'Note for Sermon' })
    await user.click(screen.getByRole('button', { name: 'Actions for this service' }))
    await user.click(screen.getByRole('menuitem', { name: /Preview/ }))
    const row = within(await screen.findByRole('group', { name: 'Note for Sermon' }))
    expect(row.getByText(NOTE)).toBeInTheDocument()
    expect(row.queryByRole('textbox')).toBeNull()
    expect(noteRow('Worship')).toBeNull()
  })

  it('hands the note to the exported sheet, on the session it belongs to', async () => {
    const user = show()
    await screen.findByRole('group', { name: 'Note for Sermon' })
    await user.click(screen.getByRole('button', { name: 'Actions for this service' }))
    await user.click(screen.getByRole('menuitem', { name: /Export/ }))
    await screen.findByRole('dialog', { name: 'Export' })
    const sheet = db.sheet as ServiceSheet
    expect(sheet.sessions.map((s) => [s.name, s.note])).toEqual([
      ['Worship', null],
      ['Sermon', NOTE],
    ])
  })
})

describe('somebody who only reads the running order', () => {
  it('reads a session’s note under it, and can write none', async () => {
    show()
    const row = within(await screen.findByRole('group', { name: 'Note for Sermon' }))
    expect(row.getByText('Note')).toBeInTheDocument()
    expect(row.getByText(NOTE)).toBeInTheDocument()
    expect(row.queryByRole('textbox')).toBeNull()
    // A session with no note says nothing, and there is no menu to add one from.
    expect(noteRow('Worship')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Actions for Worship' })).toBeNull()
  })
})

describe('somebody given one of the planner’s buttons', () => {
  it('has their button and no Add a note: a note is planning, not running', async () => {
    db.rights = ['planner.add_time']
    const user = show()
    await screen.findByRole('button', { name: 'Actions for Worship' })
    const menu = await menuOf(user, 'Worship')
    expect(menu.getByRole('menuitem', { name: /Add time/ })).toBeInTheDocument()
    expect(menu.queryByRole('menuitem', { name: /Add a note/ })).toBeNull()
    expect(within(noteRow('Sermon')!).queryByRole('textbox')).toBeNull()
    expect(within(noteRow('Sermon')!).getByText(NOTE)).toBeInTheDocument()
  })
})

describe('a service that is over', () => {
  it('still shows the note, and nobody changes it', async () => {
    db.rights = ['svc.sessions']
    db.rows.services = [{ id: 'svc', date: LAST_YEAR, service_type: 'English', created_at: '', ended_at: null, end_held_at: null, series_id: null }]
    db.rows.service_sessions = [session('s1', 'Worship', '10:00', 0, null, LAST_YEAR), session('s2', 'Sermon', '10:30', 1, NOTE, LAST_YEAR)]
    show()
    const row = within(await screen.findByRole('group', { name: 'Note for Sermon' }))
    expect(row.getByText(NOTE)).toBeInTheDocument()
    expect(row.queryByRole('textbox')).toBeNull()
  })
})
