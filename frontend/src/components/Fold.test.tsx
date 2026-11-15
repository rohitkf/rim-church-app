import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Fold } from './Collapsible'

/*
 * A part of a card that is there when asked for: on the Dashboard, how
 * each team stands, folded under the card that says how the whole service
 * does.
 */
describe('a fold inside a card', () => {
  it('is shut until asked, saying only its heading and a few words', () => {
    render(
      <Fold label="Teams on duty" summary="8 teams">
        <p>Audio: 2 of 6</p>
      </Fold>,
    )
    const heading = screen.getByRole('button', { name: /Teams on duty/ })
    expect(heading).toHaveAttribute('aria-expanded', 'false')
    expect(heading).toHaveTextContent('8 teams')
    expect(screen.queryByText('Audio: 2 of 6')).toBeNull()
  })

  it('opens and shuts on its heading', async () => {
    const user = userEvent.setup()
    render(
      <Fold label="Checklist readiness by team">
        <p>Media 6%</p>
      </Fold>,
    )
    const heading = screen.getByRole('button', { name: 'Checklist readiness by team' })
    await user.click(heading)
    expect(heading).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Media 6%')).toBeInTheDocument()
    // The heading says what it controls.
    expect(document.getElementById(heading.getAttribute('aria-controls')!)).toContainElement(screen.getByText('Media 6%'))
    await user.click(heading)
    expect(heading).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Media 6%')).toBeNull()
  })

  it('starts open when told to', () => {
    render(
      <Fold label="Teams on duty" defaultOpen>
        <p>Audio: 2 of 6</p>
      </Fold>,
    )
    expect(screen.getByRole('button', { name: 'Teams on duty' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Audio: 2 of 6')).toBeInTheDocument()
  })
})
