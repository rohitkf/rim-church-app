import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CheckEmailDialog } from './CheckEmailDialog'
import { ANDROID_EMAIL_INTENT } from '../lib/mailApp'

const auth = vi.hoisted(() => ({ resends: [] as unknown[], error: null as { message: string } | null }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      resend: (args: unknown) => {
        auth.resends.push(args)
        return Promise.resolve({ error: auth.error })
      },
    },
  },
}))

/** The countdown re-arms itself every second, so time has to pass a second at a time. */
async function waitOutTheMinute() {
  for (let i = 0; i < 60; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
  }
}

const asDevice = (userAgent: string) => vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent)
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari'
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126'

beforeEach(() => {
  auth.resends = []
  auth.error = null
})
afterEach(() => vi.restoreAllMocks())

describe('after signing up', () => {
  it('says which address it went to, and to look in spam', () => {
    asDevice(DESKTOP)
    render(<CheckEmailDialog email="ada@gmail.com" onClose={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Check your email' })).toBeInTheDocument()
    expect(screen.getByText('ada@gmail.com')).toBeInTheDocument()
    expect(screen.getByText(/spam or junk/)).toBeInTheDocument()
  })

  it('on Android, Open email is the system’s chooser of mail apps, with Gmail on the web beside it', () => {
    asDevice(ANDROID)
    render(<CheckEmailDialog email="ada@gmail.com" onClose={() => {}} />)
    expect(screen.getByRole('link', { name: 'Open email' })).toHaveAttribute('href', ANDROID_EMAIL_INTENT)
    expect(screen.getByRole('link', { name: 'Open Gmail in the browser' })).toHaveAttribute('target', '_blank')
  })

  it('on an iPhone with an address we cannot name, Open email is Apple Mail', () => {
    asDevice(IPHONE)
    render(<CheckEmailDialog email="ada@church.org.uk" onClose={() => {}} />)
    expect(screen.getByRole('link', { name: 'Open email' })).toHaveAttribute('href', 'message://')
  })

  it('on a computer, Open email is the webmail in a new tab', () => {
    asDevice(DESKTOP)
    render(<CheckEmailDialog email="ada@outlook.com" onClose={() => {}} />)
    const link = screen.getByRole('link', { name: 'Open email' })
    expect(link).toHaveAttribute('href', 'https://outlook.live.com/mail/0/inbox')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('on a computer with an address we cannot name, offers no button that would go nowhere', () => {
    asDevice(DESKTOP)
    render(<CheckEmailDialog email="ada@church.org.uk" onClose={() => {}} />)
    expect(screen.queryByRole('link', { name: 'Open email' })).toBeNull()
    expect(screen.getByText('ada@church.org.uk')).toBeInTheDocument()
  })

  it('goes back to the form from “Wrong address?”', async () => {
    asDevice(DESKTOP)
    const onClose = vi.fn()
    render(<CheckEmailDialog email="ada@gmail.com" onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Wrong address? Go back' }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('sending it again', () => {
  it('waits a minute after the first send, then sends again and says so', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    asDevice(DESKTOP)
    render(<CheckEmailDialog email="ada@gmail.com" onClose={() => {}} />)
    const button = screen.getByRole('button', { name: /Send it again \(60s\)/ })
    expect(button).toBeDisabled()

    await waitOutTheMinute()
    const ready = screen.getByRole('button', { name: 'Send it again' })
    expect(ready).toBeEnabled()
    await act(async () => {
      ready.click()
    })
    await waitFor(() => expect(auth.resends).toEqual([{ type: 'signup', email: 'ada@gmail.com' }]))
    expect(await screen.findByText(/Sent again/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Send it again \(60s\)/ })).toBeDisabled()
    vi.useRealTimers()
  })

  it('says what went wrong when the email service refuses', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    auth.error = { message: 'For security purposes, you can only request this after 45 seconds.' }
    asDevice(DESKTOP)
    render(<CheckEmailDialog email="ada@gmail.com" onClose={() => {}} />)
    await waitOutTheMinute()
    await act(async () => {
      screen.getByRole('button', { name: 'Send it again' }).click()
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('only request this after 45 seconds')
    vi.useRealTimers()
  })
})
