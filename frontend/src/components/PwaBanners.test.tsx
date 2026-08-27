import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InstallAppButton, PwaBanners } from './PwaBanners'
import { initPwa, resetPwaStateForTests, type InstallPromptEvent } from '../lib/pwa'

let teardown: () => void = () => {}

function installOffer() {
  const event = new Event('beforeinstallprompt') as InstallPromptEvent
  event.prompt = vi.fn(() => Promise.resolve())
  event.userChoice = Promise.resolve({ outcome: 'accepted' as const })
  return event
}

beforeEach(() => {
  resetPwaStateForTests()
  teardown = initPwa()
})

afterEach(() => {
  teardown()
  vi.unstubAllGlobals()
})

describe('PwaBanners', () => {
  it('says nothing while online and up to date', () => {
    const { container } = render(<PwaBanners />)
    expect(container).toBeEmptyDOMElement()
  })

  it('warns that changes will not save once the connection drops', () => {
    render(<PwaBanners />)
    act(() => window.dispatchEvent(new Event('offline')))
    expect(screen.getByText(/offline/i)).toBeInTheDocument()
  })

  it('clears the warning when the connection returns', () => {
    render(<PwaBanners />)
    act(() => window.dispatchEvent(new Event('offline')))
    expect(screen.getByText(/offline/i)).toBeInTheDocument()
    act(() => window.dispatchEvent(new Event('online')))
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument()
  })
})

describe('InstallAppButton', () => {
  it('stays hidden when the browser has not offered an install', () => {
    vi.stubGlobal('navigator', { userAgent: 'Chrome on Windows', maxTouchPoints: 0, onLine: true })
    const { container } = render(<InstallAppButton />)
    expect(container).toBeEmptyDOMElement()
  })

  it('offers the install once the browser does', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Chrome on Android', maxTouchPoints: 1, onLine: true })
    render(<InstallAppButton />)
    const event = installOffer()
    act(() => {
      window.dispatchEvent(event)
    })

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /install app/i }))
    expect(event.prompt).toHaveBeenCalled()
  })

  it('tells an iPhone how instead, since Safari never offers', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari',
      maxTouchPoints: 5,
      onLine: true,
    })
    render(<InstallAppButton />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /add to home screen/i }))
    expect(screen.getByText(/share button in safari/i)).toBeInTheDocument()
  })
})
