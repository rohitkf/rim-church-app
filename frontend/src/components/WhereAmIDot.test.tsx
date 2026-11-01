import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { WhereAmIDot } from './WhereAmIDot'

const Dot = () => (
  <MemoryRouter>
    <WhereAmIDot />
  </MemoryRouter>
)

/*
 * Opening the app reads the phone once and asks whether that is at
 * church; a tap shows how far and how sure, and checks again.
 */

const state = vi.hoisted(() => ({ asked: [] as unknown[], answer: { state: 'in', distance_m: 30, radius_m: 100, accuracy_m: 12, needed_m: 50 } as Record<string, unknown> }))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'me' } } }) }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (name: string, args: { lat: number; lng: number; accuracy: number }) => {
      state.asked.push([name, args.lat, args.lng, args.accuracy])
      return Promise.resolve({ data: state.answer, error: null })
    },
  },
}))

let options: PositionOptions[] = []
function phone(result: 'fix' | 'denied') {
  options = []
  const getCurrentPosition = (ok: PositionCallback, fail?: PositionErrorCallback | null, o?: PositionOptions) => {
    options.push(o ?? {})
    if (result === 'fix') ok({ coords: { latitude: 51.5, longitude: -0.12, accuracy: 12 }, timestamp: Date.now() } as GeolocationPosition)
    else fail?.({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: '' } as GeolocationPositionError)
  }
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
}

beforeEach(() => {
  state.asked = []
  state.answer = { state: 'in', distance_m: 30, radius_m: 100, accuracy_m: 12, needed_m: 50 }
})
afterEach(() => {
  Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true })
})

describe('the at-church dot on the Dashboard', () => {
  it('reads the phone on opening and says it is at church', async () => {
    phone('fix')
    render(<Dot />)
    expect(await screen.findByText('At church')).toBeInTheDocument()
    expect(state.asked).toEqual([['clock_in_where_am_i', 51.5, -0.12, 12]])
    expect(options[0]).toMatchObject({ enableHighAccuracy: true })
  })

  it('shows how far and how sure on a tap, and checks again with a fresh reading', async () => {
    phone('fix')
    const user = userEvent.setup()
    render(<Dot />)
    await user.click(await screen.findByRole('button', { name: /At church/ }))
    expect(screen.getByText('30 m from church · ± 12 m. CLOCK IN will work here.')).toBeInTheDocument()
    state.answer = { state: 'out', distance_m: 2300, radius_m: 100, accuracy_m: 20, needed_m: 50 }
    await user.click(screen.getByRole('button', { name: 'Check again' }))
    expect(await screen.findByText('Not at church')).toBeInTheDocument()
    expect(options[1]).toMatchObject({ maximumAge: 0 })
  })

  it('says location is blocked, and asks nothing of the database', async () => {
    phone('denied')
    render(<Dot />)
    expect(await screen.findByText('Location blocked')).toBeInTheDocument()
    expect(state.asked).toEqual([])
  })

  it('offers Allow location when blocked, which asks the phone again, and the steps', async () => {
    phone('denied')
    const user = userEvent.setup()
    render(<Dot />)
    await user.click(await screen.findByRole('button', { name: /Location blocked/ }))
    expect(screen.getByRole('link', { name: 'How to allow it' })).toHaveAttribute('href', '/location')
    phone('fix')
    await user.click(screen.getByRole('button', { name: 'Allow location' }))
    expect(await screen.findByText('At church')).toBeInTheDocument()
    expect(options[0]).toMatchObject({ maximumAge: 0 })
  })
})
