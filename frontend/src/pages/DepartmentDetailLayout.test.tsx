import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DepartmentDetailPage } from './DepartmentDetailPage'

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } }, isAdmin: true, ledDepartmentIds: [] }),
}))
vi.mock('../lib/queries', () => ({ searchProfiles: () => Promise.resolve([]) }))
vi.mock('../lib/useHandbookUrl', () => ({
  HANDBOOK_BUCKET: 'handbooks',
  useHandbookUrl: () => ({ data: null, isLoading: false, error: null }),
}))
// The card has its own tests; what is under test here is where the page
// puts it.
vi.mock('../components/DepartmentRolesCard', () => ({
  DepartmentRolesCard: () => <div data-testid="roles-card">Roles</div>,
}))

/*
 * Every read on this page goes through a chained Supabase builder. None of
 * them need to answer for a question about layout — the headings and the
 * roles card render whatever the queries say — so one stub stands in for
 * all of them and resolves empty.
 */
const MEMBER = {
  id: 'm1',
  department_id: 'd1',
  user_id: 'u1',
  member_type: 'core',
  created_at: '2026-01-01T00:00:00Z',
  profiles: {
    id: 'u1',
    first_name: 'Ada',
    last_name: 'Grace',
    email: 'ada@example.com',
    phone: null,
    avatar_url: null,
    dob: '1990-03-14',
  },
}

const GUEST = {
  ...MEMBER,
  id: 'm2',
  user_id: 'u2',
  member_type: 'guest',
  profiles: { ...MEMBER.profiles, id: 'u2', first_name: 'Joel', last_name: 'Reji', dob: '2004-01-02' },
}

const DEPARTMENT = {
  id: 'd1',
  name: 'Media',
  handbook_url: null,
  color: null,
  is_service_flow: false,
  is_worship: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

/** A chained builder that answers anything, and answers it emptily. */
function stub(answer: unknown): unknown {
  const b: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) => resolve({ data: answer, error: null })
        }
        return () => b
      },
    },
  )
  return b
}

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) =>
      stub(
        table === 'departments'
          ? DEPARTMENT
          : table === 'department_members'
            ? [MEMBER, GUEST]
            : [],
      ),
    storage: { from: () => stub(null) },
  },
}))

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/departments/d1']}>
        <Routes>
          <Route path="/departments/:id" element={<DepartmentDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('where the Teams page puts its Roles', () => {
  /*
   * Roles used to sit in the narrow column beside the roster, where a
   * checklist item — a drag handle, a label and a Remove, all on one row,
   * two stages side by side — had about ninety pixels for the label. "Get
   * the Service Planner" came out broken across five lines. It runs the
   * width of the page now, which is the only thing that gives a checklist
   * room to be a list rather than a column of syllables.
   */
  it('gives Roles the width of the page rather than the side column', async () => {
    const { container } = show()
    const card = await screen.findByTestId('roles-card')
    const grid = container.querySelector('.lg\\:grid-cols-\\[2fr_1fr\\]')

    expect(grid).not.toBeNull()
    expect(grid?.contains(card)).toBe(false)
  })

  it('puts it below the roster and the guest list, in that order', async () => {
    show()
    const card = await screen.findByTestId('roles-card')
    const guests = screen.getByRole('heading', { name: 'Guest List' })
    const members = screen.getByRole('heading', { name: 'Core Members' })

    // Node.compareDocumentPosition: FOLLOWING means the card comes after.
    expect(members.compareDocumentPosition(guests) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(guests.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('what a team can see about each other', () => {
  // An age is a moving number, so the day it is worked out from has to
  // stand still or this test expires on somebody's birthday.
  afterEach(() => vi.useRealTimers())


  /*
   * A roster that gives you a name and an email and not whether you are
   * talking to a sixteen-year-old is a roster that makes people careful
   * in the wrong ways. The date itself stays private — the age is the
   * part that changes how you speak to somebody — and it comes off
   * `profiles`, which every signed-in person could already read.
   */
  it('shows how old everybody is, core and guest alike', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-09-11T09:00:00Z'))

    show()
    // Two of each name: the roster is a table on a desk and a stack of
    // cards on a phone, and both are in the document here.
    await screen.findAllByText('Ada Grace')

    // Ada was born in March 1990 and Joel in January 2004.
    expect(screen.getAllByText('36').length).toBeGreaterThan(0)
    expect(screen.getAllByText('22').length).toBeGreaterThan(0)
    // The guest gets one too — the point of putting ages on the page is
    // that everybody on a team can see everybody.
    expect(screen.getAllByText('Joel Reji').length).toBeGreaterThan(0)
  })
})
