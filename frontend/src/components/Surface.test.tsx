import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ActionButton, IconBadge, SectionTile, SegmentedControl } from './Surface'
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
   * verify". A row that scrolls says so, and is never squeezed.
   */
  it('never squeezes a row that scrolls: each segment keeps the width of its label', () => {
    const seven = ['All', 'To pay', 'Receipts to verify', 'Paid', 'Checked in', 'Cancelled', 'Refunds'].map((label) => ({ value: label, label }))
    render(<SegmentedControl label="Show" value="All" onChange={() => {}} options={seven} scrolls />)
    const scrolling = screen.getByRole('radiogroup', { name: 'Show' })
    expect(scrolling.className).toContain('auto-cols-[minmax(max-content,1fr)]')
    expect(scrolling.className).toContain('w-max')
    expect(scrolling.className).toContain('min-w-full')
    expect(scrolling.className).not.toContain('max-[420px]')
    expect(scrolling.className).not.toContain('auto-cols-[minmax(0,1fr)]')

    // Without it the same seven share a phone, as they always did.
    render(<SegmentedControl label="Fit" value="All" onChange={() => {}} options={seven} />)
    const sharing = screen.getByRole('radiogroup', { name: 'Fit' })
    expect(sharing.className).toContain('max-[420px]:w-full')
    expect(sharing.className).toContain('auto-cols-[minmax(0,1fr)]')
  })
})
