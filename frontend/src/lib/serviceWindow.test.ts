import { describe, expect, it } from 'vitest'
import { isLiveNow, serviceWindows } from './serviceWindow'

const at = (hhmm: string) => `2026-08-30T${hhmm}:00.000Z`
const clock = (hhmm: string) => new Date(at(hhmm)).getTime()

const SESSIONS = [
  { service_id: 's1', start_time: at('10:00'), duration_minutes: 20 },
  { service_id: 's1', start_time: at('10:20'), duration_minutes: 40 },
  { service_id: 's2', start_time: at('18:00'), duration_minutes: 60 },
]

describe('serviceWindows', () => {
  it('spans the first session to the end of the last', () => {
    const w = serviceWindows(SESSIONS).get('s1')!
    // 10:00 less the 30-minute lead-in, 11:00 plus the 15-minute run-out.
    expect(new Date(w.from).toISOString()).toBe(at('09:30'))
    expect(new Date(w.to).toISOString()).toBe(at('11:15'))
  })

  it('ignores sessions whose time is unusable rather than dropping the service', () => {
    const w = serviceWindows([...SESSIONS, { service_id: 's1', start_time: 'not a time' }]).get('s1')!
    expect(new Date(w.from).toISOString()).toBe(at('09:30'))
  })

  it('treats a session with no duration as a moment', () => {
    const w = serviceWindows([{ service_id: 's3', start_time: at('12:00') }]).get('s3')!
    expect(new Date(w.to).toISOString()).toBe(at('12:15'))
  })
})

describe('isLiveNow', () => {
  const windows = serviceWindows(SESSIONS)

  it('is live from the lead-in to the run-out', () => {
    expect(isLiveNow('s1', windows, clock('09:45'))).toBe(true)
    expect(isLiveNow('s1', windows, clock('10:30'))).toBe(true)
    expect(isLiveNow('s1', windows, clock('11:10'))).toBe(true)
  })

  it('is not live before the doors or after the room empties', () => {
    expect(isLiveNow('s1', windows, clock('09:00'))).toBe(false)
    expect(isLiveNow('s1', windows, clock('11:30'))).toBe(false)
  })

  it('never calls a service live when nobody has planned its running order', () => {
    expect(isLiveNow('s-unplanned', windows, clock('10:30'))).toBe(false)
  })

  it('lights only the service that is on, not every service that day', () => {
    expect(isLiveNow('s2', windows, clock('10:30'))).toBe(false)
    expect(isLiveNow('s2', windows, clock('18:30'))).toBe(true)
  })
})
