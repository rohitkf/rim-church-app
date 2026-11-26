import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { chooseOption } from '../test/select'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { VolunteersPage } from './VolunteersPage'

// Dates of birth come through birth_dates() (0256); nothing here is about them.
vi.mock('../lib/birthDates', async (orig) => ({
  ...(await orig<typeof import('../lib/birthDates')>()),
  // Whole dates, as the database hands them to whoever may see ages: none unless a test says.
  fetchBirthDates: () => Promise.resolve(new Map(Object.entries(who.dates).map(([id, dob]) => [id, { dob, birthday: dob.slice(5) }]))),
}))

/*
 * A hundred people down one page is a page nobody reads. The teams are
 * shut, so it opens as a list of teams; whoever is on no team is open,
 * because they are the reason somebody came here.
 */
const who = vi.hoisted(() => ({
  owner: false,
  rpcs: [] as string[],
  selected: [] as string[],
  /** Who the database says is under 18 (0321). */
  minors: [] as string[],
  /** Whole dates of birth by id, for a reader who is sent them. */
  dates: {} as Record<string, string>,
  /** Who says they have a DBS check, and the details behind it (0324), as the database shows this reader. */
  saysDbs: [] as string[],
  dbsRows: [] as Record<string, unknown>[],
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'admin' } },
    profile: { id: 'admin', first_name: 'Ada', last_name: 'Grace' },
    isAdmin: true,
    seesAllTeams: true,
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
      if (fn === 'people_under_18') return Promise.resolve({ data: who.minors.map((id) => ({ id })), error: null })
      return Promise.resolve({
        data: ['joel', 'rose', 'newbie'].map((id) => ({
          id,
          email: `${id}@example.com`,
          phone: '07000 000000',
          // Who to ring about them (0301). Rose has given nobody yet.
          emergency_contact_name: id === 'rose' ? null : `Parent of ${id}`,
          emergency_contact_phone: id === 'rose' ? null : '+447812345678',
          // Who that person is to them (0302). Joel gave a name and a number before it was asked.
          emergency_contact_relation: id === 'newbie' ? 'mother' : null,
        })),
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
        if (table === 'profile_sensitive') {
          return Promise.resolve({
            data: ['joel', 'rose', 'newbie'].map((id) => ({ user_id: id, has_dbs: who.saysDbs.includes(id) })),
            error: null,
          })
        }
        if (table === 'dbs_details') return Promise.resolve({ data: who.dbsRows, error: null })
        return Promise.resolve({ data: [], error: null })
      },
    }),
  },
}))

vi.mock('../components/OwnershipTransfer', () => ({ OwnershipTransfer: () => null }))
vi.mock('../components/InvitationHistory', () => ({ InvitationHistory: () => null }))
vi.mock('../components/ExportVolunteersDialog', () => ({ ExportVolunteersDialog: () => null }))
vi.mock('../lib/useTeamStyle', () => ({ useTeamStyle: () => ({ teamStyle: 'dot' }) }))

function show(at = '/volunteers') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[at]}>
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
  it('links each person to what they can do, in Access & Privileges', async () => {
    show()
    const list = await waitFor(() => listUnder(/Not on a team yet/))
    expect(within(list).getByRole('link', { name: 'What Nimmy Thomas can do' })).toHaveAttribute(
      'href',
      '/settings/access?tab=person&person=newbie',
    )
  })

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
    expect(screen.queryByText(/In an emergency/)).toBeNull()
    expect(who.rpcs).not.toContain('people_contacts')
    expect(who.selected.every((c) => !/\b(email|phone|emergency_contact\w*)\b/.test(c))).toBe(true)
  })

  it('are shown to the Owner, from the Owner-only function', async () => {
    who.owner = true
    show()
    expect(await screen.findByText('newbie@example.com')).toBeInTheDocument()
    expect(who.rpcs).toContain('people_contacts')
    expect(who.selected.every((c) => !/\b(email|phone)\b/.test(c))).toBe(true)
  })

  /*
   * Who to ring about somebody (0301): the same people's to see, on the
   * person's row, as a number that dials — it is wanted in a hurry.
   */
  it('show the Owner who to ring about somebody, as a link that dials', async () => {
    who.owner = true
    show()
    const line = (await screen.findByText(/In an emergency: Parent of newbie/)).closest('span')!
    const number = within(line).getByRole('link', { name: '+44 7812 345678' })
    expect(number).toHaveAttribute('href', 'tel:+447812345678')
    // Who is being rung, before the number (0302).
    expect(line).toHaveTextContent('In an emergency: Parent of newbie (mother), +44 7812 345678')
  })

  it('say nothing about an emergency for somebody who has given nobody', async () => {
    who.owner = true
    show()
    await screen.findByText('newbie@example.com')
    // Joel and Nimmy have; Rose has not. Joel's team is shut, so one line shows.
    expect(screen.queryByText(/Parent of rose/)).toBeNull()
  })
})

/*
 * Linking a family for them (0319): a Family button on a person's card,
 * for whoever holds `people.family` — the Owner and a Pastor out of the
 * box (0327), and an Admin only once the Owner gives it.
 */
describe('the Family button on a person’s card', () => {
  beforeEach(() => {
    who.owner = true
  })
  afterEach(() => {
    who.owner = false
  })

  it('is not there for an Admin out of the box', async () => {
    who.owner = false
    const user = show()
    await user.click(await screen.findByRole('button', { name: /Media/ }))
    await screen.findByText('Joel Skaria')
    expect(screen.queryByRole('button', { name: /^Family of/ })).toBeNull()
  })

  it('is there for the Owner, and opens that person’s family', async () => {
    who.rpcs.length = 0
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Family of Nimmy Thomas' }))
    expect(await screen.findByRole('heading', { name: 'Nimmy Thomas’s family' })).toBeInTheDocument()
    expect(who.rpcs).toContain('family_of')
  })

  it('is on every card, so anybody can be the one a family is opened from', async () => {
    const user = show()
    await user.click(await screen.findByRole('button', { name: /Media/ }))
    expect(screen.getByRole('button', { name: 'Family of Joel Skaria' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Family of Nimmy Thomas' })).toBeInTheDocument()
  })
})

/*
 * Everybody's DBS (0324): a button on each card that says where the person
 * stands and opens what a check needs. For whoever holds
 * `people.compliance`, which out of the box is the Owner alone (0126).
 */
describe('the DBS button on a person’s card', () => {
  const row = (id: string, verified: boolean) => ({
    user_id: id, kind: 'enhanced', certificate_number: '001234567890', surname: 'X', issued_on: '2023-03-14',
    workforce: 'child', update_service: true, consented_at: '2026-11-20T10:00:00Z',
    verified_at: verified ? '2026-11-21T09:00:00Z' : null, verified_by: verified ? 'admin' : null,
    status_checked: verified, certificate_seen: verified, id_seen: false,
  })

  it('is not there for an Admin out of the box, who is not sent anybody’s DBS', async () => {
    who.owner = false
    const user = show()
    await user.click(await screen.findByRole('button', { name: /Media/ }))
    await screen.findByText('Joel Skaria')
    expect(screen.queryByRole('button', { name: /^DBS of/ })).toBeNull()
  })

  it('says where each person stands, for the Owner', async () => {
    who.owner = true
    who.saysDbs = ['joel', 'rose']
    who.dbsRows = [row('joel', true)]
    try {
      const user = show()
      await user.click(await screen.findByRole('button', { name: /Media/ }))
      await user.click(screen.getByRole('button', { name: /Audio/ }))
      // Verified, a yes with nothing behind it, and a no.
      expect(await screen.findByRole('button', { name: 'DBS of Joel Skaria: DBS verified' })).toHaveTextContent('DBS verified')
      expect(screen.getByRole('button', { name: 'DBS of Rose Mathew: DBS: no details' })).toHaveTextContent('DBS: no details')
      expect(screen.getByRole('button', { name: 'DBS of Nimmy Thomas: No DBS' })).toHaveTextContent('No DBS')
    } finally {
      who.owner = false
      who.saysDbs = []
      who.dbsRows = []
    }
  })

  it('says a certificate that nobody has checked is still to check, and opens it', async () => {
    who.owner = true
    who.saysDbs = ['newbie']
    who.dbsRows = [row('newbie', false)]
    who.rpcs.length = 0
    try {
      const user = show()
      await user.click(await screen.findByRole('button', { name: 'DBS of Nimmy Thomas: DBS to check' }))
      expect(await screen.findByRole('heading', { name: 'Nimmy Thomas’s DBS' })).toBeInTheDocument()
      expect(who.rpcs).toContain('dbs_of')
    } finally {
      who.owner = false
      who.saysDbs = []
      who.dbsRows = []
    }
  })
})

/*
 * Ages and "Under 18" on a person's card (0321). Who is under 18 is the
 * database's to say (people_under_18); an age is drawn from a date only
 * the database handed over.
 */
describe('ages on the volunteers page', () => {
  const yearsAgo = (n: number) => {
    const d = new Date()
    return `${d.getFullYear() - n}-01-01`
  }
  const today = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const cardOf = (name: string) => screen.getByText(name).closest('li')!

  beforeEach(() => {
    who.minors = []
    who.dates = {}
  })

  it('marks somebody the database says is under 18, beside their name', async () => {
    who.minors = ['newbie']
    show()
    await screen.findByText('Nimmy Thomas')
    expect(await within(cardOf('Nimmy Thomas')).findByText('Under 18')).toBeInTheDocument()
    expect(who.rpcs).toContain('people_under_18')
  })

  it('marks nobody else', async () => {
    who.minors = ['newbie']
    const user = show()
    await user.click(await screen.findByRole('button', { name: /Media/ }))
    await within(cardOf('Nimmy Thomas')).findByText('Under 18')
    expect(within(cardOf('Joel Skaria')).queryByText('Under 18')).toBeNull()
  })

  it('shows how old somebody is when the database sends their date', async () => {
    who.dates = { newbie: yearsAgo(30) }
    show()
    await screen.findByText('Nimmy Thomas')
    // Born on 1 January thirty years ago: 30, or 29 on the first day of a year.
    expect(await within(cardOf('Nimmy Thomas')).findByText(/^Age (29|30)$/)).toBeInTheDocument()
  })

  it('shows no age for somebody whose date was not sent', async () => {
    show()
    await screen.findByText('Nimmy Thomas')
    expect(within(cardOf('Nimmy Thomas')).queryByText(/^Age /)).toBeNull()
  })

  it('says a date that cannot be theirs needs correcting, not “Age 0”', async () => {
    who.dates = { newbie: today() }
    show()
    await screen.findByText('Nimmy Thomas')
    expect(await within(cardOf('Nimmy Thomas')).findByText('Date of birth to correct')).toBeInTheDocument()
    expect(within(cardOf('Nimmy Thomas')).queryByText(/^Age /)).toBeNull()
  })
})


/*
 * Finding somebody. Everybody is filed under their teams, shut, so one
 * person was found by opening team after team until they turned up.
 */
describe('finding somebody on the volunteers page', () => {
  const box = () => screen.getByRole('searchbox', { name: 'Find somebody' })
  const found = () => within(screen.getByTestId('volunteers-found')).getAllByRole('listitem').filter((li) => li.parentElement === screen.getByTestId('volunteers-found'))

  it('has a box for it above the teams', async () => {
    show()
    expect(await screen.findByRole('searchbox', { name: 'Find somebody' })).toBeInTheDocument()
    expect(screen.queryByTestId('volunteers-found')).toBeNull()
  })

  it('finds a person by part of a name, shows their card once and puts the teams aside', async () => {
    const user = show()
    await screen.findByRole('button', { name: /Media/ })
    await user.type(box(), 'skar')
    expect(found()).toHaveLength(1)
    expect(found()[0]).toHaveTextContent('Joel Skaria')
    expect(screen.getByRole('status')).toHaveTextContent('1 person found')
    // The folded teams are not drawn while somebody is being looked for.
    expect(screen.queryByRole('button', { name: /^Media/ })).toBeNull()
  })

  it('finds by both names in either order, and through a slip', async () => {
    const user = show()
    await screen.findByRole('button', { name: /Media/ })
    await user.type(box(), 'mathew rose')
    expect(found()[0]).toHaveTextContent('Rose Mathew')
    await user.clear(box())
    await user.type(box(), 'skaira')
    expect(found()[0]).toHaveTextContent('Joel Skaria')
  })

  it('finds everybody on a team by the team’s name, and whoever is on none', async () => {
    const user = show()
    await screen.findByRole('button', { name: /Media/ })
    await user.type(box(), 'audio')
    expect(found().map((li) => li.textContent)).toEqual([expect.stringContaining('Rose Mathew')])
    await user.clear(box())
    await user.type(box(), 'no team')
    expect(found()[0]).toHaveTextContent('Nimmy Thomas')
  })

  it('says so when nobody matches, and comes back to the teams when the box is emptied', async () => {
    const user = show()
    await screen.findByRole('button', { name: /Media/ })
    await user.type(box(), 'zzzz')
    expect(screen.getByRole('status')).toHaveTextContent('Nobody matches “zzzz”. Try fewer letters.')
    expect(screen.queryByTestId('volunteers-found')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Clear the search' }))
    expect(box()).toHaveValue('')
    expect(await screen.findByRole('button', { name: /Media/ })).toBeInTheDocument()
  })

  it('finds by email address or telephone number for whoever holds those, and for nobody else', async () => {
    who.owner = true
    const user = show()
    await screen.findByRole('button', { name: /Media/ })
    expect(box()).toHaveAttribute('placeholder', expect.stringContaining('email, phone'))
    await user.type(box(), 'rose@example.com')
    await waitFor(() => expect(found()[0]).toHaveTextContent('Rose Mathew'))
    await user.clear(box())
    await user.type(box(), '07000000000')
    await waitFor(() => expect(found()).toHaveLength(3))
    who.owner = false
  })

  it('does not find by an address the reader was never sent', async () => {
    who.owner = false
    const user = show()
    await screen.findByRole('button', { name: /Media/ })
    expect(box()).toHaveAttribute('placeholder', 'Find somebody: name or team')
    await user.type(box(), 'rose@example.com')
    expect(screen.getByRole('status')).toHaveTextContent(/Nobody matches/)
  })

  it('opens on a person named in the address, which is how the search over everything lands here', async () => {
    show('/volunteers?q=Rose%20Mathew')
    await waitFor(() => expect(found()).toHaveLength(1))
    expect(found()[0]).toHaveTextContent('Rose Mathew')
    expect(box()).toHaveValue('Rose Mathew')
  })
})
