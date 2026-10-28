import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PagesCard } from './PagesCard'
import { NavNamesContext } from '../lib/navNames'
import { DEFAULT_SETTINGS } from '../lib/appSettings'
import { SETTINGS_PAGES } from '../lib/pageSettings'
import { decide, type Holder, type Overrides, type PermissionGrant, type TeamOverrides } from '../lib/permissions'
import { chooseOption, openOptions } from '../test/select'

/*
 * Settings › Page by Page: each page's settings and rules in one place,
 * the rules a team at a time, and one Save for the lot.
 */

let viewer: Holder = { myId: 'me', owner: false, admin: true, ledTeams: [], memberTeams: [] }
let stored: Overrides = {}
let storedTeams: TeamOverrides = {}
let storedGrants: PermissionGrant[] = []

vi.mock('../lib/usePermissions', () => ({
  PERMISSIONS_KEY: ['role-permissions'],
  usePermissions: () => ({
    can: (cap: Parameters<typeof decide>[2], where?: Parameters<typeof decide>[3]) =>
      decide(stored, viewer, cap, where, storedTeams),
    overrides: stored,
    teams: storedTeams,
    grants: storedGrants,
  }),
}))
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ isAdmin: viewer.admin, isSuperAdmin: viewer.owner, session: { user: { id: 'me' } } }),
}))
vi.mock('../lib/queries', () => ({
  fetchDepartments: () =>
    Promise.resolve([
      { id: 'd1', name: 'Media', handbook_url: null, color: '#a855f7', is_service_flow: false, is_worship: false, created_at: 'x', updated_at: 'x' },
      { id: 'd2', name: 'Worship', handbook_url: null, color: '#ef4444', is_service_flow: false, is_worship: true, created_at: 'x', updated_at: 'x' },
    ]),
}))
vi.mock('../lib/useTeamStyle', () => ({ useTeamStyle: () => ({ teamStyle: 'dot' }) }))

const db = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  writes: [] as Record<string, unknown>[],
  rpc: [] as { fn: string; args: unknown }[],
}))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        maybeSingle: () => Promise.resolve({ data: { ...db.row }, error: null }),
        order: () =>
          Promise.resolve({
            data: [
              { id: 'p1', first_name: 'Asha', last_name: 'Mathew' },
              { id: 'p2', first_name: 'Ben', last_name: 'Thomas' },
            ],
            error: null,
          }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: () => {
          db.writes.push(patch)
          return Promise.resolve({ error: null })
        },
      }),
    }),
    rpc: (fn: string, args: unknown) => {
      db.rpc.push({ fn, args })
      return Promise.resolve({ error: null })
    },
  },
}))

beforeEach(() => {
  viewer = { myId: 'me', owner: false, admin: true, ledTeams: [], memberTeams: [] }
  stored = {}
  storedTeams = {}
  storedGrants = []
  db.row = { ...DEFAULT_SETTINGS }
  db.writes = []
  db.rpc = []
})

async function show(at = '/settings/pages', names: Record<string, string> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[at]}>
        <NavNamesContext.Provider value={names}>
          <PagesCard />
        </NavNamesContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await screen.findByRole('button', { name: /^Team Rota/ })
  return userEvent.setup()
}

// A section's name is the page's, then what it holds; a setting's row can start with the same word.
const section = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}\\s*(\\d|opens|Nothing)`) })
const teamCard = (name: string) =>
  within(screen.getByRole('region', { name: 'Team by team' })).getByRole('button', { name: new RegExp(`^${name}`) })

describe('Page by Page', () => {
  it('lists every page as a folded section under the menu’s headings, saying what each holds', async () => {
    await show()
    for (const page of SETTINGS_PAGES) expect(section(page.label)).toHaveAttribute('aria-expanded', 'false')
    for (const heading of ['Home', 'Sunday', 'Talk', 'Everywhere']) expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
    expect(section('Team Rota')).toHaveTextContent(/\d+ settings · \d+ rules · opens to Teams/)
    expect(section('Team Chat')).toHaveTextContent('1 setting · 3 rules')
    expect(section('Notifications')).toHaveTextContent('2 settings')
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('opens a page to its settings, the room with its own controls, who can open it, each team, and the church’s rule', async () => {
    const user = await show()
    await user.click(section('Team Rota'))
    // Its own settings, as rows — the same rows the Timings room draws.
    expect(screen.getByRole('button', { name: /^Days ahead/ })).toHaveTextContent('7 days')
    expect(screen.getByRole('switch', { name: 'Always show a service somebody is rostered on' })).toBeChecked()
    expect(screen.getByRole('button', { name: /^Services are kept for/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Raising opens before the service/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Settings › Team Rota/ })).toHaveAttribute('href', '/settings/rota')
    expect(screen.getByRole('radiogroup', { name: 'Who can open Team Rota' })).toBeInTheDocument()
    // A card per team, each saying what its profiles may do here.
    // Out of the box a Head may do four of the rota's five: deleting a release request is not theirs.
    expect(teamCard('Media')).toHaveTextContent('Head 4 of 5 · Asst Head 4 of 5 · Coordinator none · Member none')
    expect(teamCard('Worship')).toHaveAttribute('aria-expanded', 'false')
    // And the church-wide grid, a column per profile.
    expect(screen.getByRole('heading', { name: 'For every team — the church’s rule' })).toBeInTheDocument()
    expect(within(screen.getByRole('rowheader', { name: /Assign somebody to a role/ }).closest('tr')!).getByRole('combobox', { name: /Assisting Head$/ })).toHaveTextContent(/^Team$/)
  })

  it('gives one team a rule of its own, no wider than the team, and saves it with the team', async () => {
    const user = await show()
    await user.click(section('Team Rota'))
    await user.click(teamCard('Worship'))
    const cell = screen.getByRole('combobox', { name: 'Assign roles — Team Member on Worship' })
    expect(cell).toHaveTextContent(/^As the church \(No\)$/)
    const list = await openOptions(user, cell)
    expect(within(list).getAllByRole('option').map((o) => o.firstChild?.textContent)).toEqual(['As the church (No)', 'No', 'Team'])
    await user.keyboard('{Escape}')
    // Admins are the church’s: no column for them here.
    expect(screen.queryByRole('combobox', { name: /Admin on Worship$/ })).toBeNull()
    await chooseOption(user, cell, 'Team')
    expect(teamCard('Worship')).toHaveTextContent('Own rules')
    // Four, not five: deleting a release request is never a member's, so it is not theirs to count.
    expect(teamCard('Worship')).toHaveTextContent('Member 1 of 4')
    expect(screen.getByRole('list', { name: 'Changes to save' })).toHaveTextContent('Worship · Team Member · Assign somebody to a role: As the church → Their team')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(db.rpc).toHaveLength(1))
    expect(db.rpc[0]).toEqual({
      fn: 'set_permissions',
      args: { p_changes: [{ role: 'member', capability: 'rota.assign', reach: 'team', department: 'd2' }] },
    })
    expect(db.writes).toHaveLength(0)
  })

  it('shows a team’s stored rule in force, and lets it follow the church again', async () => {
    storedTeams = { d1: { 'rota.assign': { assistant: 'none' } } }
    const user = await show()
    await user.click(section('Team Rota'))
    expect(teamCard('Media')).toHaveTextContent('Asst Head 3 of 5')
    await user.click(teamCard('Media'))
    const cell = screen.getByRole('combobox', { name: 'Assign roles — Assisting Head on Media' })
    expect(cell).toHaveTextContent(/^No$/)
    await chooseOption(user, cell, /^As the church/)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(db.rpc).toHaveLength(1))
    expect(db.rpc[0].args).toEqual({ p_changes: [{ role: 'assistant', capability: 'rota.assign', reach: null, department: 'd1' }] })
  })

  it('saves a setting, a page’s opening rule and a church-wide cell together, sending only what moved', async () => {
    const user = await show()
    await user.click(section('Team Rota'))
    await user.click(screen.getByRole('switch', { name: 'Always show a service somebody is rostered on' }))
    await user.click(within(screen.getByRole('radiogroup', { name: 'Who can open Team Rota' })).getByRole('radio', { name: 'Everyone' }))
    const row = screen.getByRole('rowheader', { name: /Assign somebody to a role/ }).closest('tr')!
    await chooseOption(user, within(row).getByRole('combobox', { name: /Team Member$/ }), 'Team')
    const changes = screen.getByRole('list', { name: 'Changes to save' })
    expect(changes).toHaveTextContent('Always show a service somebody is rostered on')
    expect(changes).toHaveTextContent('Who can open which pages')
    // A page's level is a cell in the grid, but one change to the reader.
    expect(screen.getByRole('heading', { name: '3 changes to save' })).toBeInTheDocument()
    expect(changes).toHaveTextContent('Team Member · Assign somebody to a role: No → Their team')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(db.writes).toHaveLength(1))
    expect(db.writes[0]).toEqual({ always_show_my_services: false })
    // A page's level is its cells in the grid (0215), saved with the rest of the grid.
    expect(db.rpc[0].args).toEqual({
      p_changes: [
        { role: 'member', capability: 'rota.assign', reach: 'team' },
        { role: 'newcomer', capability: 'page.rota', reach: 'all' },
      ],
    })
  })

  it('copies one team’s rules to another as a draft, and saves them as that team’s', async () => {
    // Worship keeps the rota's assigning to its own Head and lets its members tick checklists.
    storedTeams = { d2: { 'rota.assign': { member: 'none' }, 'day.verify': { member: 'team' } } }
    const user = await show()
    await chooseOption(user, screen.getByRole('combobox', { name: 'Copy the rules of' }), 'Worship')
    expect(screen.getByText(/Worship has 2 rules of its own/)).toBeInTheDocument()
    await chooseOption(user, screen.getByRole('combobox', { name: 'Copy them to' }), 'Media')
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(screen.getByRole('status')).toHaveTextContent('Worship’s rules are now Media’s, in the draft.')
    expect(db.rpc).toEqual([])
    const changes = screen.getByRole('list', { name: 'Changes to save' })
    expect(changes).toHaveTextContent('Media · Team Member')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(db.rpc).toHaveLength(1))
    const sent = (db.rpc[0].args as { p_changes: unknown[] }).p_changes
    expect(sent).toEqual(
      expect.arrayContaining([
        { role: 'member', capability: 'rota.assign', reach: 'none', department: 'd1' },
        { role: 'member', capability: 'day.verify', reach: 'team', department: 'd1' },
      ]),
    )
    expect(sent).toHaveLength(2)
  })

  it('relights Issues’ opening rule as soon as everyone may raise one, before Save', async () => {
    const user = await show()
    expect(section('Issues')).toHaveTextContent('opens to Teams')
    await user.click(section('Issues'))
    await user.click(screen.getByRole('combobox', { name: 'Who can raise an issue' }))
    await user.click(await screen.findByRole('option', { name: 'Everyone signed in' }))
    expect(section('Issues')).toHaveTextContent('opens to Everyone')
    expect(screen.getByRole('list', { name: 'Changes to save' })).toHaveTextContent('Who can raise one')
  })

  it('calls each page what the church renamed it to, with the app’s name under it', async () => {
    const user = await show('/settings/pages', { '/polls': 'Votes' })
    const polls = screen.getByRole('button', { name: /^Votes/ })
    expect(polls).toHaveTextContent('was Polls')
    expect(screen.queryByRole('button', { name: /^Polls/ })).not.toBeInTheDocument()
    await user.click(polls)
    // A setting names the pages it moves by the church's names too.
    const body = within(document.getElementById('page-polls-body')!)
    expect(body.getAllByText('Votes', { exact: true }).length).toBeGreaterThan(0)
    expect(body.queryByText('Polls', { exact: true })).not.toBeInTheDocument()
  })

  it('opens the page an anchor names', async () => {
    await show('/settings/pages#availability')
    expect(section('Availability')).toHaveAttribute('aria-expanded', 'true')
    expect(section('Team Rota')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Closes the night before, at')).toBeInTheDocument()
  })

  // 0184: the person at the desk on a Sunday can press Session started
  // without being able to rename or delete the plan.
  it('gives a team and a person some of the planner’s buttons, and saves them with the rest', async () => {
    const user = await show()
    await user.click(section('Service Planner'))
    const card = screen.getByRole('region', { name: 'Planner buttons' })
    expect(within(card).getByText(/Nobody else yet/)).toBeInTheDocument()

    await chooseOption(user, within(card).getByRole('combobox', { name: 'Add a team' }), 'Media')
    const media = within(card).getByRole('group', { name: 'Buttons Media may use' })
    // A new holder starts with the four that run the order.
    expect(within(media).getByRole('checkbox', { name: /Session started/ })).toBeChecked()
    expect(within(media).getByRole('checkbox', { name: /Skip/ })).toBeChecked()
    expect(within(media).getByRole('checkbox', { name: /Remove a session/ })).not.toBeChecked()
    await user.click(within(media).getByRole('checkbox', { name: /Skip/ }))
    await user.click(within(media).getByRole('checkbox', { name: /End service/ }))

    await user.type(within(card).getByRole('textbox', { name: 'Add a person' }), 'ash')
    await user.click(within(card).getByRole('button', { name: 'Add Asha Mathew' }))
    await user.click(within(card).getByRole('button', { name: 'Give Asha Mathew every button' }))

    expect(screen.getByRole('list', { name: 'Changes to save' })).toHaveTextContent('Who has the Service Planner’s buttons')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    // Each button is a capability since 0211, each holder's tick a grant.
    await waitFor(() => expect(db.rpc.some((c) => c.fn === 'set_permission_grants')).toBe(true))
    const sent = db.rpc.find((c) => c.fn === 'set_permission_grants')!.args as { p_changes: unknown[] }
    expect(sent.p_changes).toEqual([
      ...['start', 'hold', 'add_time', 'end'].map((c) => ({ capability: `planner.${c}`, team: 'd1', reach: 'all' })),
      ...['start', 'hold', 'add_time', 'skip', 'substitute', 'add_below', 'remove', 'end'].map((c) => ({
        capability: `planner.${c}`,
        person: 'p1',
        reach: 'all',
      })),
    ])
    // And nothing of it goes into the settings row.
    expect(db.writes).toHaveLength(0)
  })

  it('takes a holder away again', async () => {
    storedGrants = [{ id: 'g1', capability: 'planner.start', userId: null, departmentId: 'd2', reach: 'all' }]
    const user = await show()
    await user.click(section('Service Planner'))
    const card = screen.getByRole('region', { name: 'Planner buttons' })
    expect(within(card).getByRole('list', { name: 'Who has planner buttons' })).toHaveTextContent('Worship')
    await user.click(within(card).getByRole('button', { name: 'Remove Worship' }))
    expect(within(card).getByText(/Nobody else yet/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(db.rpc).toHaveLength(1))
    expect(db.rpc[0]).toEqual({
      fn: 'set_permission_grants',
      args: { p_changes: [{ capability: 'planner.start', team: 'd2', reach: null }] },
    })
  })

  it('offers nothing to save to somebody who may only read it', async () => {
    viewer = { ...viewer, admin: false, ledTeams: ['d1'], headTeams: ['d1'] }
    const user = await show()
    await user.click(section('Availability'))
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    await user.click(teamCard('Media'))
    expect(screen.queryAllByRole('combobox')).toHaveLength(0)
  })
})

/*
 * Timings, Data & Retention and Dashboard & Lists were rooms of their own,
 * drawing the same rows; they folded in here, and so did what their tests
 * held them to.
 */
describe('a setting’s row on its page', () => {
  /** Type a number into a setting's dial, the way somebody does: tap the number, type, Enter. */
  async function typeInto(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
    const row = screen.getByRole('button', { name: new RegExp(`^${label}`) })
    if (row.getAttribute('aria-expanded') !== 'true') await user.click(row)
    const dial = screen.getByRole('slider', { name: label }).closest('.select-none') as HTMLElement
    await user.click(within(dial).getByTitle('Type a value'))
    const field = within(dial).getByRole('spinbutton', { name: label })
    await user.clear(field)
    await user.type(field, `${value}{Enter}`)
  }
  const save = () => screen.getByRole('button', { name: 'Save' })

  it('offers nothing to save until something has changed, and sits still at the end until then', async () => {
    await show('/settings/pages#checklists')
    expect(save()).toBeDisabled()
    expect(save().parentElement?.className).not.toMatch(/sticky/)
  })

  it('says a change is not saved yet, keeps Save in reach, and sends only the number typed', async () => {
    const user = await show('/settings/pages#checklists')
    await typeInto(user, 'Editing stays open for', '720')
    expect(screen.getByText(/Not saved yet/)).toBeInTheDocument()
    expect(db.writes).toHaveLength(0)
    // Sticky, clear of the dock, so a phone need not scroll to find it.
    expect(save().parentElement?.className).toMatch(/sticky/)
    expect(save().parentElement?.className).toMatch(/bottom-\[calc\(5rem/)
    await user.click(save())
    await waitFor(() => expect(db.writes).toHaveLength(1))
    // Only the column that moved, so no stale copy undoes a choice made since.
    expect(db.writes[0]).toEqual({ edit_grace_minutes: 720 })
  })

  it('is one row, its value said as a person would, opening to its dial one at a time', async () => {
    const user = await show('/settings/pages#debriefs')
    expect(screen.queryByRole('slider')).toBeNull()
    const row = screen.getByRole('button', { name: /^Teams can write their debrief for/ })
    expect(row).toHaveAttribute('aria-expanded', 'false')
    expect(within(row).getByText('12 h')).toBeInTheDocument()
    await user.click(row)
    expect(screen.getByRole('slider', { name: 'Teams can write their debrief for' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Debrief minutes are kept for/ }))
    expect(screen.getByRole('slider', { name: 'Debrief minutes are kept for' })).toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'Teams can write their debrief for' })).toBeNull()
  })

  it('marks a moved setting until it is saved, and offers its default back', async () => {
    const user = await show('/settings/pages#checklists')
    await typeInto(user, 'Editing stays open for', '720')
    const row = screen.getByRole('button', { name: /^Editing stays open for/ })
    expect(within(row).getByLabelText('Changed, not saved yet')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Use default' }))
    expect(within(row).queryByLabelText('Changed, not saved yet')).toBeNull()
    expect(save()).toBeDisabled()
  })

  it('keeps the long explanation folded until asked for', async () => {
    await show('/settings/pages#rota')
    expect(screen.getAllByText('How this works').length).toBeGreaterThan(0)
    expect(screen.getByText(/A safety net over the window above/)).not.toBeVisible()
  })

  it('can stop the sent-alerts record clearing at all', async () => {
    const user = await show('/settings/pages#alerts')
    await chooseOption(user, screen.getByRole('combobox', { name: 'Day the sent-alerts record clears' }), 'Never')
    await user.click(save())
    await waitFor(() => expect(db.writes).toHaveLength(1))
    expect(db.writes[0]).toEqual({ alert_clear_dow: null })
  })

  it('sends what the Dashboard shows as one object, and nothing else', async () => {
    const user = await show('/settings/pages#dashboard')
    await user.click(within(screen.getByRole('radiogroup', { name: 'Service days to list' })).getByRole('radio', { name: '3' }))
    await user.click(save())
    await waitFor(() => expect(db.writes).toHaveLength(1))
    const sent = db.writes[0] as { display: { dashboard: { serviceDays: number } } }
    expect(Object.keys(sent)).toEqual(['display'])
    expect(sent.display.dashboard.serviceDays).toBe(3)
  })

  it('says what is kept with no clock, and the upload limits, under the app itself', async () => {
    await show('/settings/pages#app')
    const kept = screen.getByRole('region', { name: 'Kept until somebody deletes them' })
    expect(within(kept).getByText('Inventory')).toBeInTheDocument()
    const limits = screen.getByRole('region', { name: 'Uploads and the app’s own logs' })
    expect(within(limits).getByText('Team handbook').closest('li')).toHaveTextContent('10 MB')
    expect(within(limits).getByText(/keep one week, cleared every Tuesday/)).toBeInTheDocument()
  })

  it('says plainly that a clock deletes, and that what a page shows is not who may see it', async () => {
    await show()
    expect(screen.getByText(/deletes them when it runs out — it does not hide them/)).toBeInTheDocument()
    expect(screen.getByText(/changes only what is drawn, never who may see it/)).toBeInTheDocument()
  })
})
