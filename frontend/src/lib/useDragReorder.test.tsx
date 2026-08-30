import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useDragReorder } from './useDragReorder'

function List({
  ids,
  onCommit,
  enabled = true,
}: {
  ids: string[]
  onCommit: (next: string[]) => void
  enabled?: boolean
}) {
  const { ordered, handleProps, rowProps } = useDragReorder(ids, onCommit, { enabled })
  return (
    <ul>
      {ordered.map((id) => (
        <li key={id} {...rowProps(id)}>
          <button aria-label={`Reorder ${id}`} {...handleProps(id)} />
          {id}
        </li>
      ))}
    </ul>
  )
}

describe('useDragReorder', () => {
  it('moves a row down a place on Arrow Down', async () => {
    const onCommit = vi.fn()
    render(<List ids={['a', 'b', 'c']} onCommit={onCommit} />)
    screen.getByLabelText('Reorder a').focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(onCommit).toHaveBeenCalledWith(['b', 'a', 'c'])
  })

  it('moves a row up a place on Arrow Up', async () => {
    const onCommit = vi.fn()
    render(<List ids={['a', 'b', 'c']} onCommit={onCommit} />)
    screen.getByLabelText('Reorder c').focus()
    await userEvent.keyboard('{ArrowUp}')
    expect(onCommit).toHaveBeenCalledWith(['a', 'c', 'b'])
  })

  it('writes nothing when the row is already at the end it is pushed against', async () => {
    const onCommit = vi.fn()
    render(<List ids={['a', 'b']} onCommit={onCommit} />)
    screen.getByLabelText('Reorder a').focus()
    await userEvent.keyboard('{ArrowUp}')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('does nothing at all for somebody who may not reorder the list', async () => {
    const onCommit = vi.fn()
    render(<List ids={['a', 'b']} onCommit={onCommit} enabled={false} />)
    screen.getByLabelText('Reorder a').focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('leaves keys it does not own alone, so typing still works', async () => {
    const onCommit = vi.fn()
    render(<List ids={['a', 'b']} onCommit={onCommit} />)
    screen.getByLabelText('Reorder a').focus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(onCommit).not.toHaveBeenCalled()
  })
})
