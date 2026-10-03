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
  // Each setting is a row that opens to its dial.
  const row = screen.getByRole('button', { name: new RegExp(`^${label}`) })
  if (row.getAttribute('aria-expanded') !== 'true') await userEvent.click(row)
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

  it('sits still at the end while there is nothing to save, rather than floating over the rows', async () => {
    await show()
    const save = screen.getByRole('button', { name: /Save settings/ })
    expect(save.parentElement?.className).not.toMatch(/sticky/)
  })

  it('writes the number that was typed, once Save is pressed', async () => {
    await show()
    await typeInto('Editing stays open for', '720')

    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }))

    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1))
    expect(saved.mock.calls[0][0]).toMatchObject({ edit_grace_minutes: 720 })
    // The Coordinator's colour has its own Save in the Team Rota card; this
    // one sending its stale copy would undo a colour chosen there.
    expect(saved.mock.calls[0][0]).not.toHaveProperty('coordinator_color')
  })

  it('offers nothing to save until something has changed', async () => {
    await show()
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled()
  })

  /*
   * Fourteen paragraphs and fourteen rulers, all open at once, was the
   * page that prompted the redesign. Now a setting is one row until it is
   * tapped.
   */
  it('shows each setting as one row, with its value said as a person would', async () => {
    await show()
    expect(screen.queryByRole('slider')).toBeNull()
    const row = screen.getByRole('button', { name: /^Teams can write their debrief for/ })
    expect(row).toHaveAttribute('aria-expanded', 'false')
    expect(within(row).getByText('12 h')).toBeInTheDocument()
  })

  it('opens one setting at a time, to its dial and its defaults', async () => {
    await show()
    await userEvent.click(screen.getByRole('button', { name: /^Editing stays open for/ }))
    expect(screen.getByRole('slider', { name: 'Editing stays open for' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^Days ahead/ }))
    expect(screen.getByRole('slider', { name: 'Days ahead' })).toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'Editing stays open for' })).toBeNull()
  })

  it('groups the settings by the moment in the week they govern', async () => {
    await show()
    for (const heading of ['Planning ahead', 'On the day', 'After the service', 'Issues', 'Availability', 'Tidying up']) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
    }
  })

  it('marks a moved setting until it is saved, and offers its default back', async () => {
    await show()
    await typeInto('Editing stays open for', '720')
    const row = screen.getByRole('button', { name: /^Editing stays open for/ })
    expect(within(row).getByLabelText('Changed, not saved yet')).toBeInTheDocument()
    expect(within(row).getByText('12 h')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Use default' }))
    expect(within(row).queryByLabelText('Changed, not saved yet')).toBeNull()
    expect(screen.queryByText(/Not saved yet/)).toBeNull()
  })

  it('keeps the long explanation folded until asked for', async () => {
    await show()
    const how = screen.getAllByText('How this works')
    expect(how.length).toBeGreaterThan(0)
    // Folded <details> keep their text out of sight.
    expect(screen.getByText(/A safety net over the window above/)).not.toBeVisible()
  })

  it('turns the rostered-service safety net off with a switch', async () => {
    await show()
    const toggle = screen.getByRole('switch', { name: 'Always show a service somebody is rostered on' })
    expect(toggle).toBeChecked()
    await userEvent.click(toggle)
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1))
    expect(saved.mock.calls[0][0]).toMatchObject({ always_show_my_services: false })
  })
})
