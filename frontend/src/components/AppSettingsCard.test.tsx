import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppSettingsCard } from './AppSettingsCard'
import { DEFAULT_SETTINGS } from '../lib/appSettings'

// useErrorText reaches for the session to decide how blunt to be.
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ isAdmin: true, isSuperAdmin: true, session: { user: { id: 'me' } } }),
}))

const saved = vi.fn()
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({ maybeSingle: () => Promise.resolve({ data: { ...DEFAULT_SETTINGS }, error: null }) }),
      update: (patch: Record<string, unknown>) => ({
        eq: () => {
          saved(patch)
          return Promise.resolve({ error: null })
        },
      }),
    }),
  },
}))

beforeEach(() => saved.mockClear())

async function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AppSettingsCard />
    </QueryClientProvider>,
  )
  await screen.findByText('Editing stays open for')
}

/**
 * Type a number into one of the fields, the way somebody does: press the
 * big number to type rather than drag the dial, then Enter.
 */
async function typeInto(label: string, value: string) {
  // Each field is a dial with its own number above it; the slider carries
  // the label, so it says which of them is being typed into.
  const dial = screen.getByRole('slider', { name: label }).closest('.select-none')!
  await userEvent.click(within(dial as HTMLElement).getByTitle('Type a value'))
  const field = within(dial as HTMLElement).getByRole('spinbutton', { name: label })
  await userEvent.clear(field)
  await userEvent.type(field, `${value}{Enter}`)
}

describe('the App settings card', () => {
  /*
   * The fault this is here for: every control edits a draft, and the only
   * Save was at the foot of a card several screens long. Somebody moved
   * "Editing stays open for" to 720, left the page, and was told nothing —
   * the old number was still there the next time they looked, and the
   * service they were trying to correct was still locked.
   */
  it('says out loud that a change is not saved yet', async () => {
    await show()
    expect(screen.queryByText(/Not saved yet/)).toBeNull()

    await typeInto('Editing stays open for', '720')

    expect(screen.getByText(/Not saved yet/)).toBeInTheDocument()
    expect(saved).not.toHaveBeenCalled()
  })

  it('keeps Save reachable from wherever the change was made', async () => {
    await show()
    await typeInto('Editing stays open for', '720')

    // Sticky: it travels with the viewport rather than sitting at the end
    // of the card, where a phone leaves it four settings below the dial.
    const save = screen.getByRole('button', { name: /Save settings/ })
    expect(save.parentElement?.className).toMatch(/sticky/)
    // And clear of the dock that floats over the bottom of every page.
    expect(save.parentElement?.className).toMatch(/bottom-\[calc\(5rem/)
  })

  it('writes the number that was typed, once Save is pressed', async () => {
    await show()
    await typeInto('Editing stays open for', '720')

    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }))

    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1))
    expect(saved.mock.calls[0][0]).toMatchObject({ edit_grace_minutes: 720 })
  })

  it('offers nothing to save until something has changed', async () => {
    await show()
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled()
  })
})
