import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PushPermissionRow } from './PushPermission'

const rpc = vi.fn()
const del = vi.fn()
const subscribeToPush = vi.fn()
const requestPermission = vi.fn()
const unsubscribeFromPush = vi.fn()
let permission = 'default'

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'u1' } } }) }))

vi.mock('../lib/pwa', () => ({ isIos: () => false, isStandalone: () => false }))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...(args as [])),
    from: () => ({ delete: () => ({ eq: (...a: unknown[]) => del(...(a as [])) }) }),
  },
}))

vi.mock('../lib/push', () => ({
  notificationsSupported: () => true,
  permissionState: () => permission,
  requestPermission: () => requestPermission(),
  subscribeToPush: () => subscribeToPush(),
  unsubscribeFromPush: () => unsubscribeFromPush(),
}))

const aSubscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  keys: { p256dh: 'p256', auth: 'auth' },
}

beforeEach(() => {
  permission = 'default'
  rpc.mockReset().mockResolvedValue({ error: null })
  del.mockReset().mockResolvedValue({ error: null })
  subscribeToPush.mockReset().mockResolvedValue(aSubscription)
  requestPermission.mockReset().mockResolvedValue('granted')
  unsubscribeFromPush.mockReset().mockResolvedValue(aSubscription.endpoint)
})

afterEach(() => vi.clearAllMocks())

describe('PushPermissionRow', () => {
  describe('a device that has never been asked', () => {
    it('offers the button, and registers the device once permission is given', async () => {
      const user = userEvent.setup()
      render(<PushPermissionRow />)
      await user.click(screen.getByRole('button', { name: 'Turn on notifications' }))
      await waitFor(() =>
        expect(rpc).toHaveBeenCalledWith('register_push_device', {
          p_endpoint: aSubscription.endpoint,
          p_p256dh: 'p256',
          p_auth: 'auth',
        }),
      )
      expect(await screen.findByText('Notifications are on for this device.')).toBeInTheDocument()
    })

    it('says what actually failed rather than claiming it worked', async () => {
      rpc.mockResolvedValue({ error: { message: 'nope' } })
      const user = userEvent.setup()
      render(<PushPermissionRow />)
      await user.click(screen.getByRole('button', { name: 'Turn on notifications' }))
      expect(
        await screen.findByText(/couldn’t register for alerts while the app is closed|couldn't register for alerts while the app is closed/),
      ).toBeInTheDocument()
    })
  })

  describe('a device that granted permission before push existed', () => {
    // The bug this file was written for. Everybody using the bell before
    // push shipped had permission already, so the component rendered
    // "Notifications are on for this device" and never offered the button
    // that was the only thing that registered a subscription. Their phones
    // would have stayed silent for ever, and the panel would have said
    // everything was fine.
    beforeEach(() => {
      permission = 'granted'
    })

    it('registers it on sight, without waiting for a click it never offers', async () => {
      render(<PushPermissionRow />)
      await waitFor(() => expect(rpc).toHaveBeenCalledWith('register_push_device', expect.anything()))
      expect(await screen.findByText('Notifications are on for this device.')).toBeInTheDocument()
    })

    it('does not claim the device is reachable when this build has no VAPID key', async () => {
      subscribeToPush.mockResolvedValue(null)
      render(<PushPermissionRow />)
      expect(
        await screen.findByText('Notifications are on while the app is open.'),
      ).toBeInTheDocument()
      expect(rpc).not.toHaveBeenCalled()
    })

    it('offers a way back when registering fails, and takes it', async () => {
      rpc.mockResolvedValueOnce({ error: { message: 'nope' } })
      const user = userEvent.setup()
      render(<PushPermissionRow />)
      const again = await screen.findByRole('button', { name: 'Try again' })
      expect(
        screen.getByText('Notifications are on here, but not while the app is closed.'),
      ).toBeInTheDocument()
      await user.click(again)
      expect(await screen.findByText('Notifications are on for this device.')).toBeInTheDocument()
    })
  })

  describe('turning it off', () => {
    beforeEach(() => {
      permission = 'granted'
    })

    it('drops the row for the endpoint the browser gave up', async () => {
      const user = userEvent.setup()
      render(<PushPermissionRow />)
      await user.click(await screen.findByRole('button', { name: 'Turn off' }))
      await waitFor(() => expect(del).toHaveBeenCalledWith('endpoint', aSubscription.endpoint))
    })
  })
})
