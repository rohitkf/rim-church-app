import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ServingLayout, ServingStart } from './ServingTabs'
import { NAV_ITEMS } from '../lib/navItems'
import { isServingPath } from '../lib/serving'

/*
 * Availability, the rota and the checklists were three pages in the menu,
 * though each is the next step of the one before: the rota is built from
 * the answers, and only somebody on it has a checklist. One destination
 * now, with a tab for each step.
 */

let access = { settled: true, open: new Set<string>() }
vi.mock('../lib/usePageAccess', () => ({
  usePageAccess: () => ({
    standing: 'member',
    settled: access.settled,
    canOpen: (path: string) => access.open.has(path),
  }),
}))

const everyStep = () => new Set(['/availability', '/rota', '/checklists'])

beforeEach(() => {
  access = { settled: true, open: everyStep() }
  window.sessionStorage.clear()
})

function visit(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<p>dashboard</p>} />
        <Route path="/serving" element={<ServingStart />} />
        <Route element={<ServingLayout />}>
          <Route path="/availability" element={<p>the answers</p>} />
          <Route path="/rota" element={<p>the rota</p>} />
          <Route path="/checklists" element={<p>the checklists</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('the Serving tabs', () => {
  it('offers the three steps in order, numbered, with the open one marked', () => {
    visit('/rota')
    const tabs = screen.getAllByRole('link')
    expect(tabs.map((t) => t.textContent)).toEqual(['1Availability', '2Team Rota', '3Checklists'])
    expect(screen.getByRole('link', { name: /Team Rota/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('the rota')).toBeInTheDocument()
  })

  it('switches between them without leaving the page', async () => {
    visit('/availability')
    await userEvent.click(screen.getByRole('link', { name: /Checklists/ }))
    expect(screen.getByText('the checklists')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Serving' })).toBeInTheDocument()
  })

  it('draws no strip for somebody with only one step open to them', () => {
    access = { settled: true, open: new Set(['/rota']) }
    visit('/rota')
    expect(screen.queryByRole('navigation', { name: 'Serving' })).toBeNull()
    expect(screen.getByText('the rota')).toBeInTheDocument()
  })
})

describe('Serving in the menu', () => {
  it('starts somebody on a team with their answers', () => {
    visit('/serving')
    expect(screen.getByText('the answers')).toBeInTheDocument()
  })

  it('starts a Church Member the rota is open to on the rota', () => {
    access = { settled: true, open: new Set(['/rota']) }
    visit('/serving')
    expect(screen.getByText('the rota')).toBeInTheDocument()
  })

  it('brings you back to the step you were last on', () => {
    window.sessionStorage.setItem('rim-serving-tab', '/checklists')
    visit('/serving')
    expect(screen.getByText('the checklists')).toBeInTheDocument()
  })

  it('sends somebody with none of the steps home', () => {
    access = { settled: true, open: new Set() }
    visit('/serving')
    expect(screen.getByText('dashboard')).toBeInTheDocument()
  })

  it('is one entry standing for all three pages', () => {
    const entries = NAV_ITEMS.filter((i) => ['/availability', '/rota', '/checklists'].includes(i.to))
    expect(entries).toEqual([])
    const serving = NAV_ITEMS.find((i) => i.to === '/serving')
    expect(serving?.tabs).toEqual(['/availability', '/rota', '/checklists'])
    expect(isServingPath('/checklists')).toBe(true)
    expect(isServingPath('/set-lists')).toBe(false)
  })
})
