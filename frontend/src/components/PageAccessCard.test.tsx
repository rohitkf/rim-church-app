import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PageAccessCard } from './PageAccessCard'
import { renderWithClient, settingsRow } from '../test/settingsRow'
import { DEFAULT_SETTINGS } from '../lib/appSettings'

vi.mock('../auth/AuthContext', async () => (await import('../test/settingsRow')).adminAuth())
vi.mock('../lib/supabaseClient', async () => (await import('../test/settingsRow')).settingsRowMock())

beforeEach(() => settingsRow.reset({ ...DEFAULT_SETTINGS }))

async function show() {
  renderWithClient(<PageAccessCard />)
  await screen.findByRole('radiogroup', { name: 'Preview as' })
  return userEvent.setup()
}

const tile = (label: string) => screen.getByRole('listitem', { name: new RegExp(`^${label}:`) })

describe('who sees what', () => {
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
    for (const item of within(screen.getByRole('list', { name: /Pages a Admin can open/ })).getAllByRole('listitem')) {
      expect(item.getAttribute('aria-label')).toMatch(/can open$/)
    }
  })

  it('relights the preview as soon as a page is opened wider, before saving', async () => {
    const user = await show()
    const rota = screen.getByRole('radiogroup', { name: 'Who can open Team Rota' })
    await user.click(within(rota).getByRole('radio', { name: 'Everyone' }))
    expect(tile('Team Rota')).toHaveAccessibleName('Team Rota: can open')
    expect(screen.getByText(/Not saved yet/)).toBeInTheDocument()
    expect(settingsRow.writes).toHaveLength(0)
  })

  it('saves only who-sees-what, and only what differs from the defaults', async () => {
    const user = await show()
    await user.click(within(screen.getByRole('radiogroup', { name: 'Who can open Inventory' })).getByRole('radio', { name: 'Heads' }))
    await user.click(within(screen.getByRole('radiogroup', { name: 'Who can open Messages' })).getByRole('radio', { name: 'Teams' }))
    await user.click(screen.getByRole('button', { name: 'Save who sees what' }))
    await waitFor(() => expect(settingsRow.writes).toHaveLength(1))
    expect(settingsRow.writes[0]).toEqual({ page_access: { inventory: 'leads' } })
  })

  it('offers only the choices the database can honour', async () => {
    await show()
    const debriefs = screen.getByRole('radiogroup', { name: 'Who can open Debriefs' })
    expect(within(debriefs).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Teams', 'Heads'])
    // A fixed page has no choice to make, and says why.
    expect(screen.queryByRole('radiogroup', { name: 'Who can open Checklists' })).toBeNull()
    expect(screen.getByText('Ticked by whoever the rota put on, so it needs a team.')).toBeInTheDocument()
  })

  it('says, page by page, whether the database follows the choice or only the menu does', async () => {
    await show()
    const row = (label: string) => screen.getByRole('radiogroup', { name: `Who can open ${label}` }).closest('li')!
    expect(within(row('Messages')).getByText('Database')).toBeInTheDocument()
    expect(within(row('Service Planner')).getByText('Hides page')).toBeInTheDocument()
  })

  it('arrives with the church’s saved choices, and can put the app’s own back', async () => {
    settingsRow.reset({ ...DEFAULT_SETTINGS, page_access: { rota: 'everyone' } })
    const user = await show()
    expect(tile('Team Rota')).toHaveAccessibleName('Team Rota: can open')
    await user.click(screen.getByRole('button', { name: 'Restore defaults' }))
    expect(tile('Team Rota')).toHaveAccessibleName('Team Rota: cannot open')
    await user.click(screen.getByRole('button', { name: 'Save who sees what' }))
    await waitFor(() => expect(settingsRow.writes).toEqual([{ page_access: {} }]))
  })
})
