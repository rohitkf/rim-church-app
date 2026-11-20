import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReceptionSettingsCard } from './ReceptionSettingsCard'

const CONF = 'e1'
const CAMP = 'e2'
const world = vi.hoisted(() => ({
  editable: true,
  grants: [] as { capability: string; userId: string | null; departmentId: string | null; reach: string }[],
  limits: [] as { user_id: string | null; department_id: string | null; event_ids: string[] }[],
  stateFails: false,
  calls: [] as [string, unknown][],
}))

vi.mock('../lib/usePermissions', () => ({
  PERMISSIONS_KEY: ['permissions'],
  usePermissions: () => ({ can: () => world.editable, grants: world.grants }),
}))
vi.mock('../lib/queries', () => ({ fetchDepartments: () => Promise.resolve([{ id: 'ushers', name: 'Ushers', color: null }]) }))
vi.mock('../lib/plannerControls', () => ({
  fetchPeopleOptions: () =>
    Promise.resolve([
      { id: 'ama', first_name: 'Ama', last_name: 'Owusu' },
      { id: 'ben', first_name: 'Ben', last_name: 'Joseph' },
      { id: 'kofi', first_name: 'Kofi', last_name: 'Mensah' },
    ]),
}))
vi.mock('./ReceptionLockCard', () => ({ ReceptionLockCard: () => null }))
vi.mock('../lib/useErrorText', () => ({ useErrorText: () => (_err: unknown, fallback: string) => fallback }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (fn: string, args?: unknown) => {
      if (fn === 'reception_event_limits_state') {
        if (world.stateFails) return Promise.resolve({ data: null, error: { code: '42501', message: 'no' } })
        return Promise.resolve({
          data: {
            limits: world.limits,
            events: [
              { id: CAMP, title: 'Youth Camp', status: 'draft', cancelled: false, starts_at: '2027-02-12T10:00:00Z', ends_at: '2027-02-14T15:00:00Z' },
              { id: CONF, title: 'Pastors & Leaders Conference 2026', status: 'published', cancelled: false, starts_at: '2026-11-20T18:30:00Z', ends_at: '2026-11-21T17:00:00Z' },
            ],
          },
          error: null,
        })
      }
      world.calls.push([fn, args])
      return Promise.resolve({ data: null, error: null })
    },
  },
}))

const door = (who: { userId?: string; departmentId?: string }) =>
  ['reg.door', 'reg.door_pay', 'reg.walk_in', 'reg.door_fix'].map((capability) => ({ capability, userId: who.userId ?? null, departmentId: who.departmentId ?? null, reach: 'all' }))

function show() {
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <ReceptionSettingsCard />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return user
}
const row = async (name: string) => (await screen.findByText(name)).closest('li')!
const events = (holder: HTMLElement, name: string) => within(holder).getByRole('radiogroup', { name: `Which events ${name} has Reception for` })
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Save who works Reception' }))

beforeEach(() => {
  Object.assign(world, { editable: true, stateFails: false, calls: [], limits: [] })
  world.grants = [...door({ userId: 'ama' }), ...door({ userId: 'ben' }), ...door({ departmentId: 'ushers' })]
})

describe('Settings › Reception: which events each holder has', () => {
  it('gives everybody every event until somebody chooses otherwise', async () => {
    show()
    for (const name of ['Ama Owusu', 'Ben Joseph', 'Ushers']) {
      const holder = await row(name)
      await waitFor(() => expect(within(events(holder, name)).getByRole('radio', { name: 'Every event' })).toBeChecked())
      expect(within(holder).queryByRole('group', { name: `Events ${name} has Reception for` })).toBeNull()
    }
  })

  it('keeps a person to the events ticked, and saves only that', async () => {
    const user = show()
    const ama = await row('Ama Owusu')
    await user.click(await within(ama).findByRole('radio', { name: 'Chosen events' }))
    const list = within(ama).getByRole('group', { name: 'Events Ama Owusu has Reception for' })
    // Nothing is ticked for them: said so, in case it is saved like that.
    expect(within(list).getAllByRole('checkbox').every((c) => !(c as HTMLInputElement).checked)).toBe(true)
    expect(within(ama).getByText('No event chosen: Ama Owusu cannot open Reception for any event.')).toBeInTheDocument()
    await user.click(within(list).getByRole('checkbox', { name: /Pastors & Leaders Conference 2026/ }))
    expect(within(ama).queryByText(/No event chosen/)).toBeNull()
    await save(user)
    await waitFor(() => expect(world.calls).toEqual([['set_reception_event_limits', { p_changes: [{ person: 'ama', events: [CONF] }] }]]))
  })

  it('keeps a team to its events the same way', async () => {
    const user = show()
    const ushers = await row('Ushers')
    await user.click(await within(ushers).findByRole('radio', { name: 'Chosen events' }))
    await user.click(within(ushers).getByRole('checkbox', { name: /Youth Camp/ }))
    await save(user)
    await waitFor(() => expect(world.calls).toEqual([['set_reception_event_limits', { p_changes: [{ team: 'ushers', events: [CAMP] }] }]]))
  })

  it('shows what somebody is already kept to, and gives every event back', async () => {
    world.limits = [{ user_id: 'ben', department_id: null, event_ids: [CONF] }]
    const user = show()
    const ben = await row('Ben Joseph')
    await waitFor(() => expect(within(events(ben, 'Ben Joseph')).getByRole('radio', { name: 'Chosen events' })).toBeChecked())
    expect(within(ben).getByRole('checkbox', { name: /Pastors & Leaders Conference 2026/ })).toBeChecked()
    expect(within(ben).getByRole('checkbox', { name: /Youth Camp/ })).not.toBeChecked()
    // The draft event says it is one.
    expect(within(ben).getByText(/Draft/)).toBeInTheDocument()
    // Nothing to save until something changes.
    expect(screen.getByRole('button', { name: 'Save who works Reception' })).toBeDisabled()
    await user.click(within(ben).getByRole('radio', { name: 'Every event' }))
    await save(user)
    await waitFor(() => expect(world.calls).toEqual([['set_reception_event_limits', { p_changes: [{ person: 'ben', events: null }] }]]))
  })

  it('adds somebody and keeps them to one event in one save: the ticks first, then the events', async () => {
    const user = show()
    await user.type(await screen.findByRole('textbox', { name: 'Add a person' }), 'kofi')
    await user.click(await screen.findByRole('button', { name: 'Add Kofi Mensah' }))
    const kofi = await row('Kofi Mensah')
    await user.click(within(kofi).getByRole('radio', { name: 'Chosen events' }))
    await user.click(within(kofi).getByRole('checkbox', { name: /Pastors & Leaders Conference 2026/ }))
    await save(user)
    await waitFor(() => expect(world.calls.map((c) => c[0])).toEqual(['set_permission_grants', 'set_reception_event_limits']))
    expect(world.calls[1][1]).toEqual({ p_changes: [{ person: 'kofi', events: [CONF] }] })
  })

  it('sends nothing about somebody taken off Reception: the database drops their limit itself', async () => {
    world.limits = [{ user_id: 'ben', department_id: null, event_ids: [CONF] }]
    const user = show()
    const ben = await row('Ben Joseph')
    await user.click(within(ben).getByRole('button', { name: 'Remove Ben Joseph' }))
    await save(user)
    await waitFor(() => expect(world.calls.map((c) => c[0])).toEqual(['set_permission_grants']))
  })

  it('says, to somebody who may only look, which events each has', async () => {
    world.editable = false
    world.limits = [{ user_id: 'ben', department_id: null, event_ids: [CONF] }]
    show()
    expect(within(await row('Ben Joseph')).getByText('Pastors & Leaders Conference 2026')).toBeInTheDocument()
    expect(within(await row('Ama Owusu')).getByText('every event')).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Chosen events' })).toBeNull()
  })

  it('keeps the ticks working where the events cannot be read', async () => {
    world.stateFails = true
    show()
    const ama = await row('Ama Owusu')
    expect(within(ama).getByRole('checkbox', { name: /Check people in/ })).toBeChecked()
    await new Promise((r) => setTimeout(r, 60))
    expect(screen.queryByRole('radio', { name: 'Every event' })).toBeNull()
  })
})
