import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppIdentityNotice } from './AppIdentityNotice'
import { setNameFor } from '../lib/appIcon'
import { readKnownIdentity, rememberIdentity } from '../lib/installedIdentity'

/*
 * "The app has a new icon", on a device that already has the app: said
 * once, in that device's terms, and put away for good.
 */

const state = vi.hoisted(() => ({ standalone: true, manifest: null as unknown, ua: '', touch: 0 }))

vi.mock('../lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('../lib/pwa', async (original) => ({ ...(await original<typeof import('../lib/pwa')>()), isStandalone: () => state.standalone }))
vi.mock('../lib/installGuide', async (original) => {
  const real = await original<typeof import('../lib/installGuide')>()
  return { ...real, detectEnvironment: () => real.detectEnvironment(state.ua, state.touch, false) }
})

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36'
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36'

const DAY = 24 * 60 * 60_000
const newSet = setNameFor('logo-b', Date.now() - DAY)
const oldSet = setNameFor('logo-a', Date.now() - 60 * DAY)
const manifest = (set: string | null, over: Record<string, unknown> = {}) => ({
  name: 'Rehoboth International Ministries',
  short_name: 'RIM',
  icons: [{ src: set ? `/app-icon/${set}/icon-192.png` : '/icon-192.png' }],
  ...over,
})
const known = (set: string | null, over: Record<string, string> = {}) => ({ set, name: 'Rehoboth International Ministries', shortName: 'RIM', ...over })

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AppIdentityNotice />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  window.localStorage.clear()
  state.standalone = true
  state.ua = IPHONE
  state.touch = 5
  state.manifest = manifest(newSet)
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(state.manifest), { status: 200, headers: { 'Content-Type': 'application/json' } }))))
})

describe('the notice on a device that already has the app', () => {
  it('tells an iPhone its icon has changed, that it cannot change it, and how to add the app again', async () => {
    rememberIdentity(known(oldSet))
    const user = show()
    const notice = await screen.findByRole('note', { name: 'The app has a new icon' })
    expect(notice).toHaveTextContent('An iPhone or iPad keeps the icon the app was added with, and cannot change it.')
    expect(notice).toHaveTextContent('You will sign in again and allow notifications again')
    // The new icon, so they know what to look for.
    expect(screen.getByRole('img', { name: 'The new icon' })).toHaveAttribute('src', `/app-icon/${newSet}/icon-192.png`)
    // The steps wait to be asked for.
    expect(screen.queryByRole('list')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Show me how' }))
    const steps = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(steps).toHaveLength(4)
    expect(steps[1]).toBe(`Open Safari and go to ${window.location.host}.`)
    await user.click(screen.getByRole('button', { name: 'Hide the steps' }))
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('is put away for good by Got it, and remembers what the device was told about', async () => {
    rememberIdentity(known(oldSet))
    const user = show()
    await screen.findByRole('note', { name: 'The app has a new icon' })
    await user.click(screen.getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('note')).toBeNull()
    expect(readKnownIdentity()).toEqual(known(newSet))
  })

  it('is put away by its cross too', async () => {
    rememberIdentity(known(oldSet))
    const user = show()
    await screen.findByRole('note', { name: 'The app has a new icon' })
    await user.click(screen.getByRole('button', { name: 'Dismiss: The app has a new icon' }))
    expect(screen.queryByRole('note')).toBeNull()
    expect(readKnownIdentity()).toEqual(known(newSet))
  })

  it('tells an Android phone it will change by itself, with nothing to do', async () => {
    state.ua = ANDROID
    state.touch = 5
    rememberIdentity(known(oldSet))
    show()
    const notice = await screen.findByRole('note', { name: 'The app has a new icon' })
    expect(notice).toHaveTextContent('Your phone changes the icon on your Home Screen by itself, usually within a day or two.')
    expect(notice).toHaveTextContent('it may ask you first — say OK')
    expect(screen.queryByRole('button', { name: 'Show me how' })).toBeNull()
  })

  it('tells a computer where the offer is', async () => {
    state.ua = DESKTOP
    state.touch = 0
    rememberIdentity(known(oldSet))
    show()
    expect(await screen.findByRole('note', { name: 'The app has a new icon' })).toHaveTextContent('if it says “Review app update”, choose it')
  })

  it('says the new name when the name is what changed', async () => {
    rememberIdentity(known(newSet, { shortName: 'Rehoboth' }))
    show()
    const notice = await screen.findByRole('note', { name: 'The app has a new name' })
    expect(notice).toHaveTextContent('The app has a new name: RIM')
    expect(screen.queryByRole('img', { name: 'The new icon' })).toBeNull()
  })

  it('says both when both changed', async () => {
    state.manifest = manifest(newSet, { short_name: 'Rehoboth' })
    rememberIdentity(known(oldSet))
    show()
    expect(await screen.findByRole('note', { name: 'The app has a new name and icon' })).toHaveTextContent('The app has a new name and icon: Rehoboth')
  })

  it('tells a device that was in use before any of this was kept, when the icon was made lately', async () => {
    // No memory at all: the app was here before.
    show()
    expect(await screen.findByRole('note', { name: 'The app has a new icon' })).toBeInTheDocument()
    // Not noted until they say so: it is said again next time otherwise.
    expect(readKnownIdentity()).toBeNull()
  })

  it('only notes an old icon on such a device, and says nothing', async () => {
    state.manifest = manifest(oldSet)
    show()
    await waitFor(() => expect(readKnownIdentity()).toEqual(known(oldSet)))
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('notes what a copy that has just been installed is wearing, and says nothing', async () => {
    rememberIdentity('fresh')
    show()
    await waitFor(() => expect(readKnownIdentity()).toEqual(known(newSet)))
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('says nothing when the device has what the manifest names', async () => {
    rememberIdentity(known(newSet))
    show()
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('says nothing in a browser tab, and does not even ask', async () => {
    state.standalone = false
    rememberIdentity(known(oldSet))
    show()
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByRole('note')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
    expect(readKnownIdentity()).toEqual(known(oldSet))
  })

  it('says nothing when the manifest cannot be asked, and forgets nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    rememberIdentity(known(oldSet))
    show()
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.queryByRole('note')).toBeNull()
    expect(readKnownIdentity()).toEqual(known(oldSet))
  })
})
