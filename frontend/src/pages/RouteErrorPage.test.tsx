import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { RouteErrorPage } from './RouteErrorPage'
import appSource from '../App.tsx?raw'

/*
 * What the router shows when a page fails, in place of its own screen
 * ("Unexpected Application Error!", written for a developer).
 */

const reloadApp = vi.hoisted(() => vi.fn())
vi.mock('../lib/reloadApp', () => ({ reloadApp }))
// Telling the church (lib/clientErrors, 0284): what it would be filed under, or nothing.
const reportError = vi.hoisted(() => vi.fn<(source: string, error: unknown) => Promise<string | null>>())
vi.mock('../lib/clientErrors', () => ({ reportError }))

beforeEach(() => {
  reloadApp.mockClear()
  reportError.mockReset()
  reportError.mockResolvedValue(null)
  window.sessionStorage.clear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

function Throws({ error }: { error: unknown }): never {
  throw error
}

function open(path: string, failing: { path: string; error?: unknown; lazy?: () => Promise<never> }) {
  const router = createMemoryRouter(
    [
      {
        errorElement: <RouteErrorPage />,
        children: [
          { path: '/', element: <p>the dashboard</p> },
          failing.lazy
            ? { path: failing.path, lazy: failing.lazy }
            : { path: failing.path, element: <Throws error={failing.error} /> },
        ],
      },
    ],
    { initialEntries: [path] },
  )
  return render(<RouterProvider router={router} />)
}

describe('a page that throws while it is drawn', () => {
  it('gets the page that says so, with the way back to the Dashboard', async () => {
    open('/giving', { path: '/giving', error: new TypeError("Cannot read properties of undefined (reading 'map')") })
    expect(await screen.findByRole('heading', { name: 'This page ran into a problem' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the Dashboard' })).toHaveAttribute('href', '/')
    expect(screen.getByText('Technical details').closest('details')).toHaveTextContent("TypeError: Cannot read properties of undefined (reading 'map')")
    expect(screen.getByText('Technical details').closest('details')).toHaveTextContent('/giving')
  })

  it('never shows the router\'s own screen', async () => {
    open('/giving', { path: '/giving', error: new Error('kaboom') })
    await screen.findByRole('heading', { name: 'This page ran into a problem' })
    expect(screen.queryByText(/Unexpected Application Error/)).toBeNull()
    expect(screen.queryByText(/Hey developer/)).toBeNull()
  })

  it('does not reload by itself: a bug would only be met again', async () => {
    open('/giving', { path: '/giving', error: new Error('kaboom') })
    await screen.findByRole('heading', { name: 'This page ran into a problem' })
    expect(reloadApp).not.toHaveBeenCalled()
  })
})

describe('a page whose code would not download', () => {
  const gone = () => Promise.reject(new TypeError('Failed to fetch dynamically imported module: https://rim.example/assets/EventsPage-Ckox16Ed.js'))

  it('reloads by itself, once: a tab a release behind gets the page it asked for', async () => {
    open('/events', { path: '/events', lazy: gone })
    expect(await screen.findByRole('heading', { name: 'This page couldn’t be loaded' })).toBeInTheDocument()
    // Waited for, not looked for at once: the page reloads from an effect,
    // which runs a beat after the heading is on the screen. Looked for at
    // once, this passed or failed by how busy the machine was (CI, November
    // 2026: red on one run of a commit and green on the other).
    await waitFor(() => expect(reloadApp).toHaveBeenCalledTimes(1))
    // And once only, however long it is left.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(reloadApp).toHaveBeenCalledTimes(1)
  })

  it('shows the page with the button when the reload has already been tried', async () => {
    window.sessionStorage.setItem('rim:reloaded-for-stale-page', String(Date.now()))
    open('/events', { path: '/events', lazy: gone })
    expect(await screen.findByRole('heading', { name: 'This page couldn’t be loaded' })).toBeInTheDocument()
    expect(reloadApp).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Reload the app' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the Dashboard' })).toHaveAttribute('href', '/')
    expect(screen.queryByText(/dynamically imported module/)).toBeNull()
  })
})

describe('telling the church', () => {
  it('reports a page that threw, and shows the reference when it comes', async () => {
    reportError.mockResolvedValue('7F3K2Q9A')
    open('/giving', { path: '/giving', error: new Error('kaboom') })
    expect(await screen.findByText('7F3K2Q9A')).toBeInTheDocument()
    expect(screen.getByText(/It has been reported\. Reference/)).toBeInTheDocument()
    expect(reportError).toHaveBeenCalledWith('page', expect.objectContaining({ message: 'kaboom' }))
  })

  it('shows the page without one when nothing was kept', async () => {
    open('/giving', { path: '/giving', error: new Error('kaboom') })
    await screen.findByRole('heading', { name: 'This page ran into a problem' })
    await Promise.resolve()
    expect(screen.queryByText(/It has been reported/)).toBeNull()
  })

  it('has nothing to report for an address with no page, or code that would not download', async () => {
    open('/no-such-page', { path: '/giving', error: new Error('unused') })
    await screen.findByRole('heading', { name: 'Page not found' })
    expect(reportError).not.toHaveBeenCalled()
  })
})

describe('an address with no page', () => {
  it('gets the 404 page when the router itself says so', async () => {
    open('/no-such-page', { path: '/giving', error: new Error('unused') })
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByText('/no-such-page')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the Dashboard' })).toHaveAttribute('href', '/')
  })
})

describe('the app\'s routes', () => {
  it('put the error page on the root route, so it stands for every page', () => {
    expect(appSource).toMatch(/<Route hydrateFallbackElement=\{<PageLoading \/>\} errorElement=\{<RouteErrorPage \/>\}>/)
  })

  it('keep a page for every address nothing else matched', () => {
    expect(appSource).toMatch(/<Route path="\*" element=\{<NotFoundPage \/>\} \/>\s*<\/Route>,/)
  })
})
