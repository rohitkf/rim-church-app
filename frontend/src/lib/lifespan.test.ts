import { describe, expect, it } from 'vitest'
import { formatMinutes, lifespanOf } from './lifespan'
import { nextBoardClearTime } from './boardClear'

const settings = {
  board_clear_dow: 2,
  debrief_retention_days: 30,
  edit_grace_minutes: 720,
  after_service_checklist_minutes: 120,
  availability_closes_time: '23:59:00',
}

describe('how long things last', () => {
  it('says durations in words', () => {
    expect(formatMinutes(120)).toBe('2 hours')
    expect(formatMinutes(90)).toBe('1 hour 30 minutes')
    expect(formatMinutes(45)).toBe('45 minutes')
  })

  // The sentence follows App settings, so it cannot promise a day the
  // database job does not keep.
  it('reads the clear day from the settings, not a fixed Tuesday', () => {
    expect(lifespanOf('activity', settings)).toContain('Tuesday')
    expect(lifespanOf('activity', { ...settings, board_clear_dow: 1 })).toContain('Monday')
    expect(lifespanOf('planner', { ...settings, board_clear_dow: 1 })).toContain('Monday')
  })

  it('carries the numbers the church has set', () => {
    expect(lifespanOf('debriefs', settings)).toContain('30 days')
    expect(lifespanOf('checklists', settings)).toContain('2 hours longer')
    expect(lifespanOf('rota', settings)).toContain('12 hours')
    expect(lifespanOf('availability', settings)).toContain('23:59')
    expect(lifespanOf('issues', { ...settings, issue_retention_days: 14 })).toContain('14 days after it was marked done')
  })

  it('counts down to the configured day', () => {
    // Sunday 27 September 2026, midday UTC.
    const sunday = new Date(Date.UTC(2026, 8, 27, 12))
    expect(nextBoardClearTime(sunday, 2).toISOString()).toBe('2026-09-29T00:00:00.000Z')
    expect(nextBoardClearTime(sunday, 1).toISOString()).toBe('2026-09-28T00:00:00.000Z')
  })
})
