import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppearanceCard } from './AppearanceCard'

describe('Appearance', () => {
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

  it('leaves phone notifications to their own room', () => {
    render(<AppearanceCard />)
    expect(screen.queryByRole('heading', { name: 'Phone notifications' })).toBeNull()
  })
})
