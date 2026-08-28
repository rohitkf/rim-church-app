import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TeamColorSheet } from './TeamColorSheet'

function open(overrides: Partial<Parameters<typeof TeamColorSheet>[0]> = {}) {
  const onSave = vi.fn()
  const onClose = vi.fn()
  render(
    <TeamColorSheet
      teamName="Stage Decor"
      current="#30D158"
      saving={false}
      error={null}
      onSave={onSave}
      onClose={onClose}
      {...overrides}
    />,
  )
  return { onSave, onClose }
}

describe('TeamColorSheet', () => {
  it('marks the team’s current colour as the chosen one', () => {
    open()
    expect(screen.getByRole('radio', { name: 'Green' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Blue' })).not.toBeChecked()
  })

  it('previews a colour before committing to it', async () => {
    const user = userEvent.setup()
    const { onSave } = open()

    await user.click(screen.getByRole('radio', { name: 'Orange' }))

    expect(screen.getByText('#FF9F0A')).toBeInTheDocument()
    expect(screen.getByText(/^Orange ·/)).toBeInTheDocument()
    // Choosing is not saving: nothing is written until Set colour.
    expect(onSave).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Set colour' }))
    expect(onSave).toHaveBeenCalledWith('#FF9F0A')
  })

  it('keeps a colour chosen before the palette existed', () => {
    open({ current: '#10b981' })
    expect(screen.getByRole('radio', { name: 'Mint (current)' })).toBeChecked()
  })

  it('closes on Cancel and on Escape', async () => {
    const user = userEvent.setup()
    const { onClose } = open()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('shows a save failure inside the sheet rather than closing it', () => {
    open({ error: 'Could not save that colour.' })
    expect(screen.getByText('Could not save that colour.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
