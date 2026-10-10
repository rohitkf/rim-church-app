import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RetentionCard } from './RetentionCard'
import { renderWithClient, settingsRow } from '../test/settingsRow'
import { DEFAULT_SETTINGS } from '../lib/appSettings'
import { chooseOption } from '../test/select'

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
   * The church's own rules (0128): two weeks for a service and all of it,
   * a month for chat posts, the newest ten in a bell, alerts cleared on
   * Tuesdays, settled feedback after two weeks.
   */
  it('starts at the church’s chosen clocks', async () => {
    await show()
    expect(within(row('Services are kept for')).getByText('14 days')).toBeInTheDocument()
    expect(within(row('Debrief minutes are kept for')).getByText('14 days')).toBeInTheDocument()
    expect(within(row('Resolved issues are kept for')).getByText('14 days')).toBeInTheDocument()
    expect(within(row('Team chat is kept for')).getByText('30 days')).toBeInTheDocument()
    expect(within(row('A new Church Update ends after')).getByText('30 days')).toBeInTheDocument()
    expect(within(row('A poll clears')).getByText('7 days')).toBeInTheDocument()
    expect(within(row('Each person’s bell keeps')).getByText('10 newest')).toBeInTheDocument()
    expect(within(row('Settled feedback is kept for')).getByText('14 days')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Day the sent-alerts record clears' })).toHaveTextContent('Tuesday')
  })

  it('groups the clocks by what they clear, and lists what is kept on purpose', async () => {
    await show()
    for (const heading of ['Talk', 'After the service', 'Notifications & alerts', 'Feedback', 'Kept until somebody deletes them', 'Uploads and the app’s own logs']) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
    }
    expect(screen.getByText('Team handbook').closest('li')).toHaveTextContent('10 MB')
    expect(screen.getByText('Inventory document').closest('li')).toHaveTextContent('5 MB')
    expect(screen.getByText(/keep one week, cleared every Tuesday/)).toBeInTheDocument()
  })

  it('changes a clock and saves only this room’s columns', async () => {
    const user = await show()
    await user.click(row('Team chat is kept for'))
    await user.click(screen.getByRole('switch', { name: 'Keep for ever: Team chat is kept for' }))
    expect(within(row('Team chat is kept for')).getByText('For ever')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => expect(settingsRow.writes).toHaveLength(1))
    const sent = settingsRow.writes[0]
    expect(sent).toMatchObject({ team_chat_retention_days: null, service_retention_days: 14, notification_keep_count: 10 })
    expect(Object.keys(sent).sort()).toEqual(
      [
        'alert_clear_dow',
        'board_clear_dow',
        'church_update_retention_days',
        'debrief_retention_days',
        'feedback_retention_days',
        'issue_retention_days',
        'notification_keep_count',
        'notification_retention_days',
        'poll_retention_days',
        'service_retention_days',
        'team_chat_retention_days',
      ].sort(),
    )
  })

  it('puts a changed clock back to its default', async () => {
    settingsRow.reset({ ...DEFAULT_SETTINGS, service_retention_days: 60 })
    const user = await show()
    expect(within(row('Services are kept for')).getByText('60 days')).toBeInTheDocument()
    await user.click(row('Services are kept for'))
    await user.click(screen.getByRole('button', { name: 'Use default' }))
    expect(within(row('Services are kept for')).getByText('14 days')).toBeInTheDocument()
  })

  it('can stop the sent-alerts record clearing at all', async () => {
    const user = await show()
    await chooseOption(user, screen.getByRole('combobox', { name: 'Day the sent-alerts record clears' }), 'Never')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => expect(settingsRow.writes).toHaveLength(1))
    expect(settingsRow.writes[0]).toMatchObject({ alert_clear_dow: null })
  })

  it('says plainly that these delete', async () => {
    await show()
    expect(screen.getByText(/These delete — they do not hide/)).toBeInTheDocument()
  })
})
