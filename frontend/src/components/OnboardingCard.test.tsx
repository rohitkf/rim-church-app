import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { OnboardingCard } from './OnboardingCard'

const db = vi.hoisted(() => ({
  admin: true,
  people: [
    { id: 'a', first_name: 'Ada', last_name: 'Grace' },
    { id: 'b', first_name: 'Ben', last_name: 'Okafor' },
    { id: 'c', first_name: 'Cara', last_name: 'Lim' },
    // Somebody the reader may not send the tour to: people_setup() has no row for them.
    { id: 'z', first_name: 'Zed', last_name: 'Elsewhere' },
  ],
  tours: [
    { user_id: 'a', seen: { welcome: '2026-10-02T10:00:00Z' }, pushed_at: null, pushed_by: null },
    { user_id: 'b', seen: {}, pushed_at: '2026-10-05T10:00:00Z', pushed_by: 'me', setup_asked_at: '2026-11-09T10:00:00Z' },
  ],
  setup: [
    { user_id: 'a', joined: true, gaps: [], notifications: true },
    { user_id: 'b', joined: true, gaps: ['dob', 'visaType'], notifications: false },
    { user_id: 'c', joined: false, gaps: ['phone', 'dob', 'maritalStatus', 'visaType'], notifications: false },
  ] as { user_id: string; joined: boolean; gaps: string[]; notifications: boolean; completed_at?: string | null }[],
  locations: [
    { user_id: 'a', state: 'granted', platform: 'ios', installed: true, reported_at: '2026-11-01T10:00:00Z', asked_at: null },
    { user_id: 'b', state: 'granted', platform: 'android', installed: false, reported_at: '2026-11-01T10:00:00Z', asked_at: null },
  ],
  pushes: [] as (string[] | null)[],
  asks: [] as (string[] | null)[],
  allowed: true,
}))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: db.admin }) }))
vi.mock('../lib/usePermissions', () => ({ usePermissions: () => ({ can: () => db.allowed }) }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => {
        const data = table === 'profiles' ? db.people : table === 'location_access' ? db.locations : db.tours
        const rows = Promise.resolve({ data, error: null })
        return Object.assign(rows, { order: () => rows })
      },
    }),
    rpc: (fn: string, args?: { p_users: string[] | null }) => {
      if (fn === 'people_setup') return Promise.resolve({ data: db.setup, error: null })
      if (fn === 'push_onboarding') {
        db.pushes.push(args!.p_users)
        return Promise.resolve({ data: args!.p_users ? args!.p_users.length : db.people.length, error: null })
      }
      if (fn === 'prompt_setup') {
        db.asks.push(args!.p_users)
        return Promise.resolve({ data: args!.p_users ? args!.p_users.length : 2, error: null })
      }
      return Promise.resolve({ data: null, error: { message: 'no' } })
    },
  },
}))

function show() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <OnboardingCard />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  for (const row of db.setup) delete row.completed_at
  db.pushes = []
  db.asks = []
  db.allowed = true
  db.admin = true
})

const rowOf = (name: string) => screen.getByRole('row', { name: new RegExp(name) })
const tick = (name: string, column: string) => within(rowOf(name)).getByRole('img', { name: new RegExp(`^${column}:`) })

describe('Settings › Onboarding', () => {
  it('shows one row a person with a tick for each thing set up', async () => {
    show()
    await screen.findByText('Ada Grace')
    for (const column of [
      'Profile complete', 'Phone number', 'Date of birth', 'Marital status', 'Status in the UK',
      'Tour taken', 'Location allowed', 'Notifications on', 'App installed',
    ]) {
      expect(screen.getByRole('columnheader', { name: column })).toBeInTheDocument()
      expect(tick('Ada Grace', column)).toHaveAccessibleName(`${column}: done`)
    }
  })

  it('leaves blank exactly what is missing, without saying what anybody answered', async () => {
    show()
    await screen.findByText('Ben Okafor')
    expect(tick('Ben Okafor', 'Phone number')).toHaveAccessibleName('Phone number: done')
    expect(tick('Ben Okafor', 'Date of birth')).toHaveAccessibleName('Date of birth: not yet')
    expect(tick('Ben Okafor', 'Status in the UK')).toHaveAccessibleName('Status in the UK: not yet')
    expect(tick('Ben Okafor', 'Profile complete')).toHaveAccessibleName('Profile complete: not yet')
    expect(tick('Ben Okafor', 'Location allowed')).toHaveAccessibleName('Location allowed: done')
    expect(tick('Ben Okafor', 'App installed')).toHaveAccessibleName('App installed: not yet')
    expect(tick('Ben Okafor', 'Notifications on')).toHaveAccessibleName('Notifications on: not yet')
    // A tour sent and not opened, and an ask still waiting, are said in words.
    expect(within(rowOf('Ben Okafor')).getByText(/tour sent .* · asked/)).toBeInTheDocument()
    // Somebody who has not been through the form at all, on a phone that has never reported.
    expect(tick('Cara Lim', 'Profile complete')).toHaveAccessibleName('Profile complete: not yet')
    expect(tick('Cara Lim', 'Location allowed')).toHaveAccessibleName('Location allowed: not yet')
  })

  it('has ticks that cannot be pressed: the only boxes are the ones that pick a person', async () => {
    show()
    await screen.findByText('Ada Grace')
    expect(screen.getAllByRole('checkbox').map((box) => box.getAttribute('aria-label'))).toEqual([
      'Ada Grace', 'Ben Okafor', 'Cara Lim',
    ])
  })

  it('lists only the people the reader may send the tour to', async () => {
    show()
    await screen.findByText('Ada Grace')
    expect(screen.queryByText('Zed Elsewhere')).toBeNull()
  })

  it('narrows to whoever has something left, or to whoever is done', async () => {
    const user = userEvent.setup()
    show()
    await screen.findByText('Ada Grace')
    await user.click(screen.getByRole('button', { name: 'Something left' }))
    expect(screen.queryByText('Ada Grace')).toBeNull()
    expect(screen.getByText('Ben Okafor')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'All done' }))
    expect(screen.getByText('Ada Grace')).toBeInTheDocument()
    expect(screen.queryByText('Cara Lim')).toBeNull()
  })

  it('asks the people ticked to finish setting up', async () => {
    const user = userEvent.setup()
    show()
    await screen.findByText('Ada Grace')
    expect(screen.getByRole('button', { name: 'Ask the people ticked below' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'Ben Okafor' }))
    await user.click(screen.getByRole('button', { name: 'Ask 1 person' }))
    await waitFor(() => expect(db.asks).toEqual([['b']]))
    expect(db.pushes).toEqual([])
  })

  it('asks everybody with something left only after saying what they will get', async () => {
    const user = userEvent.setup()
    show()
    await screen.findByText('Ada Grace')
    await user.click(screen.getByRole('button', { name: 'Ask everyone with something left' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Ask everyone with something left?' })
    expect(dialog).toHaveTextContent('(2)')
    expect(dialog).toHaveTextContent('They can close it and carry on')
    expect(db.asks).toEqual([])
    await user.click(within(dialog).getByRole('button', { name: 'Ask them' }))
    await waitFor(() => expect(db.asks).toEqual([null]))
  })

  it('sends the tour to the people ticked', async () => {
    const user = userEvent.setup()
    show()
    await screen.findByText('Ada Grace')
    expect(screen.getByRole('button', { name: 'Send to the people ticked below' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'Ben Okafor' }))
    await user.click(screen.getByRole('checkbox', { name: 'Cara Lim' }))
    await user.click(screen.getByRole('button', { name: 'Send to 2 people' }))
    await waitFor(() => expect(db.pushes).toEqual([['b', 'c']]))
    expect(db.asks).toEqual([])
  })

  it('sends it to everyone only after asking', async () => {
    const user = userEvent.setup()
    show()
    await screen.findByText('Ada Grace')
    await user.click(screen.getByRole('button', { name: 'Send to everyone' }))
    expect(screen.getByRole('alertdialog', { name: 'Send the tour to everyone?' })).toBeInTheDocument()
    expect(db.pushes).toEqual([])
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Send to everyone' }))
    await waitFor(() => expect(db.pushes).toEqual([null]))
  })

  it('finds somebody by name', async () => {
    const user = userEvent.setup()
    show()
    await screen.findByText('Ada Grace')
    await user.type(screen.getByRole('textbox', { name: 'Find somebody' }), 'car')
    expect(screen.queryByText('Ada Grace')).toBeNull()
    expect(screen.getByText('Cara Lim')).toBeInTheDocument()
  })

  it('is not there for somebody who may not send the tour', () => {
    db.allowed = false
    show()
    expect(screen.queryByText('Send the tour')).toBeNull()
    expect(screen.queryByText('Getting set up')).toBeNull()
  })

  it('points an Admin to Clock In for which phone each person uses, and nobody else', async () => {
    const first = show()
    expect(await screen.findByRole('link', { name: 'Clock In’s settings' })).toHaveAttribute('href', '/settings/clock-in')
    first.unmount()
    db.admin = false
    show()
    await screen.findByText('Ada Grace')
    expect(screen.queryByRole('link', { name: 'Clock In’s settings' })).toBeNull()
  })

  /*
   * When somebody finished their details (0304): the tick says they have,
   * the line under their name says when.
   */
  describe('when somebody finished their details', () => {
    const when = (iso: string) =>
      new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

    it('is said under the name of somebody whose details are complete, to the minute', async () => {
      db.setup[0].completed_at = '2026-11-18T07:42:00Z'
      show()
      const ada = (await screen.findByText('Ada Grace')).closest('tr')!
      expect(within(ada).getByText(`details completed ${when('2026-11-18T07:42:00Z')}`)).toBeInTheDocument()
    })

    it('is not said of somebody who finished once and has a blank now: the date is not the tick', async () => {
      // Ben finished, then rubbed out his date of birth.
      db.setup[1].completed_at = '2026-11-17T20:00:00Z'
      show()
      const ben = (await screen.findByText('Ben Okafor')).closest('tr')!
      expect(within(ben).queryByText(/details completed/)).toBeNull()
      expect(within(ben).getByRole('img', { name: 'Profile complete: not yet' })).toBeInTheDocument()
    })

    it('is left unsaid where no date was kept, and the tick still stands', async () => {
      show()
      const ada = (await screen.findByText('Ada Grace')).closest('tr')!
      expect(within(ada).queryByText(/details completed/)).toBeNull()
      expect(within(ada).getByRole('img', { name: 'Profile complete: done' })).toBeInTheDocument()
    })

    it('sits with what else the ticks cannot say', async () => {
      db.setup[0].completed_at = '2026-11-18T07:42:00Z'
      show()
      await screen.findByText('Ada Grace')
      // Ben was sent the tour and asked; that line is as it was.
      expect(within(screen.getByText('Ben Okafor').closest('tr')!).getByText(/tour sent .* · asked /)).toBeInTheDocument()
    })
  })
})
