import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { forgetLocationPermission } from '../lib/locationPermission'
import { LocationPage } from './LocationPage'

vi.mock('../components/Surface', async (importOriginal) => {
  const real = await importOriginal<typeof import('../components/Surface')>()
  return { ...real, PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }
})

type Answer = 'yes' | 'no'
function phone(answers: Answer[]) {
  const getCurrentPosition = vi.fn((ok: PositionCallback, fail: PositionErrorCallback) => {
    const answer = answers.shift() ?? 'no'
    if (answer === 'yes') ok({ coords: { latitude: 51.5, longitude: -0.1, accuracy: 10 } } as GeolocationPosition)
    else fail({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError)
  })
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
  return getCurrentPosition
}

afterEach(() => forgetLocationPermission())

describe('Allow location', () => {
  it('asks the phone on arrival, and says so when it is allowed', async () => {
    const asked = phone(['yes'])
    render(<LocationPage />)
    expect(await screen.findByText(/Allowed. You are all set/)).toBeInTheDocument()
    expect(asked).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Allow location' })).not.toBeInTheDocument()
  })

  it('shows the steps when blocked, and asks again on Allow location', async () => {
    const asked = phone(['no', 'yes'])
    render(<LocationPage />)
    expect(await screen.findByText(/Blocked. Follow the steps/)).toBeInTheDocument()
    expect(screen.getByText('On an iPhone')).toBeInTheDocument()
    expect(screen.getByText('On Android')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Allow location' }))
    expect(await screen.findByText(/Allowed. You are all set/)).toBeInTheDocument()
    expect(asked).toHaveBeenCalledTimes(2)
  })
})
