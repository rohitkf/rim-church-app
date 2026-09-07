import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UpdateRequiredDialog } from './UpdateRequiredDialog'

const state = vi.hoisted(() => ({ updateReady: false }))
const applyUpdate = vi.hoisted(() => vi.fn())

vi.mock('../lib/usePwa', () => ({
  usePwa: () => ({
    updateReady: state.updateReady,
    installPrompt: null,
    installed: false,
    offline: false,
  }),
}))
vi.mock('../lib/pwa', () => ({ applyUpdate }))

beforeEach(() => {
  state.updateReady = false
  applyUpdate.mockReset()
})

describe('UpdateRequiredDialog', () => {
  it('stays out of the way while the build is current', () => {
    render(<UpdateRequiredDialog />)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('stands in front of the app once a new build is waiting', () => {
    state.updateReady = true
    render(<UpdateRequiredDialog />)
    expect(screen.getByRole('alertdialog', { name: /new version is ready/i })).toBeInTheDocument()
  })

  it('takes the update on the one button it offers', async () => {
    state.updateReady = true
    render(<UpdateRequiredDialog />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reload now' }))
    expect(applyUpdate).toHaveBeenCalledTimes(1)
  })

  it('says it is going, so nobody presses twice while the page swaps', async () => {
    state.updateReady = true
    render(<UpdateRequiredDialog />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Reload now' }))

    const button = screen.getByRole('button', { name: 'Reloading…' })
    expect(button).toBeDisabled()
    await user.click(button)
    expect(applyUpdate).toHaveBeenCalledTimes(1)
  })

  /*
   * The point of the change: this is a door, not a notice. The old banner
   * had a Reload button beside everything else on the page and was ignored
   * for as long as anybody liked.
   */
  describe('there is no way past it but through', () => {
    it('offers nothing but the reload — no Cancel, no close', () => {
      state.updateReady = true
      render(<UpdateRequiredDialog />)
      const buttons = screen.getAllByRole('button')
      expect(buttons).toHaveLength(1)
      expect(buttons[0]).toHaveAccessibleName('Reload now')
    })

    it('ignores Escape', async () => {
      state.updateReady = true
      render(<UpdateRequiredDialog />)
      await userEvent.setup().keyboard('{Escape}')
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    })

    it('ignores a tap on the backdrop', async () => {
      state.updateReady = true
      render(<UpdateRequiredDialog />)
      await userEvent.setup().click(screen.getByRole('dialog'))
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    })
  })
})
