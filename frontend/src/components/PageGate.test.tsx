import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PageGate } from './PageGate'

let access = { settled: true, open: new Set<string>() }
vi.mock('../lib/usePageAccess', () => ({
  usePageAccess: () => ({
    standing: 'church',
    settled: access.settled,
    canOpen: (path: string) => access.open.has(path),
  }),
}))

function visit(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<p>dashboard</p>} />
        <Route element={<PageGate />}>
          <Route path="/rota" element={<p>the rota</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('PageGate', () => {
  it('lets somebody through to a page the church has opened to them', () => {
    access = { settled: true, open: new Set(['/rota']) }
    visit('/rota')
    expect(screen.getByText('the rota')).toBeInTheDocument()
  })

  it('turns them back to the dashboard from a page closed to them, rather than an empty room', () => {
    access = { settled: true, open: new Set() }
    visit('/rota')
    expect(screen.getByText('dashboard')).toBeInTheDocument()
  })

  it('decides nothing until it knows who they are and what the church chose', () => {
    // A guess would send a Church Member home from a rota the church has
    // opened to them, in the second before the settings arrive.
    access = { settled: false, open: new Set() }
    visit('/rota')
    expect(screen.queryByText('dashboard')).toBeNull()
    expect(screen.queryByText('the rota')).toBeNull()
  })
})
