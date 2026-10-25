import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BoardPostBadge } from './BoardPostBadge'

vi.mock('../lib/useTeamStyle', () => ({ useTeamStyle: () => ({ teamStyle: 'dot' }) }))

describe('a board post’s badge', () => {
  it('names the team a post was made for', () => {
    render(<BoardPostBadge message={{ department: { id: 'd1', name: 'Media', color: null }, posted_as: null }} />)
    expect(screen.getByText('Media')).toBeInTheDocument()
  })

  it('tells an Admin’s post from Overwatch’s', () => {
    const { rerender } = render(<BoardPostBadge message={{ department: null, posted_as: 'admin' }} />)
    expect(screen.getByText('Admin')).toBeInTheDocument()
    rerender(<BoardPostBadge message={{ department: null, posted_as: 'overwatch' }} />)
    expect(screen.getByText('Overwatch')).toBeInTheDocument()
    expect(screen.queryByText('Admin')).not.toBeInTheDocument()
  })

  it('wears no badge rather than a wrong one when it says neither', () => {
    const { container } = render(<BoardPostBadge message={{ department: null, posted_as: null }} />)
    expect(container).toBeEmptyDOMElement()
  })
})
