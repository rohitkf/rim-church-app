import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StageSettingsCard } from './StageSettingsCard'
import { settingsRow } from '../test/settingsRow'
import { DEFAULT_SETTINGS } from '../lib/appSettings'

/*
 * Settings › Stage layout: ticks per team, the asks waiting, the clear day.
 */

const db = vi.hoisted(() => ({
  saved: null as null | { rows: unknown[]; remove: string[] },
  decided: [] as { id: string; approve: boolean }[],
}))

vi.mock('../auth/AuthContext', async () => (await import('../test/settingsRow')).adminAuth())
vi.mock('../lib/supabaseClient', async () => (await import('../test/settingsRow')).settingsRowMock())
vi.mock('../lib/queries', () => ({
  fetchDepartments: () =>
    Promise.resolve([{ id: 'd1', name: 'Worship', handbook_url: null, color: '#ff0000', is_service_flow: false, is_worship: true, created_at: 'x', updated_at: 'x' }]),
}))
vi.mock('../lib/stage', async () => {
  const actual = await vi.importActual<typeof import('../lib/stage')>('../lib/stage')
  return {
    ...actual,
    fetchStageTeamAccess: () => Promise.resolve([]),
    fetchStageTemplates: () => Promise.resolve([]),
    fetchStageTemplateRequests: () =>
      Promise.resolve([
        { id: 'r1', name: 'Full band', blocks: [{}, {}, {}], requested_by: 'u', requested_at: '2026-10-17T10:00:00Z', status: 'pending', decided_by: null, decided_at: null, requester: { id: 'u', first_name: 'Rohit', last_name: 'K' } },
      ]),
    setStageTeamAccess: (rows: unknown[], remove: string[]) => {
      db.saved = { rows, remove }
      return Promise.resolve()
    },
    decideStageTemplateRequest: (id: string, approve: boolean) => {
      db.decided.push({ id, approve })
      return Promise.resolve()
    },
  }
})

function show() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <StageSettingsCard />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  db.saved = null
  db.decided = []
  settingsRow.reset({ ...DEFAULT_SETTINGS })
})

describe('Settings › Stage layout', () => {
  it('lists every team with a tick per privilege, and saves the ticked ones', async () => {
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('checkbox', { name: 'Worship: Add' }))
    await user.click(screen.getByRole('checkbox', { name: 'Worship: Edit' }))
    await user.click(screen.getByRole('button', { name: 'Save who may draw' }))
    await waitFor(() =>
      expect(db.saved).toEqual({
        rows: [{ department_id: 'd1', can_add: true, can_edit: true, can_delete: false, can_comment: false, can_templates: false }],
        remove: [],
      }),
    )
  })

  it('shows a template ask with who and how big, and answers it', async () => {
    const user = userEvent.setup()
    show()
    expect(await screen.findByText('Full band')).toBeInTheDocument()
    expect(screen.getByText(/3 blocks · Rohit K/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(db.decided).toEqual([{ id: 'r1', approve: true }]))
  })

  it('sets the clear day and hour, with Never on offer', async () => {
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('combobox', { name: 'Day stage layouts clear' }))
    await user.click(await screen.findByRole('option', { name: 'Wednesday' }))
    await user.click(screen.getByRole('combobox', { name: 'Hour stage layouts clear' }))
    await user.click(await screen.findByRole('option', { name: '04:00' }))
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => expect(settingsRow.writes).toEqual([{ stage_clear_dow: 3, stage_clear_hour: 4 }]))
    await user.click(screen.getByRole('combobox', { name: 'Day stage layouts clear' }))
    await user.click(await screen.findByRole('option', { name: 'Never' }))
    expect(screen.queryByRole('combobox', { name: 'Hour stage layouts clear' })).toBeNull()
  })
})
