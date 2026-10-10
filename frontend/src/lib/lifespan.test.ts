import { describe, expect, it } from 'vitest'
import { formatMinutes, lifespanOf } from './lifespan'
import { nextBoardClearTime } from './boardClear'

const settings = {
  board_clear_dow: 2,
  debrief_retention_days: 30,
  service_retention_days: 60,
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
    expect(lifespanOf('debriefs', { ...settings, debrief_retention_days: 10 })).toContain('10 days')
    expect(lifespanOf('checklists', settings)).toContain('2 hours longer')
    expect(lifespanOf('rota', settings)).toContain('12 hours')
    expect(lifespanOf('availability', settings)).toContain('23:59')
    expect(lifespanOf('issues', { ...settings, issue_retention_days: 14 })).toContain('2 weeks after a Head marks it')
    expect(lifespanOf('issues', { ...settings, issue_open_minutes_before: 30 })).toContain('from 30 minutes before a service starts until 2 hours after it ends')
  })

  it('counts down to the configured day', () => {
    // Sunday 27 September 2026, midday UTC.
    const sunday = new Date(Date.UTC(2026, 8, 27, 12))
    expect(nextBoardClearTime(sunday, 2).toISOString()).toBe('2026-09-29T00:00:00.000Z')
    expect(nextBoardClearTime(sunday, 1).toISOString()).toBe('2026-09-28T00:00:00.000Z')
  })

  /*
   * The clocks say themselves too, worded from the settings the jobs read
   * (0123, 0128). "For ever" still reads as for ever where a church can
   * choose it.
   */
  it('says when each clock clears, and says so when a church keeps something for ever', () => {
    expect(lifespanOf('team-chat', settings)).toContain('deleted 30 days after')
    expect(lifespanOf('team-chat', { ...settings, team_chat_retention_days: null })).toMatch(/Nothing here clears on its own/)
    expect(lifespanOf('updates', settings)).toContain('pinned or not')
    expect(lifespanOf('updates', { ...settings, church_update_retention_days: 30 })).toContain('ends 30 days after it is posted')
    expect(lifespanOf('polls', { ...settings, poll_retention_days: 1 })).toContain('1 day after its deadline')
    expect(lifespanOf('notifications', { ...settings, notification_keep_count: 5 })).toContain('newest 5')
    expect(lifespanOf('alerts', settings)).toContain('every Tuesday')
    expect(lifespanOf('alerts', { ...settings, alert_clear_dow: null })).toMatch(/kept until it is cleared by hand/)
  })

  /*
   * A service takes everything about it when it goes (0128), so no
   * sentence about something tied to a service may promise longer.
   */
  it('never promises a debrief, issue or rota outlives its service', () => {
    expect(lifespanOf('debriefs', { ...settings, debrief_retention_days: 30, service_retention_days: 14 })).toContain('deleted 2 weeks after their service')
    expect(lifespanOf('issues', { ...settings, issue_retention_days: 30, service_retention_days: 14 })).toContain('2 weeks after a Head marks it')
    for (const page of ['rota', 'availability', 'checklists', 'set-lists'] as const) {
      expect(lifespanOf(page, { ...settings, service_retention_days: 14 }), page).toContain('deleted with its service 2 weeks after the service date')
    }
    expect(lifespanOf('planner', { ...settings, service_retention_days: 14 })).toContain('is deleted 2 weeks after its date')
  })

  it('says how far Set Lists looks, in weeks when it is whole weeks', () => {
    expect(lifespanOf('set-lists', settings)).toContain('3 weeks either side')
    expect(lifespanOf('set-lists', { ...settings, set_list_days: 7 })).toContain('1 week either side')
    expect(lifespanOf('set-lists', { ...settings, set_list_days: 10 })).toContain('10 days either side')
  })

  it('says what happens to feedback, from the church’s own clock', () => {
    expect(lifespanOf('feedback', { ...settings, feedback_retention_days: null })).toMatch(/stays until it is taken back/)
    expect(lifespanOf('feedback', settings)).toContain('deleted 14 days after it was settled')
    expect(lifespanOf('feedback', { ...settings, feedback_retention_days: 90 })).toContain('deleted 90 days after it was settled')
  })
})
