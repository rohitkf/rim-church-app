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

const state = vi.hoisted(() => ({
  board: null as unknown,
  calls: [] as unknown[][],
  viewAs: null as unknown,
  hold: null as null | Promise<void>,
}))

vi.mock('../lib/plannerControls', async (original) => ({
  ...(await original<typeof import('../lib/plannerControls')>()),
  fetchPeopleOptions: () => Promise.resolve([{ id: 'p9', first_name: 'Grace', last_name: 'Mensah' }]),
}))
vi.mock('../lib/queries', async (original) => ({
  ...(await original<typeof import('../lib/queries')>()),
  fetchDepartments: () => Promise.resolve([{ id: 'd1', name: 'Intercessors' }]),
}))
vi.mock('../lib/usePrayerLive', () => ({ usePrayerLive: () => undefined }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ viewAs: state.viewAs }) }))
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
    respondToPrayer: (...args: unknown[]) => {
      state.calls.push(['respond', ...args])
      return state.hold ?? Promise.resolve()
    },
    markPrayerAnswered: record('answer'),
    closePrayer: record('close'),
    reopenPrayer: record('reopen'),
    removePrayer: record('remove'),
    addPrayerUpdate: record('update'),
    assignPrayer: record('assign'),
    unassignPrayer: record('unassign'),
    addToPrayerList: record('list-add'),
    removeFromPrayerList: record('list-remove'),
    savePrayerList: record('list-save'),
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
  state.board = { pastoral: false, moderator: false, may_assign: false, may_run_lists: false, lists: [], requests: [], ...board }
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

/** What is done now and then sits behind the card's ⋯. */
async function fromMenu(user: ReturnType<typeof userEvent.setup>, item: string | RegExp, card?: HTMLElement) {
  const where = card ? within(card) : screen
  await user.click(await where.findByRole('button', { name: 'Actions for this request' }))
  await user.click(screen.getByRole('menuitem', { name: item }))
}

beforeEach(() => {
  state.calls = []
  state.viewAs = null
})

describe('asking for prayer', () => {
  it('asks the whole church, anonymously if they choose', async () => {
    const user = show({})
    await user.click(screen.getByRole('button', { name: 'Ask for prayer' }))
    await user.type(screen.getByRole('textbox', { name: 'What to pray for' }), 'For my job interview')
    await user.click(screen.getByRole('switch', { name: 'Post anonymously' }))
    await user.click(screen.getByRole('button', { name: 'Ask the church' }))
    expect(state.calls).toEqual([['ask', 'general', 'For my job interview', true]])
    expect(await screen.findByText('Shared with the church.')).toBeInTheDocument()
    // The sheet has gone; the page says what happened.
    expect(screen.queryByRole('dialog', { name: 'Ask for prayer' })).toBeNull()
  })

  it('asks only the pastors, with no anonymous choice', async () => {
    const user = show({})
    await user.click(screen.getByRole('button', { name: 'Ask for prayer' }))
    await user.click(screen.getByRole('radio', { name: 'Only the pastors' }))
    expect(screen.queryByRole('switch', { name: 'Post anonymously' })).toBeNull()
    await user.type(screen.getByRole('textbox', { name: 'What to pray for' }), 'A family matter')
    await user.click(screen.getByRole('button', { name: 'Send to the pastors' }))
    expect(state.calls).toEqual([['ask', 'private', 'A family matter', false]])
  })
})

describe('the sections', () => {
  it('opens one at a time, each under its own row, Requests first', async () => {
    const user = show({ requests: [request(), request({ id: 'r2', mine: true, body: 'For peace' })] })
    const requests = await screen.findByRole('button', { name: /^Requests/ })
    const mine = screen.getByRole('button', { name: /^Mine/ })
    expect(requests).toHaveAttribute('aria-expanded', 'true')
    expect(mine).toHaveAttribute('aria-expanded', 'false')
    expect(within(screen.getByRole('region', { name: 'Requests' })).getByText('For my mother’s surgery')).toBeInTheDocument()

    await user.click(mine)
    expect(mine).toHaveAttribute('aria-expanded', 'true')
    expect(requests).toHaveAttribute('aria-expanded', 'false')
    expect(within(screen.getByRole('region', { name: 'Mine' })).getByText('For peace')).toBeInTheDocument()
    expect(screen.queryByText('For my mother’s surgery')).toBeNull()

    // Tapping the open one shuts it.
    await user.click(mine)
    expect(mine).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('For peace')).toBeNull()
  })
})

describe('praying for a request', () => {
  it('shows the counts on the responses and gives one, changeable and taken back on a second tap', async () => {
    const user = show({ requests: [request(), request({ id: 'r2', my_response: 'praying', body: 'For peace' })] })
    const first = (await screen.findByText('For my mother’s surgery')).closest('article')!
    expect(within(first).getByRole('button', { name: 'I prayed, 3' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(first).getByRole('button', { name: 'Still praying, 1' })).toBeInTheDocument()
    await user.click(within(first).getByRole('button', { name: 'Fasting, 0' }))
    const second = screen.getByText('For peace').closest('article')!
    expect(within(second).getByRole('button', { name: 'Still praying, 1' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(second).getByRole('button', { name: 'Still praying, 1' }))
    expect(state.calls).toEqual([
      ['respond', 'r1', 'fasting'],
      ['respond', 'r2', null],
    ])
  })

  it('shows the response and the counts the moment it is tapped, before the database answers', async () => {
    let release = () => {}
    state.hold = new Promise<void>((resolve) => (release = resolve))
    const user = show({ requests: [request()] })
    await user.click(await screen.findByRole('button', { name: 'Fasting, 0' }))
    expect(screen.getByRole('button', { name: 'Fasting, 1' })).toHaveAttribute('aria-pressed', 'true')
    release()
    state.hold = null
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
    await fromMenu(user, 'Reopen')
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
    await screen.findByRole('button', { name: /^Requests/ })
    expect(screen.queryByRole('button', { name: /^Pastors/ })).toBeNull()
  })

  it('lets the pastors read a private request and take one down', async () => {
    const user = show(
      { pastoral: true, moderator: true, requests: [request({ kind: 'private', body: 'A family matter' })] },
      '/prayer?tab=inbox',
    )
    expect(await screen.findByText('A family matter')).toBeInTheDocument()
    await fromMenu(user, 'Take down')
    await user.click(screen.getByRole('button', { name: 'Take it down' }))
    expect(state.calls).toEqual([['remove', 'r1']])
  })
})

describe('praying on the pastors’ behalf', () => {
  it('asks a member to pray for a private request, keeping the name back unless ticked', async () => {
    const user = show(
      { pastoral: true, moderator: true, may_assign: true, requests: [request({ kind: 'private', body: 'A family matter' })] },
      '/prayer?tab=inbox',
    )
    await fromMenu(user, 'Ask someone to pray')
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('switch', { name: 'Show who asked' })).not.toBeChecked()
    await user.type(within(dialog).getByRole('textbox', { name: 'Who to ask: add a person' }), 'Gra')
    await user.click(await within(dialog).findByRole('button', { name: 'Add Grace Mensah' }))
    await user.type(within(dialog).getByRole('textbox', { name: 'A word for them' }), 'This week, please')
    await user.click(within(dialog).getByRole('button', { name: 'Ask them' }))
    expect(state.calls).toEqual([['assign', 'r1', ['p9'], false, 'This week, please']])
  })

  it('shows a member what they were asked to pray for, by whom', async () => {
    show({
      requests: [
        request({
          kind: 'private',
          author: null,
          body: 'A family matter',
          assigned_to_me: { note: 'This week, please', by: { first_name: 'Pastor', last_name: 'John' }, at: new Date().toISOString() },
        }),
      ],
    }, '/prayer?tab=assigned')
    expect(await screen.findByText(/Pastor John asked you to pray for this: “This week, please”/)).toBeInTheDocument()
    expect(screen.getByText('Name kept private')).toBeInTheDocument()
  })

  it('shows who was asked and how they responded, and lets an assigner take one off', async () => {
    const user = show({
      may_assign: true,
      requests: [request({ assignees: [{ id: 'p9', first_name: 'Grace', last_name: 'Mensah', show_name: false, response: 'praying' }] })],
    })
    const asked = await screen.findByRole('list', { name: 'Asked to pray' })
    expect(asked).toHaveTextContent('Grace Mensah· still praying')
    await user.click(within(asked).getByRole('button', { name: 'No longer ask Grace Mensah' }))
    expect(state.calls).toEqual([['unassign', 'r1', 'p9']])
  })
})

describe('prayer lists', () => {
  const list = { id: 'l1', name: 'Friday chain prayer', mine: true, members: null, items: [{ request_id: 'r1', show_name: false }] }

  it('shows the lists somebody is on, with their requests', async () => {
    const user = show({ lists: [list], requests: [request()] }, '/prayer?tab=lists')
    await user.click(await screen.findByRole('button', { name: /Friday chain prayer/ }))
    expect(screen.getByText('For my mother’s surgery')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit list' })).toBeNull()
  })

  it('lets a runner make a list, and add a request to one', async () => {
    const user = show({ may_run_lists: true, lists: [{ ...list, items: [], members: { teams: [], people: [] } }], requests: [request()] }, '/prayer?tab=lists')
    await user.click(await screen.findByRole('button', { name: 'New prayer list' }))
    await user.type(screen.getByRole('textbox', { name: 'List name' }), 'Sunday intercession')
    await user.click(screen.getByRole('button', { name: 'Make list' }))
    expect(state.calls).toEqual([['list-save', null, 'Sunday intercession', { teams: [], people: [] }]])

    state.calls = []
    await user.click(screen.getByRole('button', { name: /^Requests/ }))
    await fromMenu(user, 'Add to a list')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add' }))
    expect(state.calls).toEqual([['list-add', 'l1', 'r1', false]])
  })
})

describe('while the Owner previews a role', () => {
  it('shows a Church Member no Pastors tab and no private request, though the database said pastoral', async () => {
    state.viewAs = { as: 'church' }
    show({ pastoral: true, moderator: true, requests: [request({ kind: 'private', body: 'A family matter' }), request()] }, '/prayer?tab=inbox')
    await screen.findByRole('button', { name: /^Requests/ })
    expect(screen.queryByRole('button', { name: /^Pastors/ })).toBeNull()
    expect(screen.queryByText('A family matter')).toBeNull()
    expect(screen.getByText('For my mother’s surgery')).toBeInTheDocument()
  })

  it('shows a Pastor the inbox', async () => {
    state.viewAs = { as: 'pastor' }
    show({ pastoral: true, moderator: true, requests: [request({ kind: 'private', body: 'A family matter' })] }, '/prayer?tab=inbox')
    expect(await screen.findByText('A family matter')).toBeInTheDocument()
  })
})
