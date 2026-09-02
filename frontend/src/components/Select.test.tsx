import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Select, type SelectItem } from './Select'

const TEAMS: SelectItem[] = [
  { value: '', label: 'No team chosen' },
  { value: 'audio', label: 'Audio' },
  { value: 'media', label: 'Media' },
  { value: 'worship', label: 'Worship' },
]

function Harness({ options = TEAMS, initial = '' }: { options?: SelectItem[]; initial?: string }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <Select value={value} onChange={setValue} options={options} aria-label="Team" />
      <output>{value || 'nothing'}</output>
    </>
  )
}

function show(props?: Parameters<typeof Harness>[0]) {
  render(<Harness {...props} />)
  return userEvent.setup()
}

describe('Select', () => {
  it('shows what is chosen, and keeps the menu shut until asked', async () => {
    show({ initial: 'media' })
    expect(screen.getByRole('combobox')).toHaveTextContent('Media')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('chooses with the mouse and closes behind itself', async () => {
    const user = show()
    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: 'Worship' }))
    expect(screen.getByRole('combobox')).toHaveTextContent('Worship')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('does the whole thing from the keyboard, the way a select does', async () => {
    const user = show()
    screen.getByRole('combobox').focus()
    await user.keyboard('{ArrowDown}') // opens, landing on what is chosen
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(screen.getByRole('combobox')).toHaveTextContent('Media')
  })

  it('leaves the choice alone when Escape ends it', async () => {
    const user = show({ initial: 'audio' })
    await user.click(screen.getByRole('combobox'))
    await user.keyboard('{ArrowDown}{Escape}')
    expect(screen.getByRole('combobox')).toHaveTextContent('Audio')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('closes on a click elsewhere without choosing anything', async () => {
    const user = show({ initial: 'audio' })
    await user.click(screen.getByRole('combobox'))
    await user.click(document.body)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveTextContent('Audio')
  })

  it('files options under their headings, as an optgroup did', async () => {
    const user = show({
      options: [
        { value: 'c', label: 'Team Coordinator' },
        { label: 'Band', options: [{ value: 'k', label: 'Keys' }] },
      ],
    })
    await user.click(screen.getByRole('combobox'))
    const listbox = screen.getByRole('listbox')
    expect(within(listbox).getByText('Band')).toBeInTheDocument()
    await user.click(within(listbox).getByRole('option', { name: 'Keys' }))
    expect(screen.getByRole('combobox')).toHaveTextContent('Keys')
  })

  it('will not report a disabled option as a choice', async () => {
    const onChange = vi.fn()
    render(
      <Select
        value=""
        onChange={onChange}
        aria-label="Service"
        options={[{ value: '', label: 'No services coming up', disabled: true }]}
      />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: 'No services coming up' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('says nothing rather than lying when the value matches no option', () => {
    render(
      <Select
        value="gone"
        onChange={() => {}}
        aria-label="Team"
        placeholder="Select…"
        options={[{ value: 'audio', label: 'Audio' }]}
      />,
    )
    expect(screen.getByRole('combobox')).toHaveTextContent('Select…')
  })
})
