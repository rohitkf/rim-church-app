import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChangeEffects } from './ChangeEffects'

vi.mock('../lib/peopleFacts', () => ({
  fetchEveryonesFacts: () =>
    Promise.resolve([
      { id: 'a', name: 'Asha Mathew', facts: { id: 'a', owner: false, admin: false, overwatch: false, pastor: false, headTeams: [], assistTeams: [], memberTeams: ['w'], coordinatorTeams: [] } },
      { id: 'b', name: 'Ben Joseph', facts: { id: 'b', owner: false, admin: false, overwatch: false, pastor: false, headTeams: ['w'], assistTeams: [], memberTeams: ['w'], coordinatorTeams: [] } },
      { id: 'o', name: 'Rohit K', facts: { id: 'o', owner: true, admin: true, overwatch: false, pastor: false, headTeams: [], assistTeams: [], memberTeams: [], coordinatorTeams: [] } },
    ]),
}))
vi.mock('../lib/queries', () => ({ fetchDepartments: () => Promise.resolve([{ id: 'w', name: 'Worship' }]) }))

function show(changes: Parameters<typeof ChangeEffects>[0]['changes'], after: Parameters<typeof ChangeEffects>[0]['after']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ChangeEffects
        changes={changes}
        before={{ church: {}, teams: {} }}
        after={after}
        grants={[]}
        actionOf={(cap) => (cap === 'rota.assign' ? 'Assign somebody to a role' : cap)}
      />
    </QueryClientProvider>,
  )
}

describe('what saving would do', () => {
  it('names, before Save, who a change lets do more', async () => {
    show([{ role: 'member', capability: 'rota.assign', reach: 'team' }], { church: { 'rota.assign': { member: 'team' } }, teams: {} })
    const list = await screen.findByRole('list', { name: 'What saving would do' })
    const row = within(list).getByRole('listitem')
    expect(row).toHaveTextContent('Assign somebody to a role')
    expect(row).toHaveTextContent('Lets one more person do it, or do it further: Asha Mathew.')
    expect(row).not.toHaveTextContent('Ben Joseph')
    expect(row).not.toHaveTextContent('Rohit K')
  })

  it('says so when nobody’s answer changes', async () => {
    // Heads already assign their own team's rota.
    show([{ role: 'head', capability: 'rota.assign', reach: 'team' }], { church: { 'rota.assign': { head: 'team' } }, teams: {} })
    expect(await screen.findByText('— nobody’s answer changes.')).toBeInTheDocument()
  })

  it('says nothing while nothing is pending', () => {
    show([], { church: {}, teams: {} })
    expect(screen.queryByText(/saving would do/)).toBeNull()
  })
})
