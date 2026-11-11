import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useAppIconSync } from './useAppIconSync'

/*
 * The installed app's icon follows the App Logo by itself, in the browser
 * of whoever may change the logo. What matters most here is when it does
 * NOT act: for somebody the bucket would refuse, and while the settings
 * are still defaults that say "no logo".
 */

const may = vi.fn(() => true)
vi.mock('./usePermissions', () => ({ usePermissions: () => ({ can: (cap: string) => cap === 'settings.logo' && may() }) }))

const read = vi.fn<() => Promise<{ logo_url: string | null }>>()
vi.mock('./appSettings', () => ({ SETTINGS_KEY: ['app-settings'], fetchAppSettings: () => read() }))
vi.mock('./appLogo', () => ({ BRANDING_BUCKET: 'branding' }))
vi.mock('./supabaseClient', () => ({ supabase: {} }))

const sync = vi.fn<(path: string | null) => Promise<{ set: string | null; changed: boolean }>>()
const pointed = vi.fn()
vi.mock('./appIcon', async (original) => ({
  ...(await original<typeof import('./appIcon')>()),
  syncAppIcons: (path: string | null) => sync(path),
  applyPageIcons: (set: string | null) => pointed(set),
}))

function run() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return renderHook(() => useAppIconSync(), { wrapper })
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30))

beforeEach(() => {
  may.mockReturnValue(true)
  read.mockReset()
  sync.mockReset()
  pointed.mockReset()
  sync.mockResolvedValue({ set: 'mabc-logo1', changed: true })
})

describe('the icon follows the logo', () => {
  it('makes the icon from the logo in use, and points this page at it', async () => {
    read.mockResolvedValue({ logo_url: 'logo/logo1.png' })
    run()
    await waitFor(() => expect(sync).toHaveBeenCalledWith('logo/logo1.png'))
    await waitFor(() => expect(pointed).toHaveBeenCalledWith('mabc-logo1'))
  })

  it('takes the icon down when the logo has been taken down', async () => {
    read.mockResolvedValue({ logo_url: null })
    sync.mockResolvedValue({ set: null, changed: true })
    run()
    await waitFor(() => expect(sync).toHaveBeenCalledWith(null))
  })

  it('does nothing for somebody who may not change the logo: the bucket would refuse them', async () => {
    may.mockReturnValue(false)
    read.mockResolvedValue({ logo_url: 'logo/logo1.png' })
    run()
    await settle()
    expect(sync).not.toHaveBeenCalled()
  })

  it('does nothing while the settings have not loaded, or failed to: "no logo" there is a default, not a fact', async () => {
    read.mockRejectedValue(new Error('offline'))
    run()
    await settle()
    expect(sync).not.toHaveBeenCalled()
  })

  it('stays quiet when the icon cannot be made', async () => {
    read.mockResolvedValue({ logo_url: 'logo/logo1.png' })
    sync.mockRejectedValue(new Error('storage is down'))
    run()
    await waitFor(() => expect(sync).toHaveBeenCalled())
    await settle()
    expect(pointed).not.toHaveBeenCalled()
  })
})
