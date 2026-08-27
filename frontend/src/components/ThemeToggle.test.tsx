import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeToggle } from './ThemeToggle'
import { applyTheme, writeThemePreference } from '../lib/theme'

beforeEach(() => {
  writeThemePreference('dark')
  applyTheme('dark')
})

describe('ThemeToggle', () => {
  it('offers the state a click will take you to, and gets there', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)

    const toLight = screen.getByRole('button', { name: /switch to light mode/i })
    await user.click(toLight)

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(screen.getByRole('button', { name: /switch to dark mode/i })).toBeInTheDocument()
  })

  it('remembers the choice for next time', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)

    // The preference is shared app-wide, so it carries over from the
    // previous test — click whichever way this toggle is currently facing.
    const button = screen.getByRole('button', { name: /switch to (light|dark) mode/i })
    const goingTo = /light/i.test(button.getAttribute('aria-label') ?? '') ? 'light' : 'dark'
    await user.click(button)

    expect(window.localStorage.getItem('rim-theme')).toBe(goingTo)
    expect(document.documentElement.dataset.theme).toBe(goingTo)
  })
})
