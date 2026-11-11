import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'

/*
 * The last net, above the router: the same screens as the router's own
 * error page, for whatever it does not catch.
 */

const reloadApp = vi.hoisted(() => vi.fn())
vi.mock('../lib/reloadApp', () => ({ reloadApp }))

function Bomb({ error }: { error: Error }): never {
  throw error
}

beforeEach(() => {
  reloadApp.mockClear()
  window.sessionStorage.clear()
  // React logs the caught error to console.error; that noise is not this test's.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('ErrorBoundary', () => {
  it('renders children normally when nothing throws', () => {
    render(
      <ErrorBoundary>
        <div>All good</div>
      </ErrorBoundary>,
    )
    expect(screen.getByText('All good')).toBeInTheDocument()
  })

  it('catches a render error and shows the page that says so, with the error kept for whoever fixes it', () => {
    render(
      <ErrorBoundary>
        <Bomb error={new Error('kaboom')} />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('heading', { name: 'This page ran into a problem' })).toBeInTheDocument()
    expect(screen.getByText('Technical details').closest('details')).toHaveTextContent('Error: kaboom')
    // jsdom starts every test on "/", which is the Dashboard: a reload, not a link to here.
    expect(screen.getByRole('button', { name: 'Reload the app' })).toBeInTheDocument()
    expect(reloadApp).not.toHaveBeenCalled()
  })

  it('reloads by itself, once, for code that would not download', () => {
    render(
      <ErrorBoundary>
        <Bomb error={new TypeError('Failed to fetch dynamically imported module: /assets/index-abc.js')} />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('heading', { name: 'This page couldn’t be loaded' })).toBeInTheDocument()
    expect(reloadApp).toHaveBeenCalledTimes(1)
  })

  it('does not reload twice in a row', () => {
    window.sessionStorage.setItem('rim:reloaded-for-stale-page', String(Date.now()))
    render(
      <ErrorBoundary>
        <Bomb error={new TypeError('Importing a module script failed.')} />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('heading', { name: 'This page couldn’t be loaded' })).toBeInTheDocument()
    expect(reloadApp).not.toHaveBeenCalled()
  })
})
