import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ActionButton, IconBadge, SectionTile } from './Surface'
import { ShieldIcon } from './icons'

describe('the settings primitives', () => {
  it('keeps a text glyph apart from the words beside it', () => {
    // "+" and "Add a tag" as two bare text nodes merged into one flex item,
    // so the gap never landed and the button read "+Add a tag".
    render(<ActionButton glyph="+">Add a tag</ActionButton>)
    const button = screen.getByRole('button', { name: 'Add a tag' })
    const glyph = button.querySelector('span[aria-hidden="true"]')
    expect(glyph?.textContent).toBe('+')
  })

  it('titles a block of a settings room with a real heading and one line', () => {
    render(
      <SectionTile title="Tags" hint="Chips a Head can add to a role.">
        <p>controls</p>
      </SectionTile>,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Tags' })).toBeInTheDocument()
    expect(screen.getByText('Chips a Head can add to a role.')).toBeInTheDocument()
    expect(screen.getByText('controls')).toBeInTheDocument()
  })

  it('draws an icon badge as decoration, out of the accessibility tree', () => {
    const { container } = render(<IconBadge icon={ShieldIcon} tone="red" />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('svg')).not.toBeNull()
  })
})
