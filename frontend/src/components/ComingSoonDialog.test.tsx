import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ComingSoonDialog } from './ComingSoonDialog'

describe('ComingSoonDialog', () => {
  it('says the one thing it is there to say', () => {
    render(<ComingSoonDialog onClose={() => {}} />)
    expect(screen.getByRole('heading', { name: /coming soon/i })).toBeInTheDocument()
  })

  it('throws confetti, and takes it away again on the way out', async () => {
    const onClose = vi.fn()
    const { container } = render(<ComingSoonDialog onClose={onClose} />)
    // Drawn, not fetched: the flecks are elements, so they leave with the
    // dialog rather than running on behind a closed door.
    expect(document.querySelectorAll('.confetti-fleck').length).toBeGreaterThan(0)
    await userEvent.setup().click(screen.getByRole('button', { name: /can/i }))
    expect(onClose).toHaveBeenCalled()
    expect(container.querySelector('.confetti-fleck')).toBeNull()
  })

  it('closes on Escape, like everything else that covers the page', async () => {
    const onClose = vi.fn()
    render(<ComingSoonDialog onClose={onClose} />)
    await userEvent.setup().keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
