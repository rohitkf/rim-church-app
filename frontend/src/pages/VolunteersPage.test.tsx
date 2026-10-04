import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { chooseOption } from '../test/select'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { VolunteersPage } from './VolunteersPage'

/*
 * A hundred people down one page is a page nobody reads. The teams are
 * shut, so it opens as a list of teams; whoever is on no team is open,
 * because they are the reason somebody came here.
 */
const who = vi.hoisted(() => ({ owner: false, rpcs: [] as string[], selected: [] as string[] }))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'admin' } },
    profile: { id: 'admin', first_name: 'Ada', last_name: 'Grace' },
    isAdmin: true,
    isSuperAdmin: who.owner,
    ownerId: who.owner ? 'admin' : 'someone-else',
    isDepartmentHead: () => false,
    ledDepartmentIds: [],
  }),
}))

vi.mock('../lib/queries', () => ({
  fetchDepartments: () =>
    Promise.resolve([
      { id: 'media', name: 'Media', color: '#a855f7', is_service_flow: false },
      { id: 'audio', name: 'Audio', color: '#ef4444', is_service_flow: false },
    ]),
  fetchMembersForDepartments: () =>
    Promise.resolve([
      { id: 'm1', user_id: 'joel', department_id: 'media', member_type: 'core' },
      { id: 'm2', user_id: 'rose', department_id: 'audio', member_type: 'core' },
    ]),
}))

const profile = (id: string, first: string, last: string) => ({
  id,
  first_name: first,
  last_name: last,
  // Sent anyway, to prove the page drops it for anybody but the Owner.
  email: `${id}@example.com`,
  dob: null,
  anniversary: null,
})

const inserted: { table: string; row: unknown }[] = []
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (fn: string) => {
      who.rpcs.push(fn)
      return Promise.resolve({
        data: ['joel', 'rose', 'newbie'].map((id) => ({ id, email: `${id}@example.com`, phone: '07000 000000' })),
        error: null,
      })
    },
    from: (table: string) => ({
      insert: (row: unknown) => {
        inserted.push({ table, row })
        return Promise.resolve({ error: null })
      },
      select: (columns?: string) => {
        if (table === 'profiles') {
          who.selected.push(columns ?? '')
          return {
            order: () =>
              Promise.resolve({
                data: [
                  profile('joel', 'Joel', 'Skaria'),
                  profile('rose', 'Rose', 'Mathew'),
                  profile('newbie', 'Nimmy', 'Thomas'),
                ],
                error: null,
              }),
          }
        }
        return Promise.resolve({ data: [], error: null })
      },
    }),
  },
}))

vi.mock('../components/OwnershipTransfer', () => ({ OwnershipTransfer: () => null }))
vi.mock('../components/InvitationHistory', () => ({ InvitationHistory: () => null }))
vi.mock('../components/ExportVolunteersDialog', () => ({ ExportVolunteersDialog: () => null }))
vi.mock('../lib/useTeamStyle', () => ({ useTeamStyle: () => ({ teamStyle: 'dot' }) }))

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <VolunteersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

/** The list a heading controls, whether it is showing or not. */
const listUnder = (name: RegExp) => {
  const heading = screen.getByRole('button', { name })
  return document.getElementById(heading.getAttribute('aria-controls')!)!
}

describe('the volunteers page', () => {
  it('opens with every team shut, so the page is a list of teams', async () => {
    show()
    await screen.findByRole('button', { name: /Media/ })
    expect(listUnder(/Media/)).toHaveAttribute('hidden')
    expect(listUnder(/Audio/)).toHaveAttribute('hidden')
    // The names under them are drawn but not shown, which is what lets a
    // browser's find-in-page still be useless and the page still be short.
    expect(within(listUnder(/Media/)).getByText(/Joel Skaria/)).toBeInTheDocument()
  })

  it('leaves the people with no team open, since they are why you came', async () => {
    show()
    await screen.findByRole('button', { name: /Not on a team yet/ })
    expect(listUnder(/Not on a team yet/)).not.toHaveAttribute('hidden')
    expect(within(listUnder(/Not on a team yet/)).getByText(/Nimmy Thomas/)).toBeInTheDocument()
  })

  it('opens a team on a touch, and shuts it again', async () => {
    const user = show()
    const heading = await screen.findByRole('button', { name: /Media/ })

    await user.click(heading)
    expect(listUnder(/Media/)).not.toHaveAttribute('hidden')
    expect(heading).toHaveAttribute('aria-expanded', 'true')

    await user.click(heading)
    expect(listUnder(/Media/)).toHaveAttribute('hidden')
  })

  it('shuts the unattached list on a touch, for somebody who is done with it', async () => {
    const user = show()
    const heading = await screen.findByRole('button', { name: /Not on a team yet/ })
    await user.click(heading)
    expect(listUnder(/Not on a team yet/)).toHaveAttribute('hidden')
  })

  it('says how many are under each heading without opening it', async () => {
    show()
    const media = await screen.findByRole('button', { name: /Media/ })
    expect(media).toHaveTextContent('1 person')
  })

  /*
   * A Church Member — signed in, on no team — waits here to be placed. An
   * Admin puts them on a team from their card rather than hunting for
   * their email on the team's own page.
   */
  it('puts a Church Member on a team from their card', async () => {
    const user = show()
    const list = await waitFor(() => listUnder(/Not on a team yet/))
    const picker = within(list).getByRole('combobox', { name: 'Team to add Nimmy to' })
    await chooseOption(user, picker, 'Audio')
    await user.click(within(list).getByRole('button', { name: 'Add' }))
    await waitFor(() =>
      expect(inserted).toContainEqual({
        table: 'department_members',
        row: { user_id: 'newbie', department_id: 'audio', member_type: 'core' },
      }),
    )
  })

  it('files them under Church Members', async () => {
    show()
    expect(await screen.findByRole('heading', { name: /Church Members · Not on a team yet/ })).toBeInTheDocument()
  })
})

describe('contact details on the volunteers page', () => {
  beforeEach(() => {
    who.owner = false
    who.rpcs = []
    who.selected = []
  })

  it('are not sent to an Admin who is not the Owner', async () => {
    show()
    expect(await screen.findByText('Nimmy Thomas')).toBeInTheDocument()
    expect(screen.queryByText('newbie@example.com')).toBeNull()
    expect(who.rpcs).not.toContain('people_contacts')
    expect(who.selected.every((c) => !/\b(email|phone)\b/.test(c))).toBe(true)
  })

  it('are shown to the Owner, from the Owner-only function', async () => {
    who.owner = true
    show()
    expect(await screen.findByText('newbie@example.com')).toBeInTheDocument()
    expect(who.rpcs).toContain('people_contacts')
    expect(who.selected.every((c) => !/\b(email|phone)\b/.test(c))).toBe(true)
  })
})
