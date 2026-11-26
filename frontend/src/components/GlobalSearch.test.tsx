import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GlobalSearch } from './GlobalSearch'

const navigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

// Who may open which page is lib/pageAccess's, tested there. Here: everything, bar what a test closes.
const closed = vi.hoisted(() => ({ pages: new Set<string>() }))
vi.mock('../lib/usePageAccess', () => ({
  usePageAccess: () => ({ standing: 'admin', canOpen: (path: string) => !closed.pages.has(path), settled: true }),
}))
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } }, isAdmin: true, isSuperAdmin: true }),
}))
vi.mock('../lib/usePermissions', () => ({ usePermissions: () => ({ can: () => true }) }))

/** What each table answers; a table not named answers nothing. */
const tables = vi.hoisted(() => ({ rows: {} as Record<string, unknown[]> }))
const table = (name: string) => {
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'ilike', 'or', 'order', 'limit', 'is']) {
    builder[method] = () => builder
  }
  builder.then = (resolve: (v: unknown) => void) => resolve({ data: tables.rows[name] ?? [], error: null })
  return builder
}

vi.mock('../lib/supabaseClient', () => ({
  supabase: { from: (name: string) => table(name), rpc: () => Promise.resolve({ data: [], error: null }) },
}))

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <GlobalSearch />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const palette = () => screen.queryByRole('dialog', { name: 'Search' })

beforeEach(() => {
  navigate.mockReset()
  localStorage.clear()
  closed.pages = new Set()
  tables.rows = {
    departments: [{ id: 'media', name: 'Media Team' }],
    profiles: [
      { id: 'u1', first_name: 'Grace', last_name: 'Mensah' },
      { id: 'u2', first_name: 'Sam', last_name: 'Varghese' },
    ],
    department_members: [{ user_id: 'u1', department_id: 'media' }],
    messages: [{ id: 'm1', body: 'Media team, the projector bulb needs replacing', created_at: new Date().toISOString() }],
  }
  vi.stubGlobal('navigator', { platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0)' })
})

describe('the search palette', () => {
  /*
   * It used to be a text field in the corner of the header, and ⌘K put
   * the cursor in it — so the thing you summoned was a quarter-width
   * strip with a dropdown, on a page that carried on scrolling behind.
   */
  it('opens over the page when the shortcut is pressed', async () => {
    const user = show()
    expect(palette()).toBeNull()

    await user.keyboard('{Control>}k{/Control}')
    expect(palette()).toBeInTheDocument()
    // Modal: the page behind it is not a thing you can reach past.
    expect(palette()).toHaveAttribute('aria-modal', 'true')
  })

  it('closes again on the same keys', async () => {
    const user = show()
    await user.keyboard('{Control>}k{/Control}')
    expect(palette()).toBeInTheDocument()
    await user.keyboard('{Control>}k{/Control}')
    expect(palette()).toBeNull()
  })

  it('opens from the box in the header too, for anybody who never learned the shortcut', async () => {
    const user = show()
    await user.click(screen.getByRole('button', { name: /Search/ }))
    expect(palette()).toBeInTheDocument()
  })

  it('names the key this keyboard actually has', async () => {
    // On Windows. ⌘K was advertised to everybody, which on a machine
    // without that key reads as "not for you".
    show()
    expect(screen.getByText('Ctrl K')).toBeInTheDocument()

    vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: 'Macintosh' })
    const user = show()
    expect(screen.getByText('⌘K')).toBeInTheDocument()
    void user
  })

  it('finds things, and goes there when you pick one', async () => {
    const user = show()
    await user.keyboard('{Control>}k{/Control}')
    await user.type(screen.getByRole('combobox', { name: 'Search' }), 'media')

    const hit = await screen.findByRole('option', { name: /^Media Team/ })
    await user.click(hit)

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/departments/media'))
    // And it gets out of the way once it has done its job.
    expect(palette()).toBeNull()
  })

  it('says what it is for before anybody has typed', async () => {
    const user = show()
    await user.keyboard('{Control>}k{/Control}')
    expect(screen.getByText(/anything you can open/i)).toBeInTheDocument()
  })
})

/*
 * What it finds, and how it is listed. The matching itself is
 * lib/searchMatch's and the sources lib/globalSearch's, each with its own
 * tests; this is what somebody at the box sees.
 */
describe('what the search finds', () => {
  const open = async (typed: string) => {
    const user = show()
    await user.keyboard('{Control>}k{/Control}')
    if (typed) await user.type(screen.getByRole('combobox', { name: 'Search' }), typed)
    return user
  }
  const options = () => screen.getAllByRole('option').map((o) => o.textContent ?? '')

  it('finds a page from its first letter, with no request to wait for', async () => {
    await open('c')
    expect(options().some((o) => o.startsWith('Calendar'))).toBe(true)
    expect(screen.getByRole('group', { name: 'Pages' })).toBeInTheDocument()
  })

  it('finds a person by both names, says their team, and opens Volunteers on them', async () => {
    const user = await open('mensah grace')
    const grace = await screen.findByRole('option', { name: /Grace Mensah/ })
    expect(grace).toHaveTextContent('Media Team')
    await user.click(grace)
    expect(navigate).toHaveBeenCalledWith('/volunteers?q=Grace%20Mensah')
  })

  it('forgives a slip of the thumb', async () => {
    await open('vargese')
    expect(await screen.findByRole('option', { name: /Sam Varghese/ })).toBeInTheDocument()
  })

  it('lists what was found under what kind of thing it is, the best kind first', async () => {
    await open('media')
    await screen.findByRole('option', { name: /^Media Team/ })
    await screen.findByRole('group', { name: 'Messages' })
    const headings = screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))
    // The team called Media, before the person on it, before a message that says the word.
    expect(headings.indexOf('Teams')).toBe(0)
    expect(headings.indexOf('People')).toBeGreaterThan(0)
    expect(headings.indexOf('Messages')).toBeGreaterThan(headings.indexOf('People'))
  })

  it('draws the letters that were typed heavier in the name', async () => {
    await open('gra')
    const grace = await screen.findByRole('option', { name: /Grace Mensah/ })
    expect(grace.querySelector('mark')).toHaveTextContent('Gra')
  })

  it('moves with the arrow keys and opens with Enter, telling a screen reader which row it is on', async () => {
    const user = await open('team')
    const box = screen.getByRole('combobox', { name: 'Search' })
    await screen.findByRole('option', { name: /^Media Team/ })
    const first = screen.getAllByRole('option')[0]
    expect(first).toHaveAttribute('aria-selected', 'true')
    expect(box).toHaveAttribute('aria-activedescendant', first.id)
    await user.keyboard('{ArrowDown}')
    const second = screen.getAllByRole('option')[1]
    expect(second).toHaveAttribute('aria-selected', 'true')
    expect(box).toHaveAttribute('aria-activedescendant', second.id)
    await user.keyboard('{ArrowUp}{Enter}')
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(palette()).toBeNull()
  })

  it('offers nothing behind a page this person cannot open', async () => {
    closed.pages = new Set(['/volunteers', '/departments', '/messages'])
    await open('media')
    // Places are known already; give the names and the written things time to arrive.
    await new Promise((r) => setTimeout(r, 400))
    expect(screen.queryByRole('option', { name: /Media Team/ })).toBeNull()
    expect(screen.queryByRole('option', { name: /Grace Mensah/ })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Messages' })).toBeNull()
    expect(screen.queryByRole('option', { name: /^Volunteers/ })).toBeNull()
  })

  it('says so when nothing matches, and how to do better', async () => {
    await open('zzzzqqq')
    expect(await screen.findByText(/Nothing matches “zzzzqqq”\. Try fewer letters/)).toBeInTheDocument()
  })

  it('remembers what was chosen, offers it first next time, and forgets on asking', async () => {
    const user = await open('rota')
    await user.click(screen.getAllByRole('option')[0])
    expect(navigate).toHaveBeenCalledWith('/rota')

    await user.keyboard('{Control>}k{/Control}')
    const lately = screen.getByRole('group', { name: 'Chosen lately' })
    expect(lately).toHaveTextContent('Team Rota')
    // Enter on an empty box goes to the first of them.
    await user.keyboard('{Enter}')
    expect(navigate).toHaveBeenCalledTimes(2)

    await user.keyboard('{Control>}k{/Control}')
    await user.click(screen.getByRole('button', { name: 'Forget these' }))
    expect(screen.queryByRole('group', { name: 'Chosen lately' })).toBeNull()
    expect(screen.getByText(/anything you can open/i)).toBeInTheDocument()
  })

  it('empties the box with one press', async () => {
    const user = await open('rota')
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByRole('combobox', { name: 'Search' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Search' })).toHaveFocus()
  })
})
