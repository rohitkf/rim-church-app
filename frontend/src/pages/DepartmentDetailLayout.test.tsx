import { describe, expect, it, vi } from 'vitest'
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
    from: (table: string) => stub(table === 'departments' ? DEPARTMENT : []),
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
