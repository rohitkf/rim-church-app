import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActionMenu, type MenuAction } from './ActionMenu'

const actions = (overrides: Partial<MenuAction>[] = []): MenuAction[] => [
  { label: 'Session started', onSelect: vi.fn(), ...overrides[0] },
  { label: 'Add time', onSelect: vi.fn(), ...overrides[1] },
  { label: 'Remove this session', tone: 'danger', onSelect: vi.fn(), ...overrides[2] },
]

describe('ActionMenu', () => {
  it('keeps the card quiet until it is asked', async () => {
    render(<ActionMenu label="Worship 1" actions={actions()} />)
    expect(screen.queryByRole('menu')).toBeNull()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Actions for Worship 1' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getAllByRole('menuitem')).toHaveLength(3)
  })

  it('runs the action it was asked for, and closes', async () => {
    const list = actions()
    const user = userEvent.setup()
    render(<ActionMenu label="Worship 1" actions={list} />)
    await user.click(screen.getByRole('button', { name: 'Actions for Worship 1' }))
    await user.click(screen.getByRole('menuitem', { name: /Add time/ }))

    expect(list[1].onSelect).toHaveBeenCalledTimes(1)
    expect(list[0].onSelect).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('leaves a disabled action alone', async () => {
    const list = actions([{ disabled: true }])
    const user = userEvent.setup()
    render(<ActionMenu label="Worship 1" actions={list} />)
    await user.click(screen.getByRole('button', { name: 'Actions for Worship 1' }))
    await user.click(screen.getByRole('menuitem', { name: /Session started/ }))

    expect(list[0].onSelect).not.toHaveBeenCalled()
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('walks and chooses from the keyboard, the way a menu does', async () => {
    const list = actions()
    const user = userEvent.setup()
    render(<ActionMenu label="Worship 1" actions={list} />)
    const trigger = screen.getByRole('button', { name: 'Actions for Worship 1' })
    trigger.focus()
    await user.keyboard('{ArrowDown}') // opens, landing on the first
    await user.keyboard('{ArrowDown}{Enter}')

    expect(list[1].onSelect).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape without doing anything', async () => {
    const list = actions()
    const user = userEvent.setup()
    render(<ActionMenu label="Worship 1" actions={list} />)
    await user.click(screen.getByRole('button', { name: 'Actions for Worship 1' }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).toBeNull()
    for (const action of list) expect(action.onSelect).not.toHaveBeenCalled()
  })

  it('draws no button at all when there is nothing to offer', () => {
    render(<ActionMenu label="Worship 1" actions={[]} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('says the state an action already carries', async () => {
    render(
      <ActionMenu
        label="Worship 1"
        actions={[{ label: 'Session started', onSelect: vi.fn(), badge: <span>Next</span> }]}
      />,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Actions for Worship 1' }))
    expect(screen.getByRole('menuitem', { name: /Next/ })).toBeInTheDocument()
  })
})
