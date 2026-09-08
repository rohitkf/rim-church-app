import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { DockNav, type DockItem } from './DockNav'
import { GridIcon, CalendarIcon, ChecklistIcon } from './icons'

const items: DockItem[] = [
  { to: '/', label: 'Dashboard', icon: GridIcon },
  { to: '/service-planner', label: 'Service Planner', icon: CalendarIcon },
  { to: '/checklists', label: 'Checklists', icon: ChecklistIcon },
]

function renderDock(onAsk = () => {}) {
  render(
    <MemoryRouter initialEntries={['/']}>
      <DockNav
        items={items}
        trailing={
          <button type="button" onClick={onAsk}>
            Ask
          </button>
        }
      />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('DockNav', () => {
  /*
   * Ask was reported as a button that answered the keyboard and ignored
   * the mouse. It hung off the end of the bar inside a `display: contents`
   * wrapper — a box that is not there, which WebKit has never reliably
   * hit-tested through. Nothing in JSDOM can see that, so what is guarded
   * here is the shape that caused it: the wrapper is a real box.
   */
  it('hangs the trailing control off a real box, not a display:contents one', () => {
    renderDock()
    const wrapper = screen.getByRole('button', { name: 'Ask' }).parentElement
    expect(wrapper?.className).not.toMatch(/contents/)
    // And it sits above the travelling highlight rather than under it.
    expect(wrapper).toHaveClass('relative')
    expect(wrapper).toHaveClass('z-10')
  })

  it('presses', async () => {
    let asked = 0
    const user = renderDock(() => (asked += 1))
    await user.click(screen.getByRole('button', { name: 'Ask' }))
    expect(asked).toBe(1)
  })

  /*
   * The highlight is decoration. It is positioned, so it paints over
   * anything in the bar that is not — and a decoration that eats a press
   * is worse than no decoration.
   */
  it('lets presses through the travelling highlight', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <DockNav items={items} />
      </MemoryRouter>,
    )
    const highlight = container.querySelector('span[aria-hidden="true"][style*="left"]')
    expect(highlight).not.toBeNull()
    expect(highlight).toHaveClass('pointer-events-none')
  })
})
