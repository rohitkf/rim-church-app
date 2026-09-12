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

  it('says where to go when nobody matches and this person cannot add one', async () => {
    render(<LeadPicker label="Who leads Message" options={options} value={null} onChange={vi.fn()} />)
    await open()
    await userEvent.type(screen.getByLabelText('Search people'), 'zzzz')
    expect(screen.getByText(/An Admin can add them/)).toBeInTheDocument()
  })

  /*
   * The dead end this replaces: "Nobody by that name. Add a guest on the
   * right if they don't have an account" asked somebody who was holding a
   * name, mid-assignment, to go elsewhere, do a second job and come back.
   */
  it('offers to put the typed name on the guest list, and assigns them', async () => {
    const onChange = vi.fn()
    const onAddGuest = vi.fn().mockResolvedValue({ kind: 'guest', id: 'new-guest' })
    render(
      <LeadPicker
        label="Who leads Message"
        options={options}
        value={null}
        onChange={onChange}
        onAddGuest={onAddGuest}
      />,
    )
    await open()
    await userEvent.type(screen.getByLabelText('Search people'), 'Xavier')

    await userEvent.click(screen.getByRole('button', { name: /Add “Xavier” as a guest/ }))

    expect(onAddGuest).toHaveBeenCalledWith('Xavier')
    // Added and put on the session in one press, which is the whole point.
    expect(onChange).toHaveBeenCalledWith({ kind: 'guest', id: 'new-guest' })
  })

  it('does not offer to add an empty name', async () => {
    render(
      <LeadPicker
        label="Who leads Message"
        options={[]}
        value={null}
        onChange={vi.fn()}
        onAddGuest={vi.fn()}
      />,
    )
    await open()
    expect(screen.queryByRole('button', { name: /as a guest/ })).toBeNull()
  })
})
