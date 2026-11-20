import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { OldServingLink } from './OldServingLink'

const access = vi.hoisted(() => ({ open: ['/availability', '/rota', '/checklists'] as string[], settled: true }))
vi.mock('../lib/usePageAccess', () => ({
  usePageAccess: () => ({ canOpen: (path: string) => access.open.includes(path), settled: access.settled }),
}))

function visit() {
  render(
    <MemoryRouter initialEntries={['/serving']}>
      <Routes>
        <Route path="/serving" element={<OldServingLink />} />
        {['/', '/availability', '/rota', '/checklists'].map((p) => (
          <Route key={p} path={p} element={<p>at {p}</p>} />
        ))}
      </Routes>
    </MemoryRouter>,
  )
}

describe('a link kept from when Serving was one page', () => {
  it('opens Availability, the first of the three', () => {
    access.open = ['/availability', '/rota', '/checklists']
    access.settled = true
    visit()
    expect(screen.getByText('at /availability')).toBeInTheDocument()
  })

  it('opens the rota for somebody only the rota is open to', () => {
    access.open = ['/rota']
    visit()
    expect(screen.getByText('at /rota')).toBeInTheDocument()
  })

  it('goes to the dashboard when none of the three is theirs', () => {
    access.open = []
    visit()
    expect(screen.getByText('at /')).toBeInTheDocument()
  })

  it('waits for the answer rather than guessing', () => {
    access.open = ['/rota']
    access.settled = false
    visit()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })
})
