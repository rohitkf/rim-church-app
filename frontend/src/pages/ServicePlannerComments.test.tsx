import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ServicePlannerPage } from './ServicePlannerPage'

/*
 * A comment on a session (0308): a Pastor's to write, the Admins' and the
 * Owner's to read, and no part of the running order the team sees.
 *
 * The database here answers every read with every comment there is, as it
 * does for an Admin previewing another role — so what these tests see is
 * what the page itself holds back.
 */

// A Sunday still to come, so the running order is not yet a record; one test below takes a Sunday that has been.
const SUNDAY = '2099-01-04'
const LAST_YEAR = '2025-09-07'
const db = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown>[]>,
  asked: [] as string[],
  inserts: [] as { table: string; row: Record<string, unknown> }[],
  deletes: [] as { table: string; id: unknown }[],
  refuse: null as string | null,
  rights: [] as string[],
}))

vi.mock('../lib/supabaseClient', () => {
  const chain = (table: string): unknown => {
    let after: (() => { data: unknown; error: unknown }) | null = null
    let deleting = false
    const result = () => Promise.resolve(after ? after() : { data: db.rows[table] ?? [], error: null })
    const proxy: unknown = new Proxy(
      {},
      {
        get: (_t, key) => {
          if (key === 'then') return (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => result().then(ok, bad)
          if (key === 'single' || key === 'maybeSingle') return () => Promise.resolve({ data: (db.rows[table] ?? [])[0] ?? null, error: null })
          if (key === 'select')
            return () => {
              if (!after) db.asked.push(table)
              return proxy
            }
          if (key === 'insert')
            return (row: Record<string, unknown>) => {
              after = () => {
                if (db.refuse) return { data: null, error: { code: '42501', message: db.refuse } }
                db.inserts.push({ table, row })
                db.rows[table] = [...(db.rows[table] ?? []), { id: `new-${db.inserts.length}`, author: 'me', created_at: new Date().toISOString(), writer: { first_name: 'Paul', last_name: 'Mensah' }, ...row }]
                return { data: null, error: null }
              }
              return proxy
            }
          if (key === 'delete')
            return () => {
              deleting = true
              return proxy
            }
          if (key === 'eq')
            return (_column: string, value: unknown) => {
              if (deleting) {
                after = () => {
                  db.deletes.push({ table, id: value })
                  db.rows[table] = (db.rows[table] ?? []).filter((r) => r.id !== value)
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

const at = (hhmm: string, day = SUNDAY) => new Date(`${day}T${hhmm}:00`).toISOString()
const session = (id: string, name: string, start: string, order: number) => ({
  id,
  service_id: 'svc',
  order_index: order,
  start_time: at(start),
  duration_minutes: 30,
  session_name: name,
  department_id: null,
  role_label: null,
  updated_at: '',
  assignees: [],
})
const said = (id: string, sessionId: string, author: string, body: string, name: [string, string]) => ({
  id,
  session_id: sessionId,
  author,
  body,
  created_at: at('09:00'),
  writer: { first_name: name[0], last_name: name[1] },
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

const comments = (name: string) => screen.queryByRole('group', { name: `Comments on ${name}` })

beforeEach(() => {
  db.asked = []
  db.inserts = []
  db.deletes = []
  db.refuse = null
  db.rights = []
  db.rows = {
    services: [{ id: 'svc', date: SUNDAY, service_type: 'English', created_at: '', ended_at: null, end_held_at: null, series_id: null }],
    service_sessions: [session('s1', 'Worship', '10:00', 0), session('s2', 'Sermon', '10:30', 1)],
    service_session_comments: [
      said('c1', 's2', 'me', 'Keep this to twenty minutes', ['Paul', 'Mensah']),
      said('c2', 's2', 'other', 'I would like the reading first', ['Grace', 'Owusu']),
    ],
  }
})

describe('a Pastor on the running order', () => {
  beforeEach(() => {
    db.rights = ['svc.comment']
  })

  it('has one thing in each session’s menu: Add a comment, and it says it is private', async () => {
    const user = show()
    await screen.findAllByText('Worship')
    await user.click(screen.getByRole('button', { name: 'Actions for Worship' }))
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem')
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveTextContent('Add a comment')
    expect(items[0]).toHaveTextContent('Private: not shown to the team')
  })

  it('writes a comment on a session, in their own name, and sees it there', async () => {
    const user = show()
    await screen.findAllByText('Worship')
    expect(comments('Worship')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Actions for Worship' }))
    await user.click(screen.getByRole('menuitem', { name: /Add a comment/ }))
    await user.type(screen.getByRole('textbox', { name: 'Comment on Worship' }), '  Two songs, not three  ')
    await user.click(screen.getByRole('button', { name: 'Add comment' }))
    await waitFor(() => expect(db.inserts).toHaveLength(1))
    // The session and the words, tidied. No author: the database puts the caller's own, and takes no other.
    expect(db.inserts[0]).toEqual({ table: 'service_session_comments', row: { session_id: 's1', body: 'Two songs, not three' } })
    const block = within(await screen.findByRole('group', { name: 'Comments on Worship' }))
    expect(await block.findByText('Two songs, not three')).toBeInTheDocument()
    expect(block.queryByRole('textbox')).toBeNull()
  })

  it('reads their own comments and nobody else’s', async () => {
    show()
    const block = within(await screen.findByRole('group', { name: 'Comments on Sermon' }))
    expect(block.getByText('Keep this to twenty minutes')).toBeInTheDocument()
    expect(block.queryByText('I would like the reading first')).toBeNull()
    expect(block.getAllByRole('listitem')).toHaveLength(1)
  })

  it('deletes their own comment only after being asked', async () => {
    const user = show()
    const block = within(await screen.findByRole('group', { name: 'Comments on Sermon' }))
    await user.click(block.getByRole('button', { name: 'Delete your comment on Sermon' }))
    expect(db.deletes).toEqual([])
    const asking = within(screen.getByRole('alertdialog', { name: 'Delete this comment?' }))
    expect(asking.getByText(/“Keep this to twenty minutes” goes for good/)).toBeInTheDocument()
    await user.click(asking.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(db.deletes).toEqual([{ table: 'service_session_comments', id: 'c1' }]))
    await waitFor(() => expect(comments('Sermon')).toBeNull())
  })

  it('is told beside the box when the database refuses, and keeps what was typed', async () => {
    db.refuse = 'new row violates row-level security policy for table "service_session_comments"'
    const user = show()
    const block = within(await screen.findByRole('group', { name: 'Comments on Sermon' }))
    await user.click(block.getByRole('button', { name: 'Add a comment' }))
    await user.type(block.getByRole('textbox'), 'One more thing')
    await user.click(block.getByRole('button', { name: 'Add comment' }))
    expect(await block.findByRole('alert')).toBeInTheDocument()
    expect(block.getByRole('textbox')).toHaveValue('One more thing')
    expect(db.inserts).toEqual([])
  })

  it('comments on a service that has finished: “that ran long” is said afterwards', async () => {
    db.rows.services = [{ id: 'svc', date: LAST_YEAR, service_type: 'English', created_at: '', ended_at: at('11:05', LAST_YEAR), end_held_at: null, series_id: null }]
    db.rows.service_sessions = [
      { ...session('s1', 'Worship', '10:00', 0), start_time: at('10:00', LAST_YEAR) },
      { ...session('s2', 'Sermon', '10:30', 1), start_time: at('10:30', LAST_YEAR) },
    ]
    const user = show()
    const block = within(await screen.findByRole('group', { name: 'Comments on Sermon' }))
    await user.click(block.getByRole('button', { name: 'Add a comment' }))
    await user.type(block.getByRole('textbox'), 'That ran long')
    await user.click(block.getByRole('button', { name: 'Add comment' }))
    await waitFor(() => expect(db.inserts).toEqual([{ table: 'service_session_comments', row: { session_id: 's2', body: 'That ran long' } }]))
  })

  it('gets none of the planner’s own buttons with it', async () => {
    show()
    await screen.findAllByText('Worship')
    expect(screen.queryByRole('button', { name: /Add Session/ })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Session name' })).toBeNull()
  })
})

describe('an Admin on the running order', () => {
  beforeEach(() => {
    db.rights = ['svc.comment_read']
  })

  it('reads every comment with who said it, and may neither add one nor delete one', async () => {
    show()
    const block = within(await screen.findByRole('group', { name: 'Comments on Sermon' }))
    const [first, second] = block.getAllByRole('listitem')
    expect(first).toHaveTextContent('Keep this to twenty minutes')
    expect(second).toHaveTextContent('I would like the reading first')
    expect(second).toHaveTextContent('Grace Owusu')
    expect(block.getByText('Private — not shown to the team')).toBeInTheDocument()
    expect(block.queryByRole('button', { name: 'Add a comment' })).toBeNull()
    // Somebody else's is never theirs to delete.
    expect(within(second).queryByRole('button')).toBeNull()
    // A session nobody commented on has nothing drawn on it.
    expect(comments('Worship')).toBeNull()
  })

  it('has no Add a comment in a session’s menu', async () => {
    db.rights = ['svc.comment_read', 'svc.sessions']
    const user = show()
    await screen.findByRole('group', { name: 'Comments on Sermon' })
    await user.click(screen.getByRole('button', { name: 'Actions for Sermon' }))
    expect(within(screen.getByRole('menu')).queryByRole('menuitem', { name: /Add a comment/ })).toBeNull()
  })

  it('who was also given the right to comment has it above Remove, which stays last', async () => {
    db.rights = ['svc.comment_read', 'svc.comment', 'svc.sessions']
    const user = show()
    await screen.findByRole('group', { name: 'Comments on Sermon' })
    await user.click(screen.getByRole('button', { name: 'Actions for Sermon' }))
    const labels = within(screen.getByRole('menu'))
      .getAllByRole('menuitem')
      .map((m) => m.textContent ?? '')
    expect(labels.at(-1)).toContain('Remove this session')
    expect(labels.at(-2)).toContain('Add a comment')
  })

  it('sees no comments on the Preview, which is the page as the team gets it', async () => {
    db.rights = ['svc.comment_read', 'svc.comment', 'svc.sessions']
    const user = show()
    await screen.findByRole('group', { name: 'Comments on Sermon' })
    await user.click(screen.getByRole('button', { name: 'Actions for this service' }))
    await user.click(screen.getByRole('menuitem', { name: /Preview/ }))
    await waitFor(() => expect(comments('Sermon')).toBeNull())
    expect(screen.queryByText('Keep this to twenty minutes')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Actions for Sermon' })).toBeNull()
  })
})

describe('everybody else on the running order', () => {
  it('sees no comments, has no way to add one, and never asks for them', async () => {
    show()
    await screen.findAllByText('Sermon')
    expect(comments('Sermon')).toBeNull()
    expect(screen.queryByText('Keep this to twenty minutes')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Actions for Sermon' })).toBeNull()
    expect(db.asked).toContain('service_sessions')
    expect(db.asked).not.toContain('service_session_comments')
  })

  it('who plans the running order but was given neither right sees none either', async () => {
    db.rights = ['svc.sessions', 'svc.manage']
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Actions for Sermon' }))
    expect(comments('Sermon')).toBeNull()
    expect(within(screen.getByRole('menu')).queryByRole('menuitem', { name: /Add a comment/ })).toBeNull()
    expect(db.asked).not.toContain('service_session_comments')
  })
})
