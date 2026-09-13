import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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

describe('choosing who is on a session', () => {
  it('says Unassigned until somebody is picked', () => {
    render(<LeadPicker label="Who leads Message" options={options} values={[]} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /who leads/i })).toHaveTextContent('Unassigned')
  })

  it('finds a person by any part of their name, not just the start', async () => {
    render(<LeadPicker label="Who leads Message" options={options} values={[]} onChange={vi.fn()} />)
    await open()

    await userEvent.type(screen.getByLabelText('Search people'), 'alabi')

    expect(screen.getByText('Tunde Alabi')).toBeInTheDocument()
    expect(screen.queryByText('Grace Mensah')).not.toBeInTheDocument()
  })

  it('keeps guests in their own group, so a visitor is never mistaken for the rota', async () => {
    render(<LeadPicker label="Who leads Message" options={options} values={[]} onChange={vi.fn()} />)
    await open()

    expect(screen.getByText('Team')).toBeInTheDocument()
    expect(screen.getByText('Guests')).toBeInTheDocument()
    expect(screen.getByText('Guest speaker')).toBeInTheDocument()
  })

  it('reports a guest as a guest, and a member as a member', async () => {
    const onChange = vi.fn()
    render(<LeadPicker label="Who leads Message" options={options} values={[]} onChange={onChange} />)
    await open()

    await userEvent.click(screen.getByText('Pastor Sam Varghese'))
    expect(onChange).toHaveBeenCalledWith([{ kind: 'guest', id: 'g1' }])

    await userEvent.click(screen.getByText('Grace Mensah'))
    expect(onChange).toHaveBeenLastCalledWith([{ kind: 'member', id: 'u1' }])
  })

  /*
   * The whole point of the list: a running order is mostly shared work,
   * and naming a worship team used to mean picking one of them and
   * typing the rest into the session's title.
   */
  it('adds a second person rather than replacing the first', async () => {
    const onChange = vi.fn()
    render(
      <LeadPicker
        label="Who leads Message"
        options={options}
        values={[{ kind: 'member', id: 'u1' }]}
        onChange={onChange}
      />,
    )
    await open()
    await userEvent.click(screen.getByText('Tunde Alabi'))

    expect(onChange).toHaveBeenCalledWith([
      { kind: 'member', id: 'u1' },
      { kind: 'member', id: 'u2' },
    ])
  })

  it('stays open so naming four people is four taps rather than four trips', async () => {
    render(
      <LeadPicker label="Who leads Message" options={options} values={[]} onChange={vi.fn()} />,
    )
    await open()
    await userEvent.click(screen.getByText('Tunde Alabi'))

    expect(screen.getByLabelText('Search people')).toBeInTheDocument()
  })

  it('takes somebody off by pressing them again in the list', async () => {
    const onChange = vi.fn()
    render(
      <LeadPicker
        label="Who leads Message"
        options={options}
        values={[
          { kind: 'member', id: 'u1' },
          { kind: 'member', id: 'u2' },
        ]}
        onChange={onChange}
      />,
    )
    await open()
    // Their name is on the session as well as in the list, so this says
    // which of the two is being pressed.
    await userEvent.click(within(screen.getByRole('listbox')).getByText('Grace Mensah'))

    expect(onChange).toHaveBeenCalledWith([{ kind: 'member', id: 'u2' }])
  })

  // Everyone on the session is shown where the session is, so removing
  // somebody does not mean opening a list to find them in it.
  it('shows each person chosen, with their own way off', async () => {
    const onChange = vi.fn()
    render(
      <LeadPicker
        label="Who leads Message"
        options={options}
        values={[
          { kind: 'member', id: 'u1' },
          { kind: 'guest', id: 'g1' },
        ]}
        onChange={onChange}
      />,
    )
    expect(screen.getByText('Grace Mensah')).toBeInTheDocument()
    expect(screen.getByText('Pastor Sam Varghese')).toBeInTheDocument()
    expect(screen.getByText('Guest')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Remove Grace Mensah' }))
    expect(onChange).toHaveBeenCalledWith([{ kind: 'guest', id: 'g1' }])
  })

  it('can put a session back to nobody at all', async () => {
    const onChange = vi.fn()
    render(
      <LeadPicker
        label="Who leads Message"
        options={options}
        values={[
          { kind: 'member', id: 'u1' },
          { kind: 'member', id: 'u2' },
        ]}
        onChange={onChange}
      />,
    )

    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Unassigned' }))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('says where to go when nobody matches and this person cannot add one', async () => {
    render(<LeadPicker label="Who leads Message" options={options} values={[]} onChange={vi.fn()} />)
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
        values={[{ kind: 'member', id: 'u1' }]}
        onChange={onChange}
        onAddGuest={onAddGuest}
      />,
    )
    await open()
    await userEvent.type(screen.getByLabelText('Search people'), 'Xavier')

    await userEvent.click(screen.getByRole('button', { name: /Add “Xavier” as a guest/ }))

    expect(onAddGuest).toHaveBeenCalledWith('Xavier')
    // Added and put on the session in one press, alongside whoever was
    // already on it.
    expect(onChange).toHaveBeenCalledWith([
      { kind: 'member', id: 'u1' },
      { kind: 'guest', id: 'new-guest' },
    ])
  })

  it('does not offer to add an empty name', async () => {
    render(
      <LeadPicker
        label="Who leads Message"
        options={[]}
        values={[]}
        onChange={vi.fn()}
        onAddGuest={vi.fn()}
      />,
    )
    await open()
    expect(screen.queryByRole('button', { name: /as a guest/ })).toBeNull()
  })
})
