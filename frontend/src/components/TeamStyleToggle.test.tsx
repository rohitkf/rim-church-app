import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TeamStyleToggle } from './TeamStyleToggle'
import { TeamMark } from './TeamMark'

afterEach(() => {
  window.localStorage.clear()
})

describe('TeamStyleToggle', () => {
  it('starts on gradients and says where a click will take you', () => {
    render(<TeamStyleToggle />)
    expect(screen.getByRole('button', { name: 'Show teams as dots' })).toBeInTheDocument()
  })

  it('switches every team mark on the screen, and remembers it', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <TeamStyleToggle />
        <span data-testid="mark">
          <TeamMark color="#30d158" />
        </span>
      </div>,
    )

    expect(screen.getByTestId('mark').firstElementChild!.className).toContain('w-[6px]')

    await user.click(screen.getByRole('button', { name: 'Show teams as dots' }))

    expect(screen.getByTestId('mark').firstElementChild!.className).toContain('h-2.5 w-2.5')
    expect(window.localStorage.getItem('rim-team-style')).toBe('dot')
    expect(screen.getByRole('button', { name: 'Show teams as gradients' })).toBeInTheDocument()
  })
})
