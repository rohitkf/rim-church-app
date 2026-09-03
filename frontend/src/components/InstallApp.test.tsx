import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InstallAppBadge } from './InstallApp'
import { initPwa, resetPwaStateForTests, type InstallPromptEvent } from '../lib/pwa'

let teardown: () => void = () => {}

function installOffer() {
  const event = new Event('beforeinstallprompt') as InstallPromptEvent
  event.prompt = vi.fn(() => Promise.resolve())
  event.userChoice = Promise.resolve({ outcome: 'accepted' as const })
  return event
}

const onAndroid = () =>
  vi.stubGlobal('navigator', {
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120',
    maxTouchPoints: 1,
    onLine: true,
  })

const onIphone = () =>
  vi.stubGlobal('navigator', {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari',
    maxTouchPoints: 5,
    onLine: true,
  })

/** Running from the home screen, which is what `installed` means. */
const asInstalledApp = () =>
  vi.stubGlobal('matchMedia', ((query: string) => ({
    matches: query.includes('standalone'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia)

beforeEach(() => {
  localStorage.clear()
  resetPwaStateForTests()
})

afterEach(() => {
  teardown()
  vi.unstubAllGlobals()
})

const start = () => {
  teardown = initPwa()
}

describe('the install button in the header', () => {
  it('is there, and glowing, for somebody in a browser tab', () => {
    onAndroid()
    start()
    render(<InstallAppBadge />)
    const button = screen.getByRole('button', { name: 'Install app' })
    expect(button.className).toContain('install-glow')
  })

  it('is gone once the app is running from the home screen', () => {
    // The whole point: it is advice that has been taken.
    onAndroid()
    asInstalledApp()
    start()
    const { container } = render(<InstallAppBadge />)
    expect(container).toBeEmptyDOMElement()
  })

  it('stops glowing once the directions have been opened, and stays stopped', async () => {
    onAndroid()
    start()
    const user = userEvent.setup()
    const { unmount } = render(<InstallAppBadge />)
    await user.click(screen.getByRole('button', { name: 'Install app' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByRole('button', { name: 'Install app' }).className).not.toContain(
      'install-glow',
    )

    unmount()
    render(<InstallAppBadge />)
    expect(screen.getByRole('button', { name: 'Install app' }).className).not.toContain(
      'install-glow',
    )
  })
})

describe('the directions', () => {
  it('opens on the steps for the phone in your hand', async () => {
    onIphone()
    start()
    const user = userEvent.setup()
    render(<InstallAppBadge />)
    await user.click(screen.getByRole('button', { name: 'Install app' }))
    expect(screen.getByRole('tab', { name: /iPhone/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(/Tap the Share button/)).toBeInTheDocument()
  })

  it('lets you read another device’s steps, for the person you are helping', async () => {
    onIphone()
    start()
    const user = userEvent.setup()
    render(<InstallAppBadge />)
    await user.click(screen.getByRole('button', { name: 'Install app' }))
    await user.click(screen.getByRole('tab', { name: /Android/ }))
    expect(screen.getByText(/Tap the three dots/)).toBeInTheDocument()
  })

  it('offers the one-tap install where the browser has said it can', async () => {
    onAndroid()
    start()
    const event = installOffer()
    act(() => {
      window.dispatchEvent(event)
    })

    const user = userEvent.setup()
    render(<InstallAppBadge />)
    await user.click(screen.getByRole('button', { name: 'Install app' }))
    await user.click(screen.getByRole('button', { name: 'Install now' }))
    expect(event.prompt).toHaveBeenCalled()
  })

  it('never offers it under another device’s steps', async () => {
    // "Install now" under the iPhone instructions would install the app on
    // the laptop reading them.
    onAndroid()
    start()
    act(() => {
      window.dispatchEvent(installOffer())
    })

    const user = userEvent.setup()
    render(<InstallAppBadge />)
    await user.click(screen.getByRole('button', { name: 'Install app' }))
    await user.click(screen.getByRole('tab', { name: /iPhone/ }))
    expect(screen.queryByRole('button', { name: 'Install now' })).not.toBeInTheDocument()
  })

  it('says nothing about a one-tap install where Safari never offers one', async () => {
    onIphone()
    start()
    const user = userEvent.setup()
    render(<InstallAppBadge />)
    await user.click(screen.getByRole('button', { name: 'Install app' }))
    expect(screen.queryByRole('button', { name: 'Install now' })).not.toBeInTheDocument()
  })
})
