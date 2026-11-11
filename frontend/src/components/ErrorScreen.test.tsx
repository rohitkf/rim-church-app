import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrokenPageScreen, NotFoundScreen, StalePageScreen } from './ErrorScreen'

/*
 * The page somebody gets when the page they asked for cannot be shown:
 * what happened, what to do, and the way back to the Dashboard.
 */

const reloadApp = vi.hoisted(() => vi.fn())
vi.mock('../lib/reloadApp', () => ({ reloadApp }))

beforeEach(() => {
  reloadApp.mockClear()
})

const dashboard = () => screen.getByRole('link', { name: 'Back to the Dashboard' })

describe('page not found', () => {
  it('says so, shows the address that was asked for, and leads to the Dashboard', () => {
    render(<NotFoundScreen path="/servce-planner" />)
    expect(screen.getByText('Error 404')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByText('/servce-planner')).toBeInTheDocument()
    expect(dashboard()).toHaveAttribute('href', '/')
  })

  it('offers Go back only where there is somewhere to go back to', async () => {
    const back = vi.fn()
    const { rerender } = render(<NotFoundScreen path="/x" />)
    expect(screen.queryByRole('button', { name: 'Go back' })).toBeNull()
    rerender(<NotFoundScreen path="/x" onBack={back} />)
    await userEvent.click(screen.getByRole('button', { name: 'Go back' }))
    expect(back).toHaveBeenCalledTimes(1)
  })
})

describe('a page that would not load', () => {
  it('says why in words a person can use, and reloads on the button', async () => {
    render(<StalePageScreen onDashboard={false} />)
    expect(screen.getByRole('heading', { name: 'This page couldn’t be loaded' })).toBeInTheDocument()
    expect(screen.getByText(/has been updated since this tab was opened/)).toBeInTheDocument()
    expect(screen.queryByText(/dynamically imported module/)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Reload the app' }))
    expect(reloadApp).toHaveBeenCalledTimes(1)
    expect(dashboard()).toHaveAttribute('href', '/')
  })

  it('does not offer the Dashboard to somebody who is on it', () => {
    render(<StalePageScreen onDashboard />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByRole('button', { name: 'Reload the app' })).toBeInTheDocument()
  })
})

describe('a page that broke', () => {
  it('says it is not their doing, and leads to the Dashboard first', () => {
    render(<BrokenPageScreen path="/giving" summary="TypeError: Cannot read properties of undefined (reading 'map')" />)
    expect(screen.getByRole('heading', { name: 'This page ran into a problem' })).toBeInTheDocument()
    expect(screen.getByText(/isn’t something you did/)).toHaveTextContent(/Going back to the Dashboard usually clears it/)
    expect(dashboard()).toHaveAttribute('href', '/')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('keeps the error for whoever fixes it, folded away, with the page it happened on', () => {
    render(<BrokenPageScreen path="/giving" summary="TypeError: Cannot read properties of undefined (reading 'map')" />)
    const details = screen.getByText('Technical details').closest('details')
    expect(details).not.toHaveAttribute('open')
    expect(details).toHaveTextContent("TypeError: Cannot read properties of undefined (reading 'map')")
    expect(details).toHaveTextContent('/giving')
  })

  it('tries again by reloading', async () => {
    render(<BrokenPageScreen path="/giving" summary="Error: kaboom" />)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reloadApp).toHaveBeenCalledTimes(1)
  })

  it('on the Dashboard itself, offers a reload and not a link to where they already are', () => {
    render(<BrokenPageScreen path="/" summary="Error: kaboom" />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByRole('button', { name: 'Reload the app' })).toBeInTheDocument()
    expect(screen.getByText(/Reloading usually clears it/)).toBeInTheDocument()
  })
})
