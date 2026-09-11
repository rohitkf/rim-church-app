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

/** Every source answers; only departments has anything to say. */
const table = (rows: unknown[]) => {
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'ilike', 'or', 'order', 'limit', 'is']) {
    builder[method] = () => builder
  }
  builder.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null })
  return builder
}

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (name: string) =>
      table(name === 'departments' ? [{ id: 'media', name: 'Media Team' }] : []),
  },
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
    await user.type(screen.getByRole('textbox', { name: 'Search' }), 'media')

    const hit = await screen.findByText('Media Team')
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
