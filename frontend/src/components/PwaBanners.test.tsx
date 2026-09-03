import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { PwaBanners } from './PwaBanners'
import { initPwa, resetPwaStateForTests } from '../lib/pwa'

let teardown: () => void = () => {}

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
