import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useConfirmAction } from './ConfirmAction'

/** A row with a Delete button, the shape every caller has. */
function Harness({ onDelete }: { onDelete: () => void }) {
  const { ask, dialog } = useConfirmAction()
  return (
    <div>
      <button
        type="button"
        onClick={() =>
          ask({
            title: 'Delete the poll?',
            body: 'Every answer goes with it.',
            onConfirm: onDelete,
          })
        }
      >
        Delete
      </button>
      {dialog}
    </div>
  )
}

describe('useConfirmAction', () => {
  it('does not act on the first press', async () => {
    const onDelete = vi.fn()
    render(<Harness onDelete={onDelete} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Delete' }))

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog', { name: 'Delete the poll?' })).toBeInTheDocument()
    expect(screen.getByText('Every answer goes with it.')).toBeInTheDocument()
  })

  it('acts once the question is answered, and closes', async () => {
    const onDelete = vi.fn()
    const user = userEvent.setup()
    render(<Harness onDelete={onDelete} />)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    // The dialog's own button, not the row's — both say Delete.
    await user.click(
      screen.getAllByRole('button', { name: 'Delete' }).find((b) => b.closest('[role="alertdialog"]'))!,
    )

    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('lets go of the request on Cancel', async () => {
    const onDelete = vi.fn()
    const user = userEvent.setup()
    render(<Harness onDelete={onDelete} />)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('lets go of it on Escape as well', async () => {
    const onDelete = vi.fn()
    const user = userEvent.setup()
    render(<Harness onDelete={onDelete} />)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.keyboard('{Escape}')

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('asks again the next time, rather than remembering the answer', async () => {
    const onDelete = vi.fn()
    const user = userEvent.setup()
    render(<Harness onDelete={onDelete} />)
    const confirm = async () => {
      await user.click(screen.getByRole('button', { name: 'Delete' }))
      await user.click(
        screen
          .getAllByRole('button', { name: 'Delete' })
          .find((b) => b.closest('[role="alertdialog"]'))!,
      )
    }
    await confirm()
    await confirm()

    expect(onDelete).toHaveBeenCalledTimes(2)
  })
})
