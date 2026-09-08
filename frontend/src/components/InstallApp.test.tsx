import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InstallAppBadge, InstallAppGuide } from './InstallApp'

const env = vi.hoisted(() => ({
  ua: '',
  touch: 0,
  installPrompt: null as unknown,
}))

vi.mock('../lib/usePwa', () => ({
  usePwa: () => ({
    updateReady: false,
    installPrompt: env.installPrompt,
    installed: false,
    offline: false,
  }),
}))
vi.mock('../lib/pwa', () => ({ promptInstall: vi.fn() }))

const SAMSUNG =
  'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36'
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

beforeEach(() => {
  env.installPrompt = null
  vi.stubGlobal('navigator', { userAgent: SAMSUNG, maxTouchPoints: 1, onLine: true })
})

describe('InstallAppGuide', () => {
  it('opens on the steps for the browser in front of the person', () => {
    render(<InstallAppGuide onClose={() => {}} />)
    expect(screen.getByText(/Samsung Internet on Android/)).toBeInTheDocument()
    // Samsung's menu is three lines at the bottom, which is exactly what
    // the old one-guide-per-platform version got wrong.
    expect(screen.getByText(/three lines at the bottom right/i)).toBeInTheDocument()
    expect(screen.queryByText(/three dots/i)).toBeNull()
  })

  it('reads an iPhone as an iPhone', () => {
    vi.stubGlobal('navigator', { userAgent: IPHONE_SAFARI, maxTouchPoints: 5, onLine: true })
    render(<InstallAppGuide onClose={() => {}} />)
    expect(screen.getByText(/Safari on iPhone/)).toBeInTheDocument()
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument()
  })

  it('lets somebody we guessed wrong pick their own', async () => {
    const user = userEvent.setup()
    render(<InstallAppGuide onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: /Not this one/ }))
    await user.click(screen.getByRole('button', { name: 'Safari' }))

    expect(screen.getByText('Safari · iPhone or iPad')).toBeInTheDocument()
    expect(screen.getByText(/blue compass|Share button/i)).toBeInTheDocument()
  })

  it('keeps every other set of steps one press away, for a head helping somebody', async () => {
    const user = userEvent.setup()
    render(<InstallAppGuide onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: /Not this one/ }))

    for (const label of ['Safari', 'Firefox', 'Edge', 'Samsung Internet', 'Safari on a Mac']) {
      expect(screen.getAllByRole('button', { name: label }).length).toBeGreaterThan(0)
    }
  })

  it('offers the one-tap install only while the steps match the browser we are in', async () => {
    env.installPrompt = { prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'accepted' }) }
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
      maxTouchPoints: 1,
      onLine: true,
    })
    const user = userEvent.setup()
    render(<InstallAppGuide onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Install now' })).toBeInTheDocument()

    // Reading the iPhone steps on a laptop must not offer to install it
    // on the laptop.
    await user.click(screen.getByRole('button', { name: /Not this one/ }))
    await user.click(screen.getByRole('button', { name: 'Safari' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Install now' })).toBeNull())
  })

  it('closes on Done', async () => {
    const onClose = vi.fn()
    render(<InstallAppGuide onClose={onClose} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('InstallAppBadge', () => {
  /*
   * The animations used to stop for good once somebody had opened the
   * directions, on the grounds that a button which keeps moving is
   * nagging. Reading the steps is not installing the app, though — and
   * the person who read them and did not follow through is the one the
   * button is still there for. It goes quiet by being installed.
   */
  it('keeps glowing and glistening for as long as the app is not installed', () => {
    render(<InstallAppBadge />)
    const badge = screen.getByRole('button', { name: 'Install app' })
    expect(badge).toHaveClass('install-glow')
    expect(badge).toHaveClass('glisten')
  })

  it('still does, once the directions have been read', async () => {
    const user = userEvent.setup()
    render(<InstallAppBadge />)
    const badge = screen.getByRole('button', { name: 'Install app' })
    await user.click(badge)
    expect(screen.getByText(/Keep this on your home screen/)).toBeInTheDocument()
    expect(badge).toHaveClass('install-glow')
    expect(badge).toHaveClass('glisten')
  })
})
