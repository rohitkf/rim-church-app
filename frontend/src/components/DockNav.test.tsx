import { afterEach, describe, expect, it } from 'vitest'
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

  /*
   * The label of the destination you have just landed on used to wait for
   * the pill to finish travelling (520ms) and then fade for another 300ms,
   * so most of a second after navigating the bar showed a blue pill with
   * no word in it — which is exactly when somebody glances down to check
   * where they are. It is a short CSS animation now, and nothing holds it
   * at zero.
   */
  it('names where you are without waiting for the highlight to land', () => {
    renderDock()
    const label = screen.getByRole('link', { name: 'Dashboard' }).querySelector('.dock-label')
    expect(label).not.toBeNull()
    expect(label?.textContent).toBe('Dashboard')
    // No JS-held opacity: the delay is 90ms of CSS, not a 520ms timer.
    expect((label as HTMLElement).style.opacity).toBe('')
  })
})


/*
 * Past a phone the bar used to carry every destination. An Owner's two
 * dozen did not fit a tablet or a laptop, and the ones past the edge of the
 * screen were simply not there. The bar now carries what it has room for,
 * and More holds the rest at every width.
 */
describe('DockNav on a screen too narrow for every destination', () => {
  const many: DockItem[] = Array.from({ length: 27 }, (_, i) => ({
    to: i === 0 ? '/' : `/page-${i}`,
    label: `Page ${i}`,
    icon: GridIcon,
  }))
  const at = (width: number) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
    return render(
      <MemoryRouter initialEntries={['/']}>
        <DockNav items={many} />
      </MemoryRouter>,
    )
  }
  const onBar = (container: HTMLElement) => [...container.querySelectorAll('a')].filter((a) => !a.className.includes('hidden'))

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
  })

  it('carries only what fits a tablet, and offers More for the rest', () => {
    const { container } = at(768)
    expect(onBar(container)).toHaveLength(11)
    expect(screen.getByRole('button', { name: /more|all destinations/i })).toBeInTheDocument()
  })

  it('carries three on a phone', () => {
    const { container } = at(390)
    expect(onBar(container)).toHaveLength(3)
  })

  it('carries them all on a screen wide enough, with no More', () => {
    const { container } = at(1920)
    expect(onBar(container)).toHaveLength(27)
    expect(screen.queryByRole('button', { name: /more|all destinations/i })).toBeNull()
  })

  // A phone's bar has no room for the assistant: More's sheet is where it
  // lives, so somebody whose pages all fit still needs More to reach it.
  it('keeps More on a phone for the assistant, even when every page is on the bar', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    render(
      <MemoryRouter initialEntries={['/']}>
        <DockNav items={many.slice(0, 3)} trailing={<button type="button">Ask</button>} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: /more|all destinations/i })).toBeInTheDocument()
  })
})
