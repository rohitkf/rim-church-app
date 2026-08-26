import { describe, expect, it } from 'vitest'
import { DEFAULT_DEPT_COLOR, deptBadgeStyle } from './deptBadge'

describe('deptBadgeStyle', () => {
  it('uses the department color as text with a tinted background', () => {
    expect(deptBadgeStyle('#e11d48')).toEqual({ backgroundColor: '#e11d4826', color: '#e11d48' })
  })

  it('falls back to the neutral tone when no color is set', () => {
    expect(deptBadgeStyle(null)).toEqual({
      backgroundColor: `${DEFAULT_DEPT_COLOR}26`,
      color: DEFAULT_DEPT_COLOR,
    })
  })
})
