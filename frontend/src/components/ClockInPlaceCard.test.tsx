import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ClockInPlaceCard } from './ClockInPlaceCard'

/*
 * Setting where the church is: found by postcode, or by standing at the
 * door; nothing saved until Save, and what is saved is where the pin is.
 */

const state = vi.hoisted(() => ({
  place: null as null | Record<string, unknown>,
  saved: [] as unknown[],
  radii: [] as number[],
  found: [] as unknown[],
}))

vi.mock('../lib/useErrorText', () => ({ useErrorText: () => (_e: unknown, fallback: string) => fallback }))
vi.mock('../lib/appSettings', async (original) => ({
  ...(await original<typeof import('../lib/appSettings')>()),
  useAppSettings: () => ({ clock_in_radius_m: 100 }),
}))
vi.mock('./PlaceMap', () => ({
  PlaceMap: ({
    lat,
    lng,
    radius,
    onMove,
  }: {
    lat: number
    lng: number
    radius: number
    onMove: (to: { lat: number; lng: number }) => void
  }) => (
    <button type="button" onClick={() => onMove({ lat: lat + 0.0005, lng })}>
      map at {lat.toFixed(4)},{lng.toFixed(4)} circle {radius} m
    </button>
  ),
}))
vi.mock('../lib/clockIn', async (original) => ({
  ...(await original<typeof import('../lib/clockIn')>()),
  fetchClockInPlace: () => Promise.resolve(state.place),
  saveClockInPlace: (p: unknown) => {
    state.saved.push(p)
    return Promise.resolve()
  },
  saveClockInRadius: (m: number) => {
    state.radii.push(m)
    return Promise.resolve()
  },
  findPlaces: (q: string) => {
    state.found.push(q)
    return Promise.resolve([{ label: 'SW1A 1AA · Westminster', postcode: 'SW1A 1AA', lat: 51.501, lng: -0.1416 }])
  },
}))

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ClockInPlaceCard />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  state.place = null
  state.saved = []
  state.radii = []
  state.found = []
})

describe('where the church is', () => {
  it('says nobody can clock in until it is set', async () => {
    show()
    expect(await screen.findByText(/nobody can clock in until it is/)).toBeInTheDocument()
  })

  it('finds it by postcode, lets the pin be moved, and saves where the pin is', async () => {
    const user = show()
    await user.type(await screen.findByRole('textbox', { name: 'Postcode or address of the church' }), 'sw1a1aa')
    await user.click(screen.getByRole('button', { name: 'Find' }))
    expect(state.found).toEqual(['sw1a1aa'])
    expect(await screen.findByTestId('place-label')).toHaveTextContent('SW1A 1AA · Westminster')
    await user.click(await screen.findByRole('button', { name: /map at 51.5010/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(state.saved).toEqual([{ label: 'SW1A 1AA · Westminster', postcode: 'SW1A 1AA', lat: 51.5015, lng: -0.1416 }])
  })

  it('takes where the phone is, standing at the door', async () => {
    const getCurrentPosition = vi.fn((ok: PositionCallback, _fail?: PositionErrorCallback | null, _options?: PositionOptions) =>
      ok({ coords: { latitude: 51.6, longitude: -0.2, accuracy: 8 } } as GeolocationPosition),
    )
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Use where I am now' }))
    expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: true, maximumAge: 0 })
    expect(await screen.findByRole('button', { name: /map at 51.6000,-0.2000/ })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows what is saved, and how far a new pin is from it', async () => {
    state.place = { label: 'Church hall', postcode: 'SW1A 1AA', latitude: 51.501, longitude: -0.1416, updated_at: new Date().toISOString(), updater: { first_name: 'Rohit', last_name: 'K' } }
    const user = show()
    expect(await screen.findByTestId('place-label')).toHaveTextContent('Church hall')
    expect(screen.getByText(/by Rohit K/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /map at/ }))
    expect(screen.getByText('56 m from the saved spot')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save the new spot' })).toBeInTheDocument()
  })

  it('sets the radius here too, with the circle following it, and saves only that', async () => {
    state.place = { label: 'Church hall', postcode: 'SW1A 1AA', latitude: 51.501, longitude: -0.1416, updated_at: new Date().toISOString(), updater: null }
    const user = show()
    const dial = await screen.findByRole('slider', { name: 'Counts as at church within' })
    expect(dial).toHaveAttribute('aria-valuenow', '100')
    dial.focus()
    await user.keyboard('{ArrowRight}')
    expect(dial).toHaveAttribute('aria-valuenow', '110')
    expect(screen.getByRole('button', { name: /circle 110 m/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save the radius' }))
    expect(state.radii).toEqual([110])
    expect(state.saved).toEqual([])
  })
})
