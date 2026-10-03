import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DisplayCard } from './DisplayCard'
import { renderWithClient, settingsRow } from '../test/settingsRow'
import { DEFAULT_SETTINGS } from '../lib/appSettings'
import { DASHBOARD_PANELS } from '../lib/display'

vi.mock('../auth/AuthContext', async () => (await import('../test/settingsRow')).adminAuth())
vi.mock('../lib/supabaseClient', async () => (await import('../test/settingsRow')).settingsRowMock())

beforeEach(() => settingsRow.reset({ ...DEFAULT_SETTINGS }))

async function show() {
  renderWithClient(<DisplayCard />)
  await screen.findByRole('radiogroup', { name: 'Service days to list' })
  return userEvent.setup()
}

describe('Dashboard & lists', () => {
  it('starts from the app as it is: one service day, open on the day, every panel on, sections folded', async () => {
    await show()
    expect(within(screen.getByRole('radiogroup', { name: 'Service days to list' })).getByRole('radio', { name: '1' })).toBeChecked()
    expect(within(screen.getByRole('radiogroup', { name: 'The next service’s card' })).getByRole('radio', { name: 'On the day' })).toBeChecked()
    for (const panel of DASHBOARD_PANELS) {
      expect(screen.getByRole('switch', { name: `Show ${panel.label}` })).toBeChecked()
    }
    expect(screen.getByRole('switch', { name: 'Upcoming services start open' })).not.toBeChecked()
    expect(screen.getByRole('switch', { name: 'Finished services start open' })).not.toBeChecked()
  })

  it('saves the choices as one object, and nothing else', async () => {
    const user = await show()
    await user.click(within(screen.getByRole('radiogroup', { name: 'Service days to list' })).getByRole('radio', { name: '3' }))
    await user.click(screen.getByRole('switch', { name: 'Show Activity' }))
    await user.click(screen.getByRole('switch', { name: 'Upcoming services start open' }))
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => expect(settingsRow.writes).toHaveLength(1))
    const sent = settingsRow.writes[0] as { display: Record<string, Record<string, unknown>> }
    expect(Object.keys(sent)).toEqual(['display'])
    expect(sent.display.dashboard.serviceDays).toBe(3)
    expect((sent.display.dashboard.show as Record<string, boolean>).activity).toBe(false)
    expect(sent.display.lists.upcomingOpen).toBe(true)
  })

  it('offers nothing to save until something has changed', async () => {
    await show()
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled()
  })

  it('says it changes what is drawn, not who may see it', async () => {
    await show()
    expect(screen.getByText(/This only changes what is drawn/)).toBeInTheDocument()
  })
})
