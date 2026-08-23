import { describe, expect, it } from 'vitest'
import { attendanceBarClass, attendancePercent } from './attendance'

describe('attendancePercent', () => {
  it('rounds actual/expected to a whole percent', () => {
    expect(attendancePercent(4, 11)).toBe(36)
    expect(attendancePercent(11, 11)).toBe(100)
  })

  it('treats null actual as 0', () => {
    expect(attendancePercent(null, 10)).toBe(0)
  })

  it('returns null when nothing is expected', () => {
    expect(attendancePercent(5, 0)).toBeNull()
  })
})

describe('attendanceBarClass', () => {
  it('is red at or below 40%', () => {
    expect(attendanceBarClass(0)).toBe('bg-error')
    expect(attendanceBarClass(40)).toBe('bg-error')
  })

  it('is yellow from 41% through 80%', () => {
    expect(attendanceBarClass(41)).toBe('bg-warning')
    expect(attendanceBarClass(80)).toBe('bg-warning')
  })

  it('is green above 80%', () => {
    expect(attendanceBarClass(81)).toBe('bg-success')
    expect(attendanceBarClass(100)).toBe('bg-success')
  })

  it('is neutral when percent is unknown', () => {
    expect(attendanceBarClass(null)).toBe('bg-status-pending')
  })
})
