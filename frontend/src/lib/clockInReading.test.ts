import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocationRefused, readBestPosition } from './clockInReading'

/*
 * Listening to the phone: the first answer is often the roughest, so it
 * keeps the best, stops early when one is plainly good, and hands over
 * what it had when the time runs out.
 */

type Success = (p: GeolocationPosition) => void
type Failure = (e: GeolocationPositionError) => void

function fakeGeolocation() {
  const calls = { success: null as Success | null, failure: null as Failure | null, cleared: 0, options: null as PositionOptions | null }
  const geolocation = {
    watchPosition: (s: Success, f: Failure, o: PositionOptions) => {
      calls.success = s
      calls.failure = f
      calls.options = o
      return 7
    },
    clearWatch: () => {
      calls.cleared += 1
    },
    getCurrentPosition: () => undefined,
  } as unknown as Geolocation
  const fix = (accuracy: number, lat = 51.5) =>
    calls.success!({ coords: { latitude: lat, longitude: -0.1, accuracy }, timestamp: Date.now() } as GeolocationPosition)
  const fail = (code: number) =>
    calls.failure!({ code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: '' } as GeolocationPositionError)
  return { geolocation, calls, fix, fail }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('listening for where the phone is', () => {
  it('asks for the precise position and nothing remembered', () => {
    const fake = fakeGeolocation()
    readBestPosition({ geolocation: fake.geolocation, neededM: 50 })
    expect(fake.calls.options).toMatchObject({ enableHighAccuracy: true, maximumAge: 0 })
  })

  it('stops at once on a plainly good reading', async () => {
    const fake = fakeGeolocation()
    const { done } = readBestPosition({ geolocation: fake.geolocation, neededM: 50 })
    fake.fix(900)
    fake.fix(8, 51.6)
    await expect(done).resolves.toMatchObject({ accuracy: 8, lat: 51.6 })
    expect(fake.calls.cleared).toBe(1)
  })

  it('waits a few seconds after a just-good-enough reading, for a better one', async () => {
    const fake = fakeGeolocation()
    const { done } = readBestPosition({ geolocation: fake.geolocation, neededM: 50, settleMs: 3000 })
    fake.fix(45)
    vi.advanceTimersByTime(1000)
    fake.fix(28)
    vi.advanceTimersByTime(2000)
    await expect(done).resolves.toMatchObject({ accuracy: 28 })
  })

  it('hands over the best it had when the time runs out, even if it is too rough', async () => {
    const fake = fakeGeolocation()
    const seen: number[] = []
    const { done } = readBestPosition({
      geolocation: fake.geolocation,
      neededM: 50,
      totalMs: 20000,
      onProgress: (latest) => seen.push(latest.accuracy),
    })
    fake.fix(300)
    fake.fix(120)
    fake.fix(500)
    vi.advanceTimersByTime(20000)
    await expect(done).resolves.toMatchObject({ accuracy: 120 })
    expect(seen).toEqual([300, 120, 500])
  })

  it('keeps listening through a timeout, and says so when nothing came at all', async () => {
    const fake = fakeGeolocation()
    const { done } = readBestPosition({ geolocation: fake.geolocation, neededM: 50, totalMs: 20000 })
    fake.fail(3)
    vi.advanceTimersByTime(20000)
    await expect(done).rejects.toEqual(new LocationRefused('nothing'))
  })

  it('stops straight away when location is blocked', async () => {
    const fake = fakeGeolocation()
    const { done } = readBestPosition({ geolocation: fake.geolocation, neededM: 50 })
    fake.fail(1)
    await expect(done).rejects.toMatchObject({ reason: 'blocked' })
  })
})
