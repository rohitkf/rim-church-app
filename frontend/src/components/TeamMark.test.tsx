import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TeamAvatar, TeamChip, TeamMark } from './TeamMark'
import { useTeamStyle } from '../lib/useTeamStyle'

function Harness() {
  const { teamStyle, choose } = useTeamStyle()
  return (
    <div>
      <button onClick={() => choose(teamStyle === 'dot' ? 'gradient' : 'dot')}>Switch</button>
      <span data-testid="mark">
        <TeamMark color="#30d158" />
      </span>
      <TeamAvatar color="#30d158" name="Stage Decor" className="h-11 w-11" />
      <TeamChip color="#30d158">Media</TeamChip>
    </div>
  )
}

afterEach(() => {
  window.localStorage.clear()
})

describe('the team mark', () => {
  it('is a gradient spine by default', () => {
    render(<Harness />)
    const mark = screen.getByTestId('mark').firstElementChild!
    expect(mark.className).toContain('w-[6px]')
    expect(mark.getAttribute('style')).toContain('linear-gradient(180deg')
  })

  it('becomes a dot, and every mark switches together', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    // The avatar and the chip read the same preference, so a screen can
    // never be half dots and half gradients.
    expect(screen.getByText('ST').getAttribute('style')).toContain('linear-gradient')
    expect(screen.getByText('Media').getAttribute('style')).toContain('linear-gradient')

    await user.click(screen.getByRole('button', { name: 'Switch' }))

    const mark = screen.getByTestId('mark').firstElementChild!
    expect(mark.className).toContain('h-2.5 w-2.5')
    expect(mark.getAttribute('style')).toContain('background-color')
    expect(screen.getByText('ST').getAttribute('style')).not.toContain('linear-gradient')
    expect(screen.getByText('Media').getAttribute('style')).not.toContain('linear-gradient')
  })

  it('shows the team’s two initials on the avatar', () => {
    render(<Harness />)
    expect(screen.getByText('ST')).toBeInTheDocument()
  })
})
