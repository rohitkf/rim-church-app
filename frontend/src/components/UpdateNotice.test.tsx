import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UpdateNotice } from './UpdateNotice'
import type { Release } from '../lib/releases'

const state = vi.hoisted(() => ({ updateReady: false }))
const applyUpdate = vi.hoisted(() => vi.fn())
const account = vi.hoisted(() => ({ ready: true, seen: [] as string[], marked: [] as string[][] }))
const server = vi.hoisted(() => ({ releases: [] as unknown[] }))

vi.mock('../lib/usePwa', () => ({
  usePwa: () => ({ updateReady: state.updateReady, installPrompt: null, installed: false, offline: false }),
}))
vi.mock('../lib/pwa', () => ({ applyUpdate }))
vi.mock('../lib/latestReleases', () => ({ fetchLatestReleases: () => Promise.resolve(server.releases) }))
vi.mock('../lib/useUnseenReleases', () => ({
  useUnseenReleases: () => ({
    ready: account.ready,
    signedIn: account.ready,
    unseenOf: (list: Release[]) => (account.ready ? list.filter((r) => !account.seen.includes(r.key)) : []),
    markSeen: (keys: string[]) => {
      if (account.ready && keys.length > 0) account.marked.push(keys)
    },
  }),
}))

const release = (key: string, title: string): Release => ({
  key,
  date: '2026-11-15',
  title,
  lead: `${title}, in a line.`,
  points: [`What ${title} does.`],
  link: { to: '/somewhere', label: `Open ${title}` },
})

beforeEach(() => {
  state.updateReady = false
  applyUpdate.mockReset()
  account.ready = true
  account.seen = ['older']
  account.marked = []
  // What the version waiting on the server says is new: one release this
  // build has never heard of, above one the account has already seen.
  server.releases = [release('brand-new', 'Brand new thing'), release('older', 'Older thing')]
})

function comeBackToTheFront() {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

describe('the new-version notice', () => {
  it('stays out of the way while the build is current', () => {
    render(<UpdateNotice />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('says a new version is ready once one is waiting', () => {
    state.updateReady = true
    render(<UpdateNotice />)
    expect(screen.getByRole('status', { name: 'A new version is ready' })).toHaveTextContent('New version ready')
  })

  it('takes the update on Reload', async () => {
    state.updateReady = true
    render(<UpdateNotice />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reload' }))
    expect(applyUpdate).toHaveBeenCalledTimes(1)
  })

  it('says it is going, so nobody presses twice while the page swaps', async () => {
    state.updateReady = true
    render(<UpdateNotice />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Reload' }))
    const button = screen.getByRole('button', { name: 'Reloading…' })
    expect(button).toBeDisabled()
    await user.click(button)
    expect(applyUpdate).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Later' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Show details' })).toBeNull()
  })

  /*
   * The point of the change: it is a notice, not a door. The dialog it
   * replaces stood in front of the whole app until Reload was pressed.
   */
  describe('it interrupts nobody', () => {
    it('is not a dialog, and holds nothing behind it', () => {
      state.updateReady = true
      render(
        <>
          <button type="button">Tick the checklist</button>
          <UpdateNotice />
        </>,
      )
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(screen.queryByRole('alertdialog')).toBeNull()
      // What is behind it is still there to be pressed.
      expect(screen.getByRole('button', { name: 'Tick the checklist' })).toBeEnabled()
      expect(document.body).not.toHaveStyle({ overflow: 'hidden' })
    })

    it('takes no focus from what somebody is doing', () => {
      state.updateReady = true
      render(
        <>
          <input aria-label="Message" autoFocus />
          <UpdateNotice />
        </>,
      )
      expect(screen.getByLabelText('Message')).toHaveFocus()
    })

    it('goes away on Later, without reloading', async () => {
      state.updateReady = true
      render(<UpdateNotice />)
      await userEvent.setup().click(screen.getByRole('button', { name: 'Later' }))
      expect(screen.queryByRole('status')).toBeNull()
      expect(applyUpdate).not.toHaveBeenCalled()
    })

    it('comes back when the app is next brought to the front', async () => {
      state.updateReady = true
      render(<UpdateNotice />)
      await userEvent.setup().click(screen.getByRole('button', { name: 'Later' }))
      expect(screen.queryByRole('status')).toBeNull()
      comeBackToTheFront()
      expect(screen.getByRole('status', { name: 'A new version is ready' })).toBeInTheDocument()
    })
  })

  describe('what the update is, for whoever asks', () => {
    it('shows nothing about it until Show details is pressed', () => {
      state.updateReady = true
      render(<UpdateNotice />)
      expect(screen.getByRole('button', { name: 'Show details' })).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('shows what the waiting version says is new, without reloading', async () => {
      state.updateReady = true
      render(<UpdateNotice />)
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Show details' }))
      const sheet = await screen.findByRole('dialog', { name: 'What’s new' })
      // Only what this account has not been told about.
      expect(within(sheet).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Brand new thing'])
      expect(within(sheet).getByText('What Brand new thing does.')).toBeInTheDocument()
      expect(applyUpdate).not.toHaveBeenCalled()
      // The page it describes may not exist in the build still running.
      expect(within(sheet).queryByRole('button', { name: /^Open/ })).toBeNull()
      expect(within(sheet).getByRole('button', { name: 'Done' })).toBeInTheDocument()
    })

    it('remembers they were told once the sheet is closed, and the notice is still there to reload from', async () => {
      state.updateReady = true
      render(<UpdateNotice />)
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Show details' }))
      await user.click(within(await screen.findByRole('dialog', { name: 'What’s new' })).getByRole('button', { name: 'Done' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(account.marked).toEqual([['brand-new']])
      expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    })

    it('says so when the update brings nothing to learn', async () => {
      account.seen = ['brand-new', 'older']
      state.updateReady = true
      render(<UpdateNotice />)
      await userEvent.setup().click(screen.getByRole('button', { name: 'Show details' }))
      const sheet = await screen.findByRole('dialog', { name: 'What’s new' })
      expect(within(sheet).getByText('Fixes and small improvements. Nothing you need to learn.')).toBeInTheDocument()
    })

    it('shows a visitor the newest few, and remembers nothing for them', async () => {
      account.ready = false
      server.releases = ['a', 'b', 'c', 'd'].map((k) => release(k, `Thing ${k}`))
      state.updateReady = true
      render(<UpdateNotice />)
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Show details' }))
      const sheet = await screen.findByRole('dialog', { name: 'What’s new' })
      expect(within(sheet).getAllByRole('heading', { level: 3 })).toHaveLength(3)
      await user.click(within(sheet).getByRole('button', { name: 'Done' }))
      expect(account.marked).toEqual([])
    })
  })
})
