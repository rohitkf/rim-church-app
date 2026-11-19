import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { Link, MemoryRouter } from 'react-router-dom'
import { ActionButton, ActionLink, IconBadge, SectionTile, SegmentedControl, FitFigure } from './Surface'
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

describe('a segmented control', () => {
  const options = [
    { value: 'a', label: 'Requests' },
    { value: 'b', label: 'Mine' },
  ]
  it('marks the chosen tab in blue, where an answer in a form stays a grey plate', () => {
    render(<SegmentedControl label="Which" kind="tab" value="a" onChange={() => {}} options={options} />)
    const tab = screen.getByRole('tab', { name: 'Requests' })
    expect(tab).toHaveAttribute('aria-selected', 'true')
    expect(tab.className).toMatch(/\bbg-primary\b/)
    expect(tab.className).toMatch(/\btext-on-primary\b/)
    expect(screen.getByRole('tab', { name: 'Mine' }).className).not.toMatch(/\bbg-primary\b/)

    render(<SegmentedControl label="Who" value="a" onChange={() => {}} options={options} />)
    const answer = screen.getByRole('radio', { name: 'Requests' })
    expect(answer.className).toMatch(/\bbg-segment\b/)
    expect(answer.className).not.toMatch(/\bbg-primary\b/)
  })

  /*
   * Seven filters do not fit a phone. Five or more segments share a
   * phone's width and truncate — right for "By person", wrong for a row
   * that was put in a scrolling parent so that nothing would be cut: that
   * rule squeezed the registrations filter until it read "Receipt:o
   * verify". It was then made to scroll sideways, which cut nothing and
   * hid half the choices. A row that wraps keeps every label whole and
   * every choice in sight, and is never squeezed.
   */
  it('never squeezes or hides a row that wraps: each segment keeps the width of its label and the row goes on to a second line', () => {
    const seven = ['All', 'To pay', 'Receipts to verify', 'Paid', 'Checked in', 'Cancelled', 'Refunds'].map((label) => ({ value: label, label }))
    render(<SegmentedControl label="Show" value="All" onChange={() => {}} options={seven} wraps />)
    const wrapping = screen.getByRole('radiogroup', { name: 'Show' })
    expect(wrapping.className).toContain('flex-wrap')
    // As wide as what it holds, and never wider than its place.
    expect(wrapping.className).toContain('w-fit')
    expect(wrapping.className).toContain('max-w-full')
    expect(wrapping.className).not.toContain('max-[420px]')
    expect(wrapping.className).not.toContain('auto-cols-[minmax(0,1fr)]')
    for (const segment of within(wrapping).getAllByRole('radio')) expect(segment.className).toContain('flex-none')

    // Without it the same seven share a phone, as they always did.
    render(<SegmentedControl label="Fit" value="All" onChange={() => {}} options={seven} />)
    const sharing = screen.getByRole('radiogroup', { name: 'Fit' })
    expect(sharing.className).toContain('max-[420px]:w-full')
    expect(sharing.className).toContain('auto-cols-[minmax(0,1fr)]')
  })
})

/*
 * A figure in a tile is as long as it is, and the tile as wide as the
 * screen leaves it: £1255.00 ran out of a tile that held £180.00. Whether
 * it fits is a browser's to say (checked there, at nine widths); what is
 * held here is that the size is worked out from the tile and the figure's
 * own length, and capped at a tile's figure.
 */
describe('a figure that is never wider than its tile', () => {
  const sizeOf = (figure: string | number) => {
    const { container } = render(<FitFigure>{figure}</FitFigure>)
    return (container.firstElementChild as HTMLElement).style.fontSize
  }

  it('is at most a tile’s figure, and smaller the longer it is', () => {
    expect(sizeOf(57)).toBe('min(var(--text-numeral), 80cqi)')
    expect(sizeOf('£180.00')).toBe('min(var(--text-numeral), 22.8cqi)')
    expect(sizeOf('£1255.00')).toBe('min(var(--text-numeral), 20cqi)')
    expect(sizeOf('£100020.00')).toBe('min(var(--text-numeral), 16cqi)')
  })

  it('stays on one line: a sum broken across two is two numbers', () => {
    render(<FitFigure>£1255.00</FitFigure>)
    expect(screen.getByText('£1255.00').className).toContain('whitespace-nowrap')
  })
})

describe('a link that is drawn as a button', () => {
  it('goes somewhere else in a new tab, and says nothing of where it came from', () => {
    render(
      <ActionLink href="https://example.org/ticket/ABC" newTab>
        Ticket
      </ActionLink>,
    )
    const link = screen.getByRole('link', { name: 'Ticket' })
    expect(link).toHaveAttribute('href', 'https://example.org/ticket/ABC')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('is a link inside the app when given the router’s own, with the button’s shape', () => {
    render(
      <MemoryRouter>
        <ActionLink as={Link} to="/door?event=e1" size="sm">
          Open Reception
        </ActionLink>
        <ActionButton size="sm" tone="quiet">
          Copy link
        </ActionButton>
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: 'Open Reception' })
    expect(link).toHaveAttribute('href', '/door?event=e1')
    expect(link).not.toHaveAttribute('target')
    // The same pill as the button beside it.
    expect(link.className).toBe(screen.getByRole('button', { name: 'Copy link' }).className)
  })
})
