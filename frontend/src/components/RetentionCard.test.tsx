import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RetentionCard } from './RetentionCard'
import { renderWithClient, settingsRow } from '../test/settingsRow'
import { DEFAULT_SETTINGS } from '../lib/appSettings'

vi.mock('../auth/AuthContext', async () => (await import('../test/settingsRow')).adminAuth())
vi.mock('../lib/supabaseClient', async () => (await import('../test/settingsRow')).settingsRowMock())

beforeEach(() => settingsRow.reset({ ...DEFAULT_SETTINGS }))

async function show() {
  renderWithClient(<RetentionCard />)
  await screen.findByText('Team chat is kept for')
  return userEvent.setup()
}

const row = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}`) })

describe('Data & retention', () => {
  /*
   * The clocks 0123 added start at "for ever", so a church that never
   * opens this room loses nothing it did not already lose.
   */
  it('keeps everything new for ever until somebody sets a clock', async () => {
    await show()
    for (const label of [
      'Team chat is kept for',
      'Church Updates are kept for',
      'Polls are kept for',
      'Bell notifications are kept for',
      'The record of sent alerts is kept for',
    ]) {
      expect(within(row(label)).getByText('For ever'), label).toBeInTheDocument()
    }
    expect(within(row('Debrief minutes are kept for')).getByText('30 days')).toBeInTheDocument()
  })

  it('groups the clocks by what they clear', async () => {
    await show()
    for (const heading of ['Talk', 'After the service', 'Notifications & alerts']) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
    }
  })

  it('turns a for-ever clock into days, and saves only this room’s columns', async () => {
    const user = await show()
    await user.click(row('Team chat is kept for'))
    await user.click(screen.getByRole('switch', { name: 'Keep for ever: Team chat is kept for' }))
    expect(within(row('Team chat is kept for')).getByText('90 days')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => expect(settingsRow.writes).toHaveLength(1))
    const sent = settingsRow.writes[0]
    expect(sent).toMatchObject({ team_chat_retention_days: 90, notification_retention_days: null })
    expect(Object.keys(sent).sort()).toEqual(
      [
        'alert_retention_days',
        'board_clear_dow',
        'church_update_retention_days',
        'debrief_retention_days',
        'issue_retention_days',
        'notification_retention_days',
        'poll_retention_days',
        'team_chat_retention_days',
      ].sort(),
    )
  })

  it('puts a clock back to for ever with its default', async () => {
    settingsRow.reset({ ...DEFAULT_SETTINGS, poll_retention_days: 30 })
    const user = await show()
    expect(within(row('Polls are kept for')).getByText('30 days')).toBeInTheDocument()
    await user.click(row('Polls are kept for'))
    await user.click(screen.getByRole('button', { name: 'Use default' }))
    expect(within(row('Polls are kept for')).getByText('For ever')).toBeInTheDocument()
  })

  it('says plainly that these delete', async () => {
    await show()
    expect(screen.getByText(/These delete — they do not hide/)).toBeInTheDocument()
  })
})
