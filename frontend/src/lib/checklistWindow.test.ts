import { describe, expect, it } from 'vitest'
import { callTimeOn, checklistWindow, whenItOpens } from './checklistWindow'
import type { CallTimeRow } from './callTimes'

const SUNDAY = '2026-09-06'
const MEDIA = 'media'
const at = (clock: string) => new Date(`${SUNDAY}T${clock}`).getTime()

const rows: CallTimeRow[] = [
  { department_id: MEDIA, on_date: SUNDAY, call_time: '06:30:00' },
  { department_id: 'audio', on_date: SUNDAY, call_time: '08:00:00' },
  // The same team, a different week — the wrong row to answer with.
  { department_id: MEDIA, on_date: '2026-09-13', call_time: '05:00:00' },
]

describe('when a checklist opens', () => {
  it('reads the team’s own call time for that day', () => {
    expect(callTimeOn(rows, MEDIA, SUNDAY)).toBe('06:30')
    expect(callTimeOn(rows, 'audio', SUNDAY)).toBe('08:00')
  })

  it('does not answer with another day’s call time', () => {
    expect(callTimeOn(rows, MEDIA, '2026-09-20')).toBeNull()
  })

  it('is shut before the call time and open from it', () => {
    const before = checklistWindow({
      serviceDate: SUNDAY,
      departmentId: MEDIA,
      callTimes: rows,
      now: at('06:29:59'),
    })
    expect(before.open).toBe(false)
    expect(before.clock).toBe('06:30')

    const on = checklistWindow({
      serviceDate: SUNDAY,
      departmentId: MEDIA,
      callTimes: rows,
      now: at('06:30:00'),
    })
    expect(on.open).toBe(true)
  })

  it('holds each team to its own time on the same morning', () => {
    const now = at('07:00')
    expect(checklistWindow({ serviceDate: SUNDAY, departmentId: MEDIA, callTimes: rows, now }).open).toBe(true)
    expect(checklistWindow({ serviceDate: SUNDAY, departmentId: 'audio', callTimes: rows, now }).open).toBe(false)
  })

  it('falls back to seven o’clock for a team nobody has set', () => {
    const w = checklistWindow({
      serviceDate: SUNDAY,
      departmentId: 'worship',
      callTimes: rows,
      now: at('06:59'),
    })
    expect(w.clock).toBe('07:00')
    expect(w.isDefaultCallTime).toBe(true)
    expect(w.open).toBe(false)
    expect(
      checklistWindow({ serviceDate: SUNDAY, departmentId: 'worship', callTimes: rows, now: at('07:01') }).open,
    ).toBe(true)
  })

  it('is shut the day before, whatever the hour', () => {
    const w = checklistWindow({
      serviceDate: SUNDAY,
      departmentId: MEDIA,
      callTimes: rows,
      now: new Date('2026-09-05T23:59:00').getTime(),
    })
    expect(w.open).toBe(false)
  })

  it('is open to an Admin, who has a service to put right', () => {
    const w = checklistWindow({
      serviceDate: SUNDAY,
      departmentId: MEDIA,
      callTimes: rows,
      now: new Date('2026-09-01T09:00:00').getTime(),
      alwaysOpen: true,
    })
    expect(w.open).toBe(true)
    // The clock still says when everybody else gets in.
    expect(w.clock).toBe('06:30')
  })

  it('says when it opens in the words the team uses', () => {
    const w = checklistWindow({ serviceDate: SUNDAY, departmentId: MEDIA, callTimes: rows, now: 0 })
    expect(whenItOpens(w, 'Sunday, 6 September')).toBe(
      'This checklist opens at 06:30 on Sunday, 6 September, when your team is called in.',
    )
  })
})
