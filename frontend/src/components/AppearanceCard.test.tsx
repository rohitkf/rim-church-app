import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppearanceCard } from './AppearanceCard'

// The push row talks to the browser and the database; its own tests cover it.
vi.mock('./PushPermission', () => ({ PushPermissionRow: () => <p>push row</p> }))

describe('Appearance & alerts', () => {
  it('chooses the theme from one segmented control, and it takes at once', async () => {
    const user = userEvent.setup()
    render(<AppearanceCard />)
    const theme = screen.getByRole('radiogroup', { name: 'Theme' })
    expect(within(theme).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Light', 'Dark', 'Auto'])
    await user.click(within(theme).getByRole('radio', { name: 'Light' }))
    expect(within(theme).getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true')
    expect(document.documentElement.dataset.theme).toBe('light')
    await user.click(within(theme).getByRole('radio', { name: 'Dark' }))
    expect(within(theme).getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'false')
  })

  it('switches how teams are drawn, with a row to judge it by', async () => {
    const user = userEvent.setup()
    render(<AppearanceCard />)
    const style = screen.getByRole('radiogroup', { name: 'How teams are drawn' })
    await user.click(within(style).getByRole('radio', { name: 'Dot' }))
    expect(within(style).getByRole('radio', { name: 'Dot' })).toHaveAttribute('aria-checked', 'true')
    await user.click(within(style).getByRole('radio', { name: 'Gradient' }))
    expect(within(style).getByRole('radio', { name: 'Gradient' })).toHaveAttribute('aria-checked', 'true')
  })

  it('offers phone notifications here too, not only under the bell', () => {
    render(<AppearanceCard />)
    expect(screen.getByRole('heading', { name: 'Phone notifications' })).toBeInTheDocument()
    expect(screen.getByText('push row')).toBeInTheDocument()
  })
})
