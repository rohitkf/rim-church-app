import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LeadPicker, type LeadOption } from './LeadPicker'

const options: LeadOption[] = [
  { kind: 'member', id: 'u1', name: 'Grace Mensah' },
  { kind: 'member', id: 'u2', name: 'Tunde Alabi' },
  { kind: 'member', id: 'u3', name: 'Samuel Boateng' },
  { kind: 'guest', id: 'g1', name: 'Pastor Sam Varghese', note: 'Guest speaker' },
]

function open() {
  return userEvent.click(screen.getByRole('button', { name: /who leads/i }))
}

describe('choosing who leads a session', () => {
  it('says Unassigned until somebody is picked', () => {
    render(<LeadPicker label="Who leads Message" options={options} value={null} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /who leads/i })).toHaveTextContent('Unassigned')
  })

  it('finds a person by any part of their name, not just the start', async () => {
    render(<LeadPicker label="Who leads Message" options={options} value={null} onChange={vi.fn()} />)
    await open()

    await userEvent.type(screen.getByLabelText('Search people'), 'alabi')

    expect(screen.getByText('Tunde Alabi')).toBeInTheDocument()
    expect(screen.queryByText('Grace Mensah')).not.toBeInTheDocument()
  })

  it('keeps guests in their own group, so a visitor is never mistaken for the rota', async () => {
    render(<LeadPicker label="Who leads Message" options={options} value={null} onChange={vi.fn()} />)
    await open()

    expect(screen.getByText('Team')).toBeInTheDocument()
    expect(screen.getByText('Guests')).toBeInTheDocument()
    expect(screen.getByText('Guest speaker')).toBeInTheDocument()
  })

  it('reports a guest as a guest, and a member as a member', async () => {
    const onChange = vi.fn()
    render(<LeadPicker label="Who leads Message" options={options} value={null} onChange={onChange} />)
    await open()

    await userEvent.click(screen.getByText('Pastor Sam Varghese'))
    expect(onChange).toHaveBeenCalledWith({ kind: 'guest', id: 'g1' })

    await open()
    await userEvent.click(screen.getByText('Grace Mensah'))
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'member', id: 'u1' })
  })

  it('can put a session back to nobody', async () => {
    const onChange = vi.fn()
    render(
      <LeadPicker
        label="Who leads Message"
        options={options}
        value={{ kind: 'member', id: 'u1' }}
        onChange={onChange}
      />,
    )
    expect(screen.getByRole('button', { name: /who leads/i })).toHaveTextContent('Grace Mensah')

    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Unassigned' }))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('marks the chosen person as a guest on the closed control', () => {
    render(
      <LeadPicker
        label="Who leads Message"
        options={options}
        value={{ kind: 'guest', id: 'g1' }}
        onChange={vi.fn()}
      />,
    )
    const control = screen.getByRole('button', { name: /who leads/i })
    expect(control).toHaveTextContent('Pastor Sam Varghese')
    expect(control).toHaveTextContent('Guest')
  })

  it('says where to go when nobody matches', async () => {
    render(<LeadPicker label="Who leads Message" options={options} value={null} onChange={vi.fn()} />)
    await open()
    await userEvent.type(screen.getByLabelText('Search people'), 'zzzz')
    expect(screen.getByText(/Add a guest on the right/)).toBeInTheDocument()
  })
})
