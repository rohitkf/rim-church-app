import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PrayerPage } from './PrayerPage'
import type { PrayerBoard, PrayerRequest } from '../lib/prayer'

/*
 * Prayer Requests: ask privately or the whole church; respond; mark your
 * own answered as a testimony; the pastors' inbox only for the pastors.
 */

const state = vi.hoisted(() => ({ board: null as unknown, calls: [] as unknown[][] }))

vi.mock('../lib/useErrorText', () => ({ useErrorText: () => (_e: unknown, fallback: string) => fallback }))
vi.mock('../lib/prayer', async (original) => {
  const real = await original<typeof import('../lib/prayer')>()
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      state.calls.push([name, ...args])
      return Promise.resolve()
    }
  return {
    ...real,
    fetchPrayerBoard: () => Promise.resolve(state.board),
    askForPrayer: record('ask'),
    respondToPrayer: record('respond'),
    markPrayerAnswered: record('answer'),
    closePrayer: record('close'),
    reopenPrayer: record('reopen'),
    removePrayer: record('remove'),
    addPrayerUpdate: record('update'),
  }
})

const request = (over: Partial<PrayerRequest> = {}): PrayerRequest => ({
  id: 'r1',
  kind: 'general',
  status: 'open',
  body: 'For my mother’s surgery',
  anonymous: false,
  mine: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  answered_at: null,
  closed_at: null,
  testimony: null,
  testimony_named: false,
  shared: false,
  author: { id: 'a', first_name: 'Ama', last_name: 'Owusu' },
  counts: { prayed: 3, praying: 1, fasting: 0 },
  my_response: null,
  responders: null,
  updates: [],
  ...over,
})

function show(board: Partial<PrayerBoard>, path = '/prayer') {
  state.board = { pastoral: false, moderator: false, requests: [], ...board }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <PrayerPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  state.calls = []
})

describe('asking for prayer', () => {
  it('asks the whole church, anonymously if they choose', async () => {
    const user = show({})
    await user.type(screen.getByRole('textbox', { name: 'What to pray for' }), 'For my job interview')
    await user.click(screen.getByRole('switch', { name: 'Post anonymously' }))
    await user.click(screen.getByRole('button', { name: 'Ask the church' }))
    expect(state.calls).toEqual([['ask', 'general', 'For my job interview', true]])
    expect(await screen.findByText('Shared with the church.')).toBeInTheDocument()
  })

  it('asks only the pastors, with no anonymous choice', async () => {
    const user = show({})
    await user.click(screen.getByRole('radio', { name: 'Only the pastors' }))
    expect(screen.queryByRole('switch', { name: 'Post anonymously' })).toBeNull()
    await user.type(screen.getByRole('textbox', { name: 'What to pray for' }), 'A family matter')
    await user.click(screen.getByRole('button', { name: 'Send to the pastors' }))
    expect(state.calls).toEqual([['ask', 'private', 'A family matter', false]])
  })
})

describe('praying for a request', () => {
  it('shows the counts and gives one response, changeable and taken back on a second tap', async () => {
    const user = show({ requests: [request(), request({ id: 'r2', my_response: 'praying', body: 'For peace' })] })
    expect(await screen.findAllByText('3 prayed · 1 still praying')).toHaveLength(2)
    const first = screen.getByText('For my mother’s surgery').closest('article')!
    await user.click(within(first).getByRole('button', { name: 'Fasting' }))
    const second = screen.getByText('For peace').closest('article')!
    await user.click(within(second).getByRole('button', { name: 'Still praying' }))
    expect(state.calls).toEqual([
      ['respond', 'r1', 'fasting'],
      ['respond', 'r2', null],
    ])
  })

  it('hides who asked an anonymous request', async () => {
    show({ requests: [request({ anonymous: true, author: null })] })
    expect(await screen.findByText('Anonymous')).toBeInTheDocument()
    expect(screen.queryByText(/Ama/)).toBeNull()
  })
})

describe('your own requests', () => {
  it('are marked answered with your words, anonymous unless you say', async () => {
    const user = show({ requests: [request({ mine: true })] }, '/prayer?tab=mine')
    await user.click(await screen.findByRole('button', { name: 'Mark answered' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('switch', { name: 'Show my name' })).not.toBeChecked()
    await user.type(within(dialog).getByRole('textbox', { name: 'What happened' }), 'She is home and well')
    await user.click(within(dialog).getByRole('button', { name: 'Mark answered' }))
    expect(state.calls).toEqual([['answer', 'r1', 'She is home and well', false, false]])
  })

  it('are kept private when answered unless shared as a testimony', async () => {
    const user = show({ requests: [request({ mine: true, kind: 'private' })] }, '/prayer?tab=mine')
    await user.click(await screen.findByRole('button', { name: 'Mark answered' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('switch', { name: 'Show my name' })).toBeNull()
    await user.click(within(dialog).getByRole('switch', { name: 'Share as a testimony' }))
    await user.click(within(dialog).getByRole('switch', { name: 'Show my name' }))
    await user.click(within(dialog).getByRole('button', { name: 'Mark answered' }))
    expect(state.calls).toEqual([['answer', 'r1', '', true, true]])
  })

  it('can be reopened once answered or closed', async () => {
    const user = show({ requests: [request({ mine: true, status: 'closed' })] }, '/prayer?tab=mine')
    await user.click(await screen.findByRole('button', { name: 'Reopen' }))
    expect(state.calls).toEqual([['reopen', 'r1']])
  })
})

describe('testimonies and the pastors', () => {
  it('shows what God has done, in their words', async () => {
    show(
      { requests: [request({ status: 'answered', testimony: 'She is home and well', answered_at: new Date().toISOString(), author: null })] },
      '/prayer?tab=testimonies',
    )
    expect(await screen.findByText('“She is home and well”')).toBeInTheDocument()
    expect(screen.getByText('Anonymous')).toBeInTheDocument()
  })

  it('gives the pastors their inbox, and nobody else', async () => {
    show({ requests: [request({ kind: 'private', body: 'A family matter' })] })
    await screen.findByRole('tablist')
    expect(screen.queryByRole('tab', { name: /Pastors/ })).toBeNull()
  })

  it('lets the pastors read a private request and take one down', async () => {
    const user = show(
      { pastoral: true, moderator: true, requests: [request({ kind: 'private', body: 'A family matter' })] },
      '/prayer?tab=inbox',
    )
    expect(await screen.findByText('A family matter')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Take down' }))
    await user.click(screen.getByRole('button', { name: 'Take it down' }))
    expect(state.calls).toEqual([['remove', 'r1']])
  })
})
