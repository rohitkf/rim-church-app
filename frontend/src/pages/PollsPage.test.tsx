import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PollsPage } from './PollsPage'
import { audienceLabel } from '../lib/pollAudience'

const auth = {
  session: { user: { id: 'me' } },
  isAdmin: false,
  ledDepartmentIds: [] as string[],
}
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../lib/appSettings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/appSettings')>()
  return { ...actual, useAppSettings: () => actual.DEFAULT_SETTINGS }
})

vi.mock('../lib/queries', () => ({
  fetchDepartments: () =>
    Promise.resolve([
      { id: 'd1', name: 'Media', color: '#ff0000' },
      { id: 'd2', name: 'Worship', color: '#00ff00' },
    ]),
}))

const state = vi.hoisted(() => ({
  polls: [] as Record<string, unknown>[],
  inserts: [] as { table: string; row: unknown }[],
  updates: [] as { table: string; row: unknown }[],
  deletes: [] as { table: string; ids: unknown }[],
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    // The counts come from the database (0172): one row per option that
    // has a vote, with the number of people who answered the poll.
    rpc: (_fn: string, args: { p_polls: string[] }) => {
      const rows: { poll_id: string; option_id: string; votes: number; voters: number }[] = []
      for (const p of state.polls) {
        if (!args.p_polls.includes(p.id as string)) continue
        const votes = p.votes as { option_id: string; user_id: string }[]
        const voters = new Set(votes.map((v) => v.user_id)).size
        const byOption = new Map<string, number>()
        for (const v of votes) byOption.set(v.option_id, (byOption.get(v.option_id) ?? 0) + 1)
        for (const [option_id, n] of byOption) rows.push({ poll_id: p.id as string, option_id, votes: n, voters })
      }
      return Promise.resolve({ data: rows, error: null })
    },
    from: (table: string) => {
      const builder: Record<string, unknown> = {}
      const rows =
        table === 'team_polls'
          ? state.polls
          : table === 'services'
            ? [{ id: 's1', date: '2026-10-04', service_type: 'English Service' }]
            : table === 'profiles'
              ? [{ id: 'p1', first_name: 'Grace', last_name: 'Mensah' }]
              : []
      builder.select = () => builder
      builder.order = () => builder
      builder.gte = () => builder
      builder.limit = () => builder
      builder.eq = () => builder
      builder.delete = () => {
        builder.deleting = true
        return builder
      }
      builder.update = (row: unknown) => {
        state.updates.push({ table, row })
        return builder
      }
      builder.in = (_col: string, ids: unknown) => {
        if (builder.deleting) state.deletes.push({ table, ids })
        return builder
      }
      builder.insert = (row: unknown) => {
        state.inserts.push({ table, row })
        return builder
      }
      builder.single = () => Promise.resolve({ data: { id: 'new-poll' }, error: null })
      builder.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null })
      return builder
    },
  },
}))

const poll = (over: Record<string, unknown>) => ({
  id: 'q1',
  audience: 'everyone',
  department_id: null,
  service_id: null,
  recipient_ids: [],
  created_by: 'someone',
  question: 'Which Sunday suits the picnic?',
  choice_mode: 'single',
  anonymous: true,
  closes_at: null,
  clears_at: new Date(Date.now() + 6 * 86_400_000).toISOString(),
  created_at: new Date().toISOString(),
  department: null,
  service: null,
  options: [
    { id: 'o1', label: '4 October', sort_order: 0 },
    { id: 'o2', label: '11 October', sort_order: 1 },
  ],
  votes: [{ option_id: 'o1', user_id: 'x' }],
  ...over,
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PollsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  auth.isAdmin = false
  auth.ledDepartmentIds = []
  state.polls = []
  state.inserts = []
  state.updates = []
  state.deletes = []
})

describe('who a poll says it is for', () => {
  it('names each audience', () => {
    const base = { department: null, service: null, recipient_ids: [] as string[] }
    expect(audienceLabel({ ...base, audience: 'everyone' })).toBe('Everyone')
    expect(audienceLabel({ ...base, audience: 'team', department: { name: 'Media' } })).toBe('Media')
    expect(audienceLabel({ ...base, audience: 'people', recipient_ids: ['a', 'b'] })).toBe('2 people')
    expect(
      audienceLabel({
        ...base,
        audience: 'service',
        service: { date: '2026-10-04', service_type: 'English Service' },
      }),
    ).toMatch(/^Serving at English Service · /)
    expect(
      audienceLabel({
        ...base,
        audience: 'service',
        department: { name: 'Media' },
        service: { date: '2026-10-04', service_type: 'English Service' },
      }),
    ).toMatch(/^Media at English Service/)
  })
})

describe('the Polls page', () => {
  it('shows a member the polls put to them, to answer but not to ask or delete', async () => {
    state.polls = [poll({})]
    show()
    expect(await screen.findByText('Which Sunday suits the picnic?')).toBeInTheDocument()
    expect(screen.getByText('Everyone')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /4 October/ })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'New poll' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Delete poll/ })).not.toBeInTheDocument()
  })

  it('lets a Head ask only their own team, whole or at a service', async () => {
    auth.ledDepartmentIds = ['d1']
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'New poll' }))
    expect(screen.queryByRole('button', { name: 'Everyone' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'People' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'A team' })).toHaveAttribute('aria-pressed', 'true')

    await user.type(screen.getByLabelText('Question'), 'Rehearsal night?')
    await user.type(screen.getByLabelText('Option 1'), 'Tuesday')
    await user.type(screen.getByLabelText('Option 2'), 'Thursday')
    await user.click(screen.getByRole('button', { name: 'Post poll' }))

    await waitFor(() => expect(state.inserts).toHaveLength(2))
    expect(state.inserts[0].row).toMatchObject({
      audience: 'team',
      department_id: 'd1',
      service_id: null,
      recipient_ids: [],
      question: 'Rehearsal night?',
    })
  })

  it('lets an Admin ask everyone', async () => {
    auth.isAdmin = true
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'New poll' }))
    expect(screen.getByRole('button', { name: 'Everyone' })).toHaveAttribute('aria-pressed', 'true')
    await user.type(screen.getByLabelText('Question'), 'Picnic?')
    await user.type(screen.getByLabelText('Option 1'), 'Yes')
    await user.type(screen.getByLabelText('Option 2'), 'No')
    await user.click(screen.getByRole('button', { name: 'Post poll' }))
    await waitFor(() => expect(state.inserts).toHaveLength(2))
    expect(state.inserts[0].row).toMatchObject({ audience: 'everyone', department_id: null })
    // Every poll clears; with no deadline the form starts it a week out (0128).
    const clears = new Date((state.inserts[0].row as { clears_at: string }).clears_at).getTime()
    expect(Math.round((clears - Date.now()) / 86_400_000)).toBe(7)
  })

  it('will not post a people poll with nobody picked', async () => {
    auth.isAdmin = true
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'New poll' }))
    await user.click(screen.getByRole('button', { name: 'People' }))
    await user.type(screen.getByLabelText('Question'), 'Can you drive?')
    await user.type(screen.getByLabelText('Option 1'), 'Yes')
    await user.type(screen.getByLabelText('Option 2'), 'No')
    expect(screen.getByRole('button', { name: 'Post poll' })).toBeDisabled()
    await user.click(await screen.findByLabelText('Grace Mensah'))
    expect(screen.getByRole('button', { name: 'Post poll' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Post poll' }))
    await waitFor(() => expect(state.inserts).toHaveLength(2))
    expect(state.inserts[0].row).toMatchObject({ audience: 'people', recipient_ids: ['p1'] })
  })

  it('keeps an anonymous poll to counts, and shows the names it is sent', async () => {
    state.polls = [
      poll({
        id: 'anon',
        question: 'Anonymous one?',
        // A member's own row is all the database sends on an anonymous poll.
        votes: [{ option_id: 'o1', user_id: 'me', voter: { first_name: 'Me', last_name: 'Myself' } }],
      }),
      poll({
        id: 'seen',
        question: 'Seen by a leader?',
        votes: [
          { option_id: 'o1', user_id: 'me', voter: { first_name: 'Me', last_name: 'Myself' } },
          { option_id: 'o2', user_id: 'g', voter: { first_name: 'Grace', last_name: 'Mensah' } },
        ],
      }),
      poll({
        id: 'named',
        question: 'Named one?',
        anonymous: false,
        votes: [{ option_id: 'o2', user_id: 'k', voter: { first_name: 'Kofi', last_name: 'Asante' } }],
      }),
    ]
    show()
    expect(await screen.findByText('Anonymous one?')).toBeInTheDocument()
    expect(screen.getAllByText('Anonymous')).toHaveLength(2)
    expect(screen.getByText('Named')).toBeInTheDocument()
    // Only the person's own row came back: counts, no names, no note.
    const anon = within(document.getElementById('poll-anon')!)
    expect(anon.queryByText('Me Myself')).not.toBeInTheDocument()
    expect(anon.queryByText(/shown to you as a leader/)).not.toBeInTheDocument()
    // Somebody else's row came back: the database let this person see the
    // names, their own among them.
    const seen = within(document.getElementById('poll-seen')!)
    // Once under the option they picked, once in the list of who answered.
    expect(seen.getAllByText('Me Myself')).toHaveLength(2)
    expect(seen.getAllByText('Grace Mensah')).toHaveLength(2)
    expect(seen.getByText(/shown to you as a leader/)).toBeInTheDocument()
    // A named poll shows who picked what, and needs no note.
    expect(screen.getAllByText('Kofi Asante')).toHaveLength(2)
    expect(screen.getAllByText(/shown to you as a leader/)).toHaveLength(1)
    // Nobody else's row on the anonymous poll: no list of who answered.
    expect(anon.queryByRole('list', { name: 'Who answered' })).not.toBeInTheDocument()
  })

  it('lists who answered once each, with their teams', async () => {
    const teams = (...names: [string, string][]) =>
      names.map(([name, member_type]) => ({ member_type, department: { name } }))
    state.polls = [
      poll({
        id: 'who',
        question: 'Picnic?',
        choice_mode: 'multiple',
        anonymous: false,
        votes: [
          // Two picks, one person.
          { option_id: 'o1', user_id: 'g', voter: { first_name: 'Grace', last_name: 'Mensah', teams: teams(['Media', 'core'], ['Choir', 'guest']) } },
          { option_id: 'o2', user_id: 'g', voter: { first_name: 'Grace', last_name: 'Mensah', teams: teams(['Media', 'core'], ['Choir', 'guest']) } },
          { option_id: 'o2', user_id: 'k', voter: { first_name: 'Kofi', last_name: 'Asante', teams: [] } },
        ],
      }),
    ]
    show()
    const list = within(await screen.findByRole('list', { name: 'Who answered' }))
    expect(screen.getByText('Who answered · 2')).toBeInTheDocument()
    expect(list.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Grace MensahChoir (guest), Media',
      // Not an Admin: no team visible may only mean not visible to me.
      'Kofi Asante',
    ])
  })

  it('tells an Admin who is on no team at all', async () => {
    auth.isAdmin = true
    state.polls = [
      poll({
        id: 'who',
        question: 'Picnic?',
        anonymous: false,
        votes: [{ option_id: 'o1', user_id: 'k', voter: { first_name: 'Kofi', last_name: 'Asante', teams: [] } }],
      }),
    ]
    show()
    const list = within(await screen.findByRole('list', { name: 'Who answered' }))
    expect(list.getByText('Church member')).toBeInTheDocument()
  })

  it('lets whoever asked edit a poll, and nobody else who cannot manage it', async () => {
    state.polls = [
      poll({ id: 'mine', question: 'Mine?', created_by: 'me' }),
      poll({ id: 'theirs', question: 'Theirs?', created_by: 'someone' }),
    ]
    show()
    expect(await screen.findByRole('button', { name: 'Edit poll: Mine?' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit poll: Theirs?' })).not.toBeInTheDocument()
  })

  it('edits a poll nobody has answered: question, options, answer type and names', async () => {
    state.polls = [poll({ id: 'mine', question: 'Picnic?', created_by: 'me', votes: [] })]
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Edit poll: Picnic?' }))
    const form = within(screen.getByRole('form', { name: 'Edit poll' }))
    await user.clear(form.getByLabelText('Question'))
    await user.type(form.getByLabelText('Question'), 'Picnic on Sunday?')
    await user.clear(form.getByLabelText('Option 2'))
    await user.type(form.getByLabelText('Option 2'), '18 October')
    await user.click(form.getByRole('button', { name: '+ Add option' }))
    await user.type(form.getByLabelText('Option 3'), '25 October')
    await user.click(form.getByRole('button', { name: 'Named' }))
    await user.click(form.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(state.inserts).toHaveLength(1))
    expect(state.updates[0]).toMatchObject({
      table: 'team_polls',
      row: { question: 'Picnic on Sunday?', anonymous: false, choice_mode: 'single' },
    })
    expect(state.updates).toContainEqual({ table: 'team_poll_options', row: { label: '18 October', sort_order: 1 } })
    expect(state.inserts[0]).toEqual({
      table: 'team_poll_options',
      row: [{ poll_id: 'mine', label: '25 October', sort_order: 2 }],
    })
    expect(state.deletes).toHaveLength(0)
  })

  it('once answered, keeps the answer type and names, and the picked option, as they are', async () => {
    auth.isAdmin = true
    state.polls = [
      poll({
        id: 'theirs',
        question: 'Picnic?',
        options: [
          { id: 'o1', label: '4 October', sort_order: 0 },
          { id: 'o2', label: '11 October', sort_order: 1 },
          { id: 'o3', label: '18 October', sort_order: 2 },
        ],
        votes: [{ option_id: 'o1', user_id: 'x' }],
      }),
    ]
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Edit poll: Picnic?' }))
    const form = within(screen.getByRole('form', { name: 'Edit poll' }))
    expect(form.queryByRole('button', { name: 'Named' })).not.toBeInTheDocument()
    expect(form.getByText(/Somebody has answered/)).toBeInTheDocument()
    // The picked option cannot go; an unpicked one can.
    expect(form.queryByRole('button', { name: 'Remove option 1' })).not.toBeInTheDocument()
    await user.click(form.getByRole('button', { name: 'Remove option 3' }))
    await user.click(form.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(state.deletes).toHaveLength(1))
    expect(state.deletes[0]).toEqual({ table: 'team_poll_options', ids: ['o3'] })
    const pollUpdate = state.updates.find((u) => u.table === 'team_polls')!.row as Record<string, unknown>
    expect(pollUpdate).not.toHaveProperty('anonymous')
    expect(pollUpdate).not.toHaveProperty('choice_mode')
  })

  it('posts a poll as anonymous unless the asker says otherwise', async () => {
    auth.isAdmin = true
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'New poll' }))
    expect(screen.getByRole('button', { name: 'Anonymous' })).toHaveAttribute('aria-pressed', 'true')
    await user.type(screen.getByLabelText('Question'), 'Picnic?')
    await user.type(screen.getByLabelText('Option 1'), 'Yes')
    await user.type(screen.getByLabelText('Option 2'), 'No')
    await user.click(screen.getByRole('button', { name: 'Post poll' }))
    await waitFor(() => expect(state.inserts).toHaveLength(2))
    expect(state.inserts[0].row).toMatchObject({ anonymous: true })

    state.inserts = []
    await user.click(await screen.findByRole('button', { name: 'New poll' }))
    await user.click(screen.getByRole('button', { name: 'Named' }))
    expect(screen.getByText(/sees who picked what/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Question'), 'Drive?')
    await user.type(screen.getByLabelText('Option 1'), 'Yes')
    await user.type(screen.getByLabelText('Option 2'), 'No')
    await user.click(screen.getByRole('button', { name: 'Post poll' }))
    await waitFor(() => expect(state.inserts).toHaveLength(2))
    expect(state.inserts[0].row).toMatchObject({ anonymous: false })
  })

  it('says when each poll clears, and drops one that has', async () => {
    state.polls = [
      poll({ id: 'live', question: 'Picnic Sunday?' }),
      poll({ id: 'gone', question: 'Old question?', clears_at: new Date(Date.now() - 1000).toISOString() }),
    ]
    show()
    expect(await screen.findByText('Picnic Sunday?')).toBeInTheDocument()
    expect(screen.getByText(/Clears in 6 days/)).toBeInTheDocument()
    expect(screen.queryByText('Old question?')).toBeNull()
  })
})
