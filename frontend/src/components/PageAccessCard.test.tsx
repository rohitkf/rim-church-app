import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { PageAccessCard } from './PageAccessCard'
import { renderWithClient, settingsRow } from '../test/settingsRow'
import { DEFAULT_SETTINGS } from '../lib/appSettings'

vi.mock('../auth/AuthContext', async () => (await import('../test/settingsRow')).adminAuth())
vi.mock('../lib/supabaseClient', async () => (await import('../test/settingsRow')).settingsRowMock())

beforeEach(() => settingsRow.reset({ ...DEFAULT_SETTINGS }))

async function show() {
  renderWithClient(
    <MemoryRouter>
      <PageAccessCard />
    </MemoryRouter>,
  )
  await screen.findByRole('radiogroup', { name: 'Preview as' })
  return userEvent.setup()
}

const tile = (label: string) =>
  within(screen.getByRole('list', { name: /^Pages a / })).getByRole('listitem', { name: new RegExp(`^${label}:`) })
/** A page's row under its menu heading, named for its level. */
const row = (label: string) =>
  screen
    .getAllByRole('listitem', { name: new RegExp(`^${label}: (Everyone|Teams|Heads|Admins)$`) })
    .find((li) => li.closest('ul')?.getAttribute('aria-label') === null)!

describe('who sees what', () => {
  it('previews Overwatch and a Pastor too, through what opens the menu (0214)', async () => {
    settingsRow.reset({ ...DEFAULT_SETTINGS, overwatch_pages: { volunteers: false, inventory: false } })
    const user = await show()
    await user.click(screen.getByRole('radio', { name: 'Overwatch' }))
    const pages = screen.getByRole('list', { name: 'Pages Overwatch can open' })
    expect(within(pages).getByRole('listitem', { name: 'Team Rota: can open' })).toBeInTheDocument()
    expect(within(pages).getByRole('listitem', { name: 'Inventory: cannot open' })).toBeInTheDocument()
    expect(within(pages).getByRole('listitem', { name: 'Volunteers: cannot open' })).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Pastor' }))
    const prayer = within(screen.getByRole('list', { name: 'Pages a Pastor can open' }))
    expect(prayer.getByRole('listitem', { name: 'Prayer Requests: can open' })).toBeInTheDocument()
    expect(prayer.getByRole('listitem', { name: 'Team Rota: cannot open' })).toBeInTheDocument()
  })

  it('previews a Church Member’s pages, as the app has them out of the box', async () => {
    await show()
    expect(tile('Giving')).toHaveAccessibleName('Giving: can open')
    expect(tile('Team Rota')).toHaveAccessibleName('Team Rota: cannot open')
    expect(tile('Volunteers')).toHaveAccessibleName('Volunteers: cannot open')
  })

  it('previews each profile, and an Admin can open everything', async () => {
    const user = await show()
    await user.click(screen.getByRole('radio', { name: 'Team Member' }))
    expect(tile('Team Rota')).toHaveAccessibleName('Team Rota: can open')
    expect(tile('Volunteers')).toHaveAccessibleName('Volunteers: cannot open')
    await user.click(screen.getByRole('radio', { name: 'Admin' }))
    for (const item of within(screen.getByRole('list', { name: /Pages an Admin can open/ })).getAllByRole('listitem')) {
      expect(item.getAttribute('aria-label')).toMatch(/can open$/)
    }
  })

  it('arrives with the church’s saved choices, and marks what moved from the app’s own', async () => {
    // A page's level is its cells in the grid (0215): the Rota opened to Church Members.
    settingsRow.reset({ ...DEFAULT_SETTINGS }, [{ role_key: 'newcomer', capability: 'page.rota', reach: 'all' }])
    await show()
    await waitFor(() => expect(tile('Team Rota')).toHaveAccessibleName('Team Rota: can open'))
    const rota = row('Team Rota')
    expect(rota).toHaveAccessibleName('Team Rota: Everyone')
    expect(within(rota).getByLabelText('Changed from the app’s default')).toBeInTheDocument()
  })

  it('makes no choice here: each page links to its own section of Page by Page, where it is made', async () => {
    await show()
    // One place for each choice: no picker, no Save in this room.
    expect(screen.queryByRole('radiogroup', { name: /^Who can open/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Save/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Change who can open Inventory, in Page by Page' })).toHaveAttribute(
      'href',
      '/settings/pages#inventory',
    )
    // A fixed page has nothing to change, and says why.
    expect(within(row('Checklists')).queryByRole('link')).toBeNull()
    expect(screen.getByText('Ticked by whoever the rota put on, so it needs a team.')).toBeInTheDocument()
  })

  it('says, page by page, whether the database follows the choice or only the menu does', async () => {
    await show()
    expect(within(row('Messages')).getByText('Database')).toBeInTheDocument()
    expect(within(row('Service Planner')).getByText('Hides page')).toBeInTheDocument()
  })
})
