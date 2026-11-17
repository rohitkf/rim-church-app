import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { ConfirmEmailDialog } from './ConfirmEmailDialog'
import { CONFIRM_EMAIL_WAIT_SECONDS, setConfirmEmailWaitForTests } from '../lib/emailDelivery'

/*
 * "Is this your email address?" holds its Yes back for five seconds, so
 * the address is looked at and not tapped past. The clock here is the
 * test's own: nothing waits.
 */

const pressed = { yes: 0, no: 0, used: [] as string[] }
const show = (email = 'ama@example.org', busy = false) =>
  render(
    <ConfirmEmailDialog
      email={email}
      confirmLabel="Register"
      busy={busy}
      onConfirm={() => (pressed.yes += 1)}
      onChange={() => (pressed.no += 1)}
      onUse={(address) => pressed.used.push(address)}
    />,
  )
const seconds = (n: number) => act(() => void vi.advanceTimersByTime(n * 1000))
const yes = () => screen.queryByRole('button', { name: 'Yes, it’s right — Register' })
const counting = () => screen.getByRole('button', { name: /^Check the address…/ })

beforeEach(() => {
  vi.useFakeTimers()
  setConfirmEmailWaitForTests()
  pressed.yes = 0
  pressed.no = 0
  pressed.used = []
})
afterEach(() => {
  vi.useRealTimers()
  setConfirmEmailWaitForTests()
})

describe('the wait before an address can be said to be right', () => {
  it('is five seconds', () => {
    expect(CONFIRM_EMAIL_WAIT_SECONDS).toBe(5)
  })

  it('counts down on the button, which cannot be pressed until it is over', () => {
    show()
    expect(yes()).toBeNull()
    expect(counting()).toBeDisabled()
    expect(counting()).toHaveTextContent('Check the address… 5')
    fireEvent.click(counting())
    expect(pressed.yes).toBe(0)

    seconds(1)
    expect(counting()).toHaveTextContent('Check the address… 4')
    seconds(3)
    expect(counting()).toHaveTextContent('Check the address… 1')
    expect(counting()).toBeDisabled()

    seconds(1)
    expect(yes()).toBeEnabled()
    fireEvent.click(yes()!)
    expect(pressed.yes).toBe(1)
  })

  it('stays ready once it is: the count does not start again by itself', () => {
    show()
    seconds(5)
    seconds(30)
    expect(yes()).toBeEnabled()
  })

  it('never holds "No, change it" back', () => {
    show()
    const no = screen.getByRole('button', { name: 'No, change it' })
    expect(no).toBeEnabled()
    fireEvent.click(no)
    expect(pressed.no).toBe(1)
  })

  it('starts again for a different address: the spelling offered is a new thing to read', () => {
    const { rerender } = show('ama@gmial.com')
    seconds(5)
    expect(yes()).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, use that one' }))
    expect(pressed.used).toEqual(['ama@gmail.com'])
    // The form takes the spelling and shows the dialog with it.
    rerender(<ConfirmEmailDialog email="ama@gmail.com" confirmLabel="Register" busy={false} onConfirm={() => (pressed.yes += 1)} onChange={() => undefined} onUse={() => undefined} />)
    expect(yes()).toBeNull()
    expect(counting()).toHaveTextContent('Check the address… 5')
    seconds(5)
    expect(yes()).toBeEnabled()
  })

  it('says it is registering once pressed, and cannot be pressed twice', () => {
    const { rerender } = show()
    seconds(5)
    rerender(<ConfirmEmailDialog email="ama@example.org" confirmLabel="Register" busy onConfirm={() => (pressed.yes += 1)} onChange={() => undefined} onUse={() => undefined} />)
    const registering = screen.getByRole('button', { name: 'Registering…' })
    expect(registering).toBeDisabled()
    fireEvent.click(registering)
    expect(pressed.yes).toBe(0)
  })

  it('does not wait at all where the wait is set to nothing', () => {
    setConfirmEmailWaitForTests(0)
    show()
    expect(yes()).toBeEnabled()
  })
})
