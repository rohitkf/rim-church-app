import { describe, expect, it } from 'vitest'
import { DISPLAY_DEFAULTS, readDisplay } from './display'

describe('readDisplay', () => {
  it('is the app’s own defaults when nothing is stored', () => {
    expect(readDisplay({})).toEqual(DISPLAY_DEFAULTS)
    expect(readDisplay(null)).toEqual(DISPLAY_DEFAULTS)
    expect(readDisplay('nonsense')).toEqual(DISPLAY_DEFAULTS)
  })

  it('takes what the church chose', () => {
    const d = readDisplay({
      dashboard: { serviceDays: 3, openNext: 'always', show: { activity: false } },
      lists: { upcomingOpen: true },
      windows: { setListDays: 14 },
    })
    expect(d.dashboard.serviceDays).toBe(3)
    expect(d.dashboard.openNext).toBe('always')
    expect(d.dashboard.show.activity).toBe(false)
    expect(d.dashboard.show.teamsReady).toBe(true)
    expect(d.lists).toEqual({ upcomingOpen: true, finishedOpen: false })
    expect(d.windows.setListDays).toBe(14)
    expect(d.windows.debriefAheadDays).toBe(21)
  })

  /*
   * One bad value costs that one preference, not the page: a row edited
   * by hand, or written by a newer app, must not blank the Dashboard.
   */
  it('drops a value it does not understand, keeping everything around it', () => {
    const d = readDisplay({
      dashboard: { serviceDays: 40, openNext: 'sideways', show: { activity: 'no' } },
      lists: { finishedOpen: true, somethingNew: 1 },
      windows: { setListDays: -3, diaryPastDays: 90 },
      future: { anything: true },
    })
    expect(d.dashboard.serviceDays).toBe(1)
    expect(d.dashboard.openNext).toBe('auto')
    expect(d.dashboard.show.activity).toBe(true)
    expect(d.lists.finishedOpen).toBe(true)
    expect(d.windows.setListDays).toBe(21)
    expect(d.windows.diaryPastDays).toBe(90)
  })
})
