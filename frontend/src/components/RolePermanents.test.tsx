import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DepartmentRolesCard, type RolePermanentsRights } from './DepartmentRolesCard'
import { chooseOption, openOptions } from '../test/select'
import type { RolePermanent } from '../lib/rolePermanents'

/*
 * Permanent people on a role (0282), on the team's page. The Owner's
 * words: "have an option to add a role and for that role, add an option to
 * choose a permanent person(s). This way, in the rota, that role appears
 * by default with that person's name."
 *
 * What the database does with the rota is proved there. Here: what the
 * page shows, to whom, what it asks for, and what it says came of it.
 */

const state = vi.hoisted(() => ({
  permanents: [] as unknown[],
  set: [] as unknown[][],
  removed: [] as unknown[][],
  answer: 6,
  refuse: null as null | { message: string },
  inserted: [] as unknown[],
  toasts: [] as string[],
}))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true }) }))
vi.mock('../lib/useErrorText', () => ({ useErrorText: () => (e: unknown, fallback: string) => (e as { message?: string })?.message ?? fallback }))
vi.mock('../lib/toast', () => ({
  showToast: (text: string) => {
    state.toasts.push(text)
    return state.toasts.length
  },
}))
vi.mock('../lib/queries', () => ({
  fetchDepartmentRoles: () =>
    Promise.resolve([
      { id: 'c', name: 'Team Coordinator', department_id: 'd1', sort_order: 0, group_id: null },
      { id: 'sound', name: 'Sound Desk', department_id: 'd1', sort_order: 1, group_id: null },
      { id: 'camera', name: 'Camera', department_id: 'd1', sort_order: 2, group_id: null },
    ]),
  fetchRoleChecklistItems: () => Promise.resolve([]),
  fetchRoleGroups: () => Promise.resolve([]),
}))
vi.mock('../lib/rolePermanents', async (original) => ({
  ...(await original<typeof import('../lib/rolePermanents')>()),
  fetchRolePermanents: () => Promise.resolve(state.permanents),
  fetchTeamPeople: () =>
    Promise.resolve([
      { id: 'u-ama', name: 'Ama Owusu' },
      { id: 'u-ben', name: 'Ben Adu' },
      { id: 'u-joel', name: 'Joel Skaria' },
    ]),
  fetchServiceKinds: () => Promise.resolve(['English Service', 'Malayalam Service']),
  setRolePermanent: (...args: unknown[]) => {
    state.set.push(args)
    return state.refuse ? Promise.reject(state.refuse) : Promise.resolve(state.answer)
  },
  removeRolePermanent: (...args: unknown[]) => {
    state.removed.push(args)
    return state.refuse ? Promise.reject(state.refuse) : Promise.resolve(state.answer)
  },
}))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      insert: (row: unknown) => {
        state.inserted.push([table, row])
        // Plainly, or asking for the new row's id back.
        const plain = Promise.resolve({ error: null })
        return Object.assign(plain, {
          select: () => ({ single: () => Promise.resolve({ data: { id: 'new-role' }, error: null }) }),
        })
      },
    }),
    rpc: () => Promise.resolve({ error: null }),
  },
}))

const permanent = (over: Partial<RolePermanent>): RolePermanent => ({
  id: 'p1',
  role_id: 'sound',
  department_id: 'd1',
  user_id: 'u-joel',
  service_type: null,
  person: { id: 'u-joel', first_name: 'Joel', last_name: 'Skaria' },
  ...over,
})

const MAY: RolePermanentsRights = { canEdit: true, canEditCoordinator: true }

/** `null` is a card that was not asked to show permanent people at all. */
function show(permanents: RolePermanentsRights | null = MAY, canManage = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DepartmentRolesCard departmentId="d1" canManage={canManage} permanents={permanents ?? undefined} />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const row = async (name: string) => (await screen.findByText(name)).closest('li, div.rounded-\\[var\\(--radius-chip\\)\\]') as HTMLElement
const openPermanent = async (user: ReturnType<typeof userEvent.setup>, role: string) => {
  const r = await row(role)
  // Once who is permanent has been read: somebody who may not choose is only offered it when there is somebody to read.
  await user.click(await within(r).findByRole('button', { name: /^Permanent/ }))
  return r
}

beforeEach(() => {
  state.permanents = []
  state.set = []
  state.removed = []
  state.answer = 6
  state.refuse = null
  state.inserted = []
  state.toasts = []
})

describe('who is permanent, under the role', () => {
  it('names them on the role’s own line, with the kind of service where there is one', async () => {
    state.permanents = [
      permanent({}),
      permanent({ id: 'p2', user_id: 'u-ama', service_type: 'English Service', person: { id: 'u-ama', first_name: 'Ama', last_name: 'Owusu' } }),
    ]
    show()
    const sound = await row('Sound Desk')
    await waitFor(() => expect(within(sound).getByText('Joel Skaria · Ama Owusu (English Service)')).toBeInTheDocument())
    expect(within(sound).getByRole('button', { name: /^Permanent\s*2$/ })).toBeInTheDocument()
    // A role with nobody says nothing, and its button carries no number.
    const camera = await row('Camera')
    expect(within(camera).queryByText(/^Permanent:/)).toBeNull()
    expect(within(camera).getByRole('button', { name: /^Permanent$/ })).toBeInTheDocument()
  })

  it('says on the card what a permanent person is', async () => {
    show()
    expect(await screen.findByText(/A role can have permanent people, who are on the rota of every service without being chosen each time/)).toBeInTheDocument()
  })
})

describe('choosing them', () => {
  it('makes somebody permanent at every service, and says how many services they were put on', async () => {
    const user = show()
    const sound = await openPermanent(user, 'Sound Desk')
    expect(within(sound).getByText('Nobody is permanent on this role.')).toBeInTheDocument()
    const form = within(sound).getByRole('form', { name: 'Make somebody permanent on Sound Desk' })
    // Nothing chosen, nothing to do.
    expect(within(form).getByRole('button', { name: 'Make permanent' })).toBeDisabled()
    await chooseOption(user, within(form).getByLabelText('Person to make permanent on Sound Desk'), 'Joel Skaria')
    await user.click(within(form).getByRole('button', { name: 'Make permanent' }))
    await waitFor(() => expect(state.set).toEqual([['sound', 'u-joel', null]]))
    await waitFor(() => expect(state.toasts).toEqual(['Joel Skaria is permanent on Sound Desk: on the rota for 6 services to come']))
  })

  it('makes somebody permanent at one kind of service', async () => {
    state.answer = 3
    const user = show()
    const camera = await openPermanent(user, 'Camera')
    const form = within(camera).getByRole('form', { name: 'Make somebody permanent on Camera' })
    await chooseOption(user, within(form).getByLabelText('Person to make permanent on Camera'), 'Ama Owusu')
    const kinds = await openOptions(user, within(form).getByLabelText('Which services, on Camera'))
    // The one chosen carries a tick.
    expect(within(kinds).getAllByRole('option').map((o) => o.textContent?.replace('✓', ''))).toEqual(['Every service', 'English Service', 'Malayalam Service'])
    await user.click(within(kinds).getByRole('option', { name: 'English Service' }))
    await user.click(within(form).getByRole('button', { name: 'Make permanent' }))
    await waitFor(() => expect(state.set).toEqual([['camera', 'u-ama', 'English Service']]))
    await waitFor(() => expect(state.toasts).toEqual(['Ama Owusu is permanent on Camera: on the rota for 3 services to come']))
  })

  it('offers only the people on the team who are not permanent on that role already', async () => {
    state.permanents = [permanent({})]
    const user = show()
    const sound = await openPermanent(user, 'Sound Desk')
    const people = await openOptions(user, within(sound).getByLabelText('Person to make permanent on Sound Desk'))
    expect(within(people).getAllByRole('option').map((o) => o.textContent)).toEqual(['Ama Owusu', 'Ben Adu'])
  })

  it('changes which services somebody is permanent at, and says so', async () => {
    state.permanents = [permanent({})]
    state.answer = 0
    const user = show()
    const sound = await openPermanent(user, 'Sound Desk')
    const joel = within(sound).getByRole('listitem', { name: 'Joel Skaria' })
    await chooseOption(user, within(joel).getByLabelText('Services Joel Skaria is permanent at'), 'Malayalam Service')
    await waitFor(() => expect(state.set).toEqual([['sound', 'u-joel', 'Malayalam Service']]))
    await waitFor(() => expect(state.toasts).toEqual(['Joel Skaria is now permanent at Malayalam Service only']))
  })

  it('asks before ending it, and says how many services they came off', async () => {
    state.permanents = [permanent({})]
    state.answer = 4
    const user = show()
    const sound = await openPermanent(user, 'Sound Desk')
    await user.click(within(within(sound).getByRole('listitem', { name: 'Joel Skaria' })).getByRole('button', { name: 'Remove' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Stop Joel Skaria being permanent on Sound Desk?' })
    expect(dialog).toHaveTextContent('They come off the services still to come that this put them on.')
    expect(state.removed).toEqual([])
    await user.click(within(dialog).getAllByRole('button').at(-1)!)
    await waitFor(() => expect(state.removed).toEqual([['sound', 'u-joel']]))
    await waitFor(() => expect(state.toasts).toEqual(['Joel Skaria is no longer permanent on Sound Desk: off 4 services to come']))
  })

  it('shows the database’s refusal where it was asked', async () => {
    state.refuse = { message: 'They are not on this team. Add them to the team first.' }
    const user = show()
    const sound = await openPermanent(user, 'Sound Desk')
    const form = within(sound).getByRole('form', { name: 'Make somebody permanent on Sound Desk' })
    await chooseOption(user, within(form).getByLabelText('Person to make permanent on Sound Desk'), 'Ben Adu')
    await user.click(within(form).getByRole('button', { name: 'Make permanent' }))
    expect(await within(sound).findByRole('alert')).toHaveTextContent('They are not on this team. Add them to the team first.')
    expect(state.toasts).toEqual([])
  })
})

describe('who may', () => {
  it('lets somebody who may not choose read who is permanent, and change nothing', async () => {
    state.permanents = [permanent({ service_type: 'English Service' })]
    const user = show({ canEdit: false, canEditCoordinator: false }, false)
    const sound = await openPermanent(user, 'Sound Desk')
    const joel = within(sound).getByRole('listitem', { name: 'Joel Skaria' })
    expect(joel).toHaveTextContent('English Service')
    expect(within(sound).queryByRole('combobox')).toBeNull()
    expect(within(sound).queryByRole('button', { name: 'Remove' })).toBeNull()
    expect(within(sound).queryByRole('form')).toBeNull()
    // A role with nobody has nothing to read: no button at all.
    expect(within(await row('Camera')).queryByRole('button', { name: /^Permanent/ })).toBeNull()
  })

  it('keeps the Team Coordinator’s for a Head: somebody who arranges the rota and is no Head cannot choose one', async () => {
    const user = show({ canEdit: true, canEditCoordinator: false })
    const pinned = (await screen.findByText('Team Coordinator')).closest('div.rounded-\\[var\\(--radius-chip\\)\\]') as HTMLElement
    expect(within(pinned).queryByRole('button', { name: /^Permanent/ })).toBeNull()
    // The other roles are theirs to arrange.
    await openPermanent(user, 'Sound Desk')
    expect(screen.getByRole('form', { name: 'Make somebody permanent on Sound Desk' })).toBeInTheDocument()
  })

  it('lets a Head name a permanent Coordinator', async () => {
    const user = show()
    const pinned = (await screen.findByText('Team Coordinator')).closest('div.rounded-\\[var\\(--radius-chip\\)\\]') as HTMLElement
    await user.click(within(pinned).getByRole('button', { name: 'Permanent' }))
    const form = within(pinned).getByRole('form', { name: 'Make somebody permanent on Team Coordinator' })
    await chooseOption(user, within(form).getByLabelText('Person to make permanent on Team Coordinator'), 'Ama Owusu')
    await user.click(within(form).getByRole('button', { name: 'Make permanent' }))
    await waitFor(() => expect(state.set).toEqual([['c', 'u-ama', null]]))
  })

  it('shows and fetches nothing where the card was not asked to', async () => {
    state.permanents = [permanent({})]
    show(null)
    const sound = await row('Sound Desk')
    expect(within(sound).queryByRole('button', { name: /^Permanent/ })).toBeNull()
    expect(within(sound).queryByText(/Joel Skaria/)).toBeNull()
    expect(screen.queryByLabelText('Permanent person for the new role')).toBeNull()
  })
})

describe('a new role and who is always on it, in one go', () => {
  it('adds the role, then makes the chosen person permanent on it', async () => {
    state.answer = 8
    const user = show()
    await screen.findByText('Sound Desk')
    await user.type(screen.getByRole('textbox', { name: 'New role' }), 'Lights')
    await chooseOption(user, await screen.findByLabelText('Permanent person for the new role'), 'Ben Adu')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(state.inserted).toEqual([['department_roles', { department_id: 'd1', name: 'Lights', group_id: null }]]))
    await waitFor(() => expect(state.set).toEqual([['new-role', 'u-ben', null]]))
    await waitFor(() => expect(state.toasts).toEqual(['Ben Adu is permanent on Lights: on the rota for 8 services to come']))
    // Ready for the next one.
    expect(screen.getByRole('textbox', { name: 'New role' })).toHaveValue('')
  })

  it('adds a role with nobody on it when nobody is chosen', async () => {
    const user = show()
    await screen.findByText('Sound Desk')
    await user.type(screen.getByRole('textbox', { name: 'New role' }), 'Lights')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(state.inserted).toHaveLength(1))
    expect(state.set).toEqual([])
    expect(state.toasts).toEqual([])
  })

  it('keeps the role and says so when the person could not be made permanent', async () => {
    state.refuse = { message: 'They are not on this team. Add them to the team first.' }
    const user = show()
    await screen.findByText('Sound Desk')
    await user.type(screen.getByRole('textbox', { name: 'New role' }), 'Lights')
    await chooseOption(user, await screen.findByLabelText('Permanent person for the new role'), 'Ben Adu')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('They are not on this team. Add them to the team first.')).toBeInTheDocument()
    expect(state.inserted).toHaveLength(1)
    expect(state.toasts).toEqual([])
  })

  it('offers no permanent person to somebody who may add roles and not arrange the rota', async () => {
    show({ canEdit: false, canEditCoordinator: false })
    await screen.findByText('Sound Desk')
    expect(screen.getByRole('textbox', { name: 'New role' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Permanent person for the new role')).toBeNull()
  })
})
