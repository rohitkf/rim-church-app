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

  it('says a hint beside an option in the list, and not in the field once it is chosen', async () => {
    const user = show({
      options: [
        { value: '', label: 'All registrations' },
        { value: 'paid', label: 'Paid', hint: '3' },
        { value: 'free', label: 'Free', hint: '0', disabled: true },
      ],
    })
    await user.click(screen.getByRole('combobox'))
    const paid = screen.getByRole('option', { name: /Paid/ })
    expect(paid).toHaveTextContent('3')
    // One that would give nothing is there, greyed, and cannot be picked.
    expect(screen.getByRole('option', { name: /Free/ })).toHaveAttribute('aria-disabled', 'true')
    await user.click(screen.getByRole('option', { name: /Free/ }))
    expect(screen.getByRole('status')).toHaveTextContent('nothing')
    await user.click(paid)
    // The field says what was picked; the number belonged to the list.
    expect(screen.getByRole('combobox')).toHaveTextContent(/^Paid$/)
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

  it('draws a heading as a heading, not as another line of text', async () => {
    // On the rota the headings were the same faint grey as the options
    // under them, in a list where both are short lines — so a family name
    // read as one more role you could pick. The heading now carries a rule
    // to the edge of the menu and its options are indented: two things no
    // option does.
    const user = show({
      options: [
        { value: 'c', label: 'Team Coordinator' },
        { label: 'Camera operators', options: [{ value: 'c1', label: 'Camera Operator 1' }] },
      ],
    })
    await user.click(screen.getByRole('combobox'))
    const listbox = screen.getByRole('listbox')

    const heading = within(listbox).getByText('Camera operators').parentElement!
    expect(heading.querySelector('[aria-hidden="true"]')).toBeInTheDocument()

    const grouped = within(listbox).getByRole('option', { name: 'Camera Operator 1' })
    const ungrouped = within(listbox).getByRole('option', { name: 'Team Coordinator' })
    expect(grouped.className).toContain('pl-5')
    expect(ungrouped.className).toContain('pl-3')
  })

  it('keeps a heading out of the options, so the arrows never land on one', async () => {
    const user = show({
      options: [{ label: 'Vision mix', options: [{ value: 'd', label: 'Director' }] }],
    })
    await user.click(screen.getByRole('combobox'))
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1)
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

  it('opens upwards against the field when the window ends below it, however short the list', async () => {
    const user = show()
    const trigger = screen.getByRole('combobox')
    // A field 40px from the bottom of an 800px window.
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(
      { top: 720, bottom: 760, left: 20, right: 220, width: 200, height: 40, x: 20, y: 720, toJSON: () => ({}) } as DOMRect,
    )
    vi.stubGlobal('innerHeight', 800)
    await user.click(trigger)
    const menu = screen.getByRole('listbox')
    // Standing 6px above the field's top edge, not hung from where the
    // tallest list would have started.
    expect(menu.style.bottom).toBe('86px')
    expect(menu.style.top).toBe('')
    vi.unstubAllGlobals()
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

/*
 * A long list on a phone was a long scroll: typing to find needs a
 * keyboard, and a phone has none until something asks for one.
 */
describe('a Select with a search box', () => {
  const RIGHTS: SelectItem[] = [
    {
      label: 'Services',
      options: [
        { value: 'svc.view', label: 'See services and the running order' },
        { value: 'countdown.view', label: 'See the Countdown' },
      ],
    },
    {
      label: 'People',
      options: [
        { value: 'people.view', label: 'See the directory' },
        { value: 'people.edit', label: 'Edit somebody’s details', disabled: true },
      ],
    },
  ]

  function Searchable({ options = RIGHTS }: { options?: SelectItem[] }) {
    const [value, setValue] = useState('')
    return (
      <>
        <Select search value={value} onChange={setValue} options={options} placeholder="Give them…" aria-label="Give them" />
        <output>{value || 'nothing'}</output>
      </>
    )
  }
  const open = async () => {
    render(<Searchable />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox'))
    return user
  }
  const offered = () => screen.getAllByRole('option').map((o) => o.textContent)

  it('opens with a box to type in, which has the keyboard, and everything listed', async () => {
    await open()
    expect(screen.getByRole('searchbox', { name: 'Search Give them' })).toHaveFocus()
    expect(offered()).toHaveLength(4)
  })

  it('finds by any part of the words, not only the start', async () => {
    const user = await open()
    await user.keyboard('count')
    expect(offered()).toEqual(['See the Countdown'])
    // And the heading it sits under is still said.
    expect(within(screen.getByRole('listbox')).getByText('Services')).toBeInTheDocument()
    expect(within(screen.getByRole('listbox')).queryByText('People')).not.toBeInTheDocument()
  })

  it('finds by several words in any order, whatever their case', async () => {
    const user = await open()
    await user.keyboard('ORDER see')
    expect(offered()).toEqual(['See services and the running order'])
  })

  it('brings a whole family by its heading', async () => {
    const user = await open()
    await user.keyboard('people')
    expect(offered()).toEqual(['See the directory', 'Edit somebody’s details'])
  })

  it('chooses the first match with Enter, and closes', async () => {
    const user = await open()
    await user.keyboard('countd{Enter}')
    expect(screen.getByRole('status')).toHaveTextContent('countdown.view')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveTextContent('See the Countdown')
  })

  it('moves among the matches with the arrows', async () => {
    const user = await open()
    await user.keyboard('see{ArrowDown}{ArrowDown}{Enter}')
    expect(screen.getByRole('status')).toHaveTextContent('people.view')
  })

  it('takes a space as typing, not as a choice', async () => {
    const user = await open()
    await user.keyboard('see the')
    expect(screen.getByRole('status')).toHaveTextContent('nothing')
    expect(offered()).toEqual(['See services and the running order', 'See the Countdown', 'See the directory'])
  })

  it('chooses with a tap on a match', async () => {
    const user = await open()
    await user.keyboard('direct')
    await user.click(screen.getByRole('option', { name: 'See the directory' }))
    expect(screen.getByRole('status')).toHaveTextContent('people.view')
  })

  it('says so when nothing matches, and chooses nothing on Enter', async () => {
    const user = await open()
    await user.keyboard('zebra{Enter}')
    expect(screen.getByText('Nothing matches “zebra”.')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('nothing')
  })

  it('will not choose a match that is switched off', async () => {
    const user = await open()
    await user.keyboard('edit{Enter}')
    expect(screen.getByRole('status')).toHaveTextContent('nothing')
  })

  it('leaves the choice alone on Escape, and starts from the whole list next time', async () => {
    const user = await open()
    await user.keyboard('count{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('nothing')
    await user.click(screen.getByRole('combobox'))
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(offered()).toHaveLength(4)
  })

  it('a Select not asked to search has no box', async () => {
    const user = show()
    await user.click(screen.getByRole('combobox'))
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })
})
