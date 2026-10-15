import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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

const TODAY = '2026-10-15'
const db = vi.hoisted(() => ({
  services: [] as { id: string; date: string; service_type: string }[],
  availability: [] as { service_id: string; department_id: string }[],
  rota_assignments: [] as { service_id: string }[],
  service_sessions: [] as { id: string; service_id: string; start_time: string; duration_minutes: number }[],
  teamIds: ['media'] as string[],
}))
vi.mock('../lib/monthGrid', async () => {
  const actual = await vi.importActual<typeof import('../lib/monthGrid')>('../lib/monthGrid')
  return { ...actual, todayIso: () => TODAY }
})
vi.mock('../lib/queries', () => ({ fetchServices: () => Promise.resolve(db.services) }))
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } }, ledDepartmentIds: [] }),
}))
vi.mock('../lib/useMyTeams', () => ({
  useMyTeams: () => ({ teamIds: db.teamIds, onATeam: db.teamIds.length > 0, settled: true }),
}))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (table: 'availability' | 'rota_assignments' | 'service_sessions' | 'services') => {
      const result = Promise.resolve({ data: db[table], error: null })
      const chain = { eq: () => chain, in: () => result }
      return { select: () => chain }
    },
  },
}))

beforeEach(() => {
  access = { settled: true, open: everyStep() }
  db.services = [
    { id: 'old', date: '2026-10-11', service_type: 'English Service' },
    { id: 'en', date: '2026-10-18', service_type: 'English Service' },
    { id: 'ml', date: '2026-10-18', service_type: 'Malayalam Service' },
    { id: 'later', date: '2026-10-25', service_type: 'English Service' },
  ]
  db.availability = []
  db.rota_assignments = []
  db.service_sessions = []
  db.teamIds = ['media']
})

function visit(path: string) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
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
    </MemoryRouter>
    </QueryClientProvider>,
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

describe('Serving in the menu opens on the step that is waiting', () => {
  it('Availability, while the next service day still has a question for you', async () => {
    db.availability = [{ service_id: 'en', department_id: 'media' }]
    visit('/serving')
    expect(await screen.findByText('the answers')).toBeInTheDocument()
  })

  it('Team Rota, once you have answered for every service that day', async () => {
    db.availability = [
      { service_id: 'en', department_id: 'media' },
      { service_id: 'ml', department_id: 'media' },
    ]
    visit('/serving')
    expect(await screen.findByText('the rota')).toBeInTheDocument()
  })

  it('Checklists, once the rota has put you on that day', async () => {
    db.rota_assignments = [{ service_id: 'ml' }]
    visit('/serving')
    expect(await screen.findByText('the checklists')).toBeInTheDocument()
  })

  it('judges the next service day, not last week or the one after', async () => {
    db.availability = [
      { service_id: 'en', department_id: 'media' },
      { service_id: 'ml', department_id: 'media' },
    ]
    db.rota_assignments = [{ service_id: 'old' }, { service_id: 'later' }]
    visit('/serving')
    expect(await screen.findByText('the rota')).toBeInTheDocument()
  })

  describe('a service that is already over today', () => {
    const today = (endedMinutesAgo: number) => {
      db.services = [{ id: 'tdy', date: TODAY, service_type: 'English Service' }, ...db.services]
      const start = new Date(Date.now() - (endedMinutesAgo + 90) * 60_000).toISOString()
      db.service_sessions = [{ id: 's1', service_id: 'tdy', start_time: start, duration_minutes: 90 }]
      db.rota_assignments = [{ service_id: 'tdy' }]
    }

    it('still sends its rota to the packing-up list while that is open', async () => {
      today(30)
      visit('/serving')
      expect(await screen.findByText('the checklists')).toBeInTheDocument()
    })

    it('moves on to the next service day once the list has closed', async () => {
      today(300)
      visit('/serving')
      expect(await screen.findByText('the answers')).toBeInTheDocument()
    })
  })

  it('starts a Church Member the rota is open to on the rota', async () => {
    access = { settled: true, open: new Set(['/rota']) }
    db.teamIds = []
    visit('/serving')
    expect(await screen.findByText('the rota')).toBeInTheDocument()
  })

  it('sends somebody with none of the steps home', async () => {
    access = { settled: true, open: new Set() }
    visit('/serving')
    expect(await screen.findByText('dashboard')).toBeInTheDocument()
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
